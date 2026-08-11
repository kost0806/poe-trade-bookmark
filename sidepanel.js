const STORAGE_KEY = 'bookmarks';

const statusEl = document.getElementById('status');
const formEl = document.getElementById('add-form');
const titleEl = document.getElementById('title');
const targetEl = document.getElementById('target');
const addBtn = document.getElementById('add-btn');
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const countEl = document.getElementById('count');

let current = null; // 현재 탭에서 파싱한 거래소 검색 정보
let renderedUrl; // 폼에 이미 반영해 둔 URL (불필요한 재렌더 방지)
let panelWindowId; // 이 사이드 패널이 속한 창

async function getBookmarks() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
}

async function setBookmarks(bookmarks) {
  await chrome.storage.local.set({ [STORAGE_KEY]: bookmarks });
}

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = kind ? `status ${kind}` : 'status';
  statusEl.hidden = !message;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * 이미 거래소를 보고 있다면 그 탭에서 바로 이동하고,
 * 다른 페이지를 보고 있었다면 그 페이지를 잃지 않도록 새 탭에서 연다.
 */
async function openBookmark(bookmark) {
  const [tab] = await chrome.tabs.query({ active: true, windowId: panelWindowId });
  if (tab && parseTradeUrl(tab.url ?? '')) {
    await chrome.tabs.update(tab.id, { url: bookmark.url });
  } else {
    await chrome.tabs.create({ url: bookmark.url, windowId: panelWindowId });
  }
}

function renderList(bookmarks) {
  listEl.textContent = '';
  countEl.textContent = bookmarks.length ? `(${bookmarks.length})` : '';
  emptyEl.hidden = bookmarks.length > 0;

  for (const bookmark of bookmarks) {
    const li = document.createElement('li');

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'item-open';
    open.title = bookmark.url;

    const title = document.createElement('span');
    title.className = 'item-title';
    title.textContent = bookmark.title;

    const meta = document.createElement('span');
    meta.className = 'item-meta';
    meta.textContent = `${bookmark.league} · ${
      bookmark.mode === 'exchange' ? '대량거래' : '검색'
    } · ${formatDate(bookmark.createdAt)}`;

    open.append(title, meta);
    open.addEventListener('click', () => openBookmark(bookmark));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'item-delete';
    del.textContent = '삭제';
    del.title = '북마크 삭제';
    del.addEventListener('click', async () => {
      const remaining = (await getBookmarks()).filter((b) => b.id !== bookmark.id);
      await setBookmarks(remaining);
    });

    li.append(open, del);
    listEl.append(li);
  }
}

async function renderForm() {
  addBtn.disabled = false;
  addBtn.textContent = '북마크 추가';

  if (!current) {
    setStatus('PoE 거래소 검색 페이지를 열면 여기에 저장할 수 있습니다.', 'error');
    formEl.hidden = true;
    return;
  }

  if (!current.searchId) {
    setStatus('검색을 실행한 뒤(주소에 검색 ID가 생긴 뒤) 저장해 주세요.', 'error');
    formEl.hidden = true;
    return;
  }

  formEl.hidden = false;
  targetEl.textContent = current.url;

  const saved = (await getBookmarks()).find((b) => b.url === current.url);
  if (saved) {
    setStatus('이미 저장된 검색입니다.', null);
    titleEl.value = saved.title;
    addBtn.disabled = true;
    addBtn.textContent = '저장됨';
  } else {
    setStatus('', null);
    titleEl.value = suggestTitle(current);
  }
}

/** 현재 탭을 다시 읽어 폼을 갱신한다. URL이 그대로면 입력 중인 이름을 보존한다. */
async function refresh({ force = false } = {}) {
  const [tab] = await chrome.tabs.query({ active: true, windowId: panelWindowId });
  current = parseTradeUrl(tab?.url ?? '');

  const key = current ? current.url : null;
  if (!force && key === renderedUrl) return;
  renderedUrl = key;
  await renderForm();
}

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!current) return;

  const bookmarks = await getBookmarks();
  if (bookmarks.some((b) => b.url === current.url)) {
    await renderForm();
    return;
  }

  const bookmark = {
    id: crypto.randomUUID(),
    title: titleEl.value.trim() || suggestTitle(current),
    url: current.url,
    league: current.league,
    mode: current.mode,
    searchId: current.searchId,
    createdAt: Date.now(),
  };

  // 저장 결과는 storage.onChanged에서 목록에 반영된다.
  addBtn.disabled = true;
  addBtn.textContent = '저장됨';
  setStatus('북마크를 추가했습니다.', 'ok');
  await setBookmarks([bookmark, ...bookmarks]);
});

// 탭 전환
chrome.tabs.onActivated.addListener((info) => {
  if (info.windowId === panelWindowId) refresh();
});

// 주소 변경 — 거래소는 SPA라 검색을 다시 실행해도 onUpdated로 들어온다.
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active && tab.windowId === panelWindowId) refresh();
});

// 다른 창의 패널에서 추가/삭제한 내용도 즉시 반영한다.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEY]) return;
  const bookmarks = changes[STORAGE_KEY].newValue ?? [];
  renderList(bookmarks);

  // 현재 검색의 저장 여부가 버튼 상태와 어긋나면 폼을 다시 그린다.
  const saved = current ? bookmarks.some((b) => b.url === current.url) : false;
  if (saved !== addBtn.disabled) renderForm();
});

(async function init() {
  panelWindowId = (await chrome.windows.getCurrent()).id;
  renderList(await getBookmarks());
  await refresh({ force: true });
})();
