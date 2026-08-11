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
    open.addEventListener('click', () => {
      chrome.tabs.create({ url: bookmark.url });
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'item-delete';
    del.textContent = '삭제';
    del.title = '북마크 삭제';
    del.addEventListener('click', async () => {
      const remaining = (await getBookmarks()).filter((b) => b.id !== bookmark.id);
      await setBookmarks(remaining);
      renderList(remaining);
    });

    li.append(open, del);
    listEl.append(li);
  }
}

async function initCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  current = parseTradeUrl(tab?.url ?? '');

  if (!current) {
    setStatus('PoE 거래소 검색 페이지가 아닙니다.', 'error');
    formEl.hidden = true;
    return;
  }

  if (!current.searchId) {
    setStatus('검색을 실행한 뒤(주소에 검색 ID가 생긴 뒤) 저장해 주세요.', 'error');
    formEl.hidden = true;
    return;
  }

  setStatus('', null);
  formEl.hidden = false;
  titleEl.value = suggestTitle(current);
  targetEl.textContent = current.url;
  titleEl.focus();
  titleEl.select();
}

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!current) return;

  const bookmarks = await getBookmarks();
  if (bookmarks.some((b) => b.url === current.url)) {
    setStatus('이미 저장된 검색입니다.', 'error');
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

  const updated = [bookmark, ...bookmarks];
  await setBookmarks(updated);
  renderList(updated);

  setStatus('북마크를 추가했습니다.', 'ok');
  addBtn.disabled = true;
  addBtn.textContent = '추가됨';
});

(async function init() {
  renderList(await getBookmarks());
  await initCurrentTab();
})();
