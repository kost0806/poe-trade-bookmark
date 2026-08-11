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
let savedBookmark = null; // 현재 검색이 이미 저장돼 있다면 그 북마크
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

/** 저장된 검색이면 '이름 변경', 아니면 '북마크 추가'. 바뀔 내용이 없으면 잠근다. */
function syncButton() {
  const name = titleEl.value.trim();
  if (savedBookmark) {
    addBtn.textContent = '이름 변경';
    addBtn.disabled = name === '' || name === savedBookmark.title;
  } else {
    addBtn.textContent = '북마크 추가';
    addBtn.disabled = false;
  }
}

async function renderForm() {
  savedBookmark = null;
  syncButton();

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

  savedBookmark = (await getBookmarks()).find((b) => b.url === current.url) ?? null;
  if (savedBookmark) {
    setStatus('이미 저장된 검색입니다. 이름을 고치면 바꿀 수 있습니다.', null);
    titleEl.value = savedBookmark.title;
  } else {
    setStatus('', null);
    titleEl.value = suggestTitle(current);
  }
  syncButton();
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

titleEl.addEventListener('input', syncButton);

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!current) return;

  const bookmarks = await getBookmarks();
  const existing = bookmarks.find((b) => b.url === current.url);
  const name = titleEl.value.trim() || suggestTitle(current);

  let updated;
  let record;
  let message;

  if (existing) {
    if (name === existing.title) return;
    // 같은 검색을 다시 저장하면 새로 추가하지 않고 이름만 바꾼다.
    record = { ...existing, title: name, updatedAt: Date.now() };
    updated = bookmarks.map((b) => (b.id === existing.id ? record : b));
    message = `이름을 "${name}"(으)로 바꿨습니다.`;
  } else {
    record = {
      id: crypto.randomUUID(),
      title: name,
      url: current.url,
      league: current.league,
      mode: current.mode,
      searchId: current.searchId,
      createdAt: Date.now(),
    };
    updated = [record, ...bookmarks];
    message = '북마크를 추가했습니다.';
  }

  // 저장 전에 상태를 맞춰 둬야 storage.onChanged가 폼을 다시 그리지 않고,
  // 아래 안내 문구가 그대로 남는다. 목록 갱신은 onChanged가 처리한다.
  savedBookmark = record;
  syncButton();
  setStatus(message, 'ok');
  await setBookmarks(updated);
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

  // 저장 상태가 폼에 반영된 것과 달라졌을 때만 다시 그린다.
  const match = current ? bookmarks.find((b) => b.url === current.url) ?? null : null;
  const inSync =
    match?.id === savedBookmark?.id && match?.title === savedBookmark?.title;
  if (!inSync) renderForm();
});

(async function init() {
  panelWindowId = (await chrome.windows.getCurrent()).id;
  renderList(await getBookmarks());
  await refresh({ force: true });
})();
