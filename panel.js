/*
 * 거래소 페이지 안에 직접 붙는 북마크 패널.
 *
 * 크롬 사이드 패널은 탭을 옮겨도 계속 떠 있어서, 거래소를 벗어나면 방해가 됐다.
 * 그래서 콘텐츠 스크립트로 페이지에 심고, 페이지를 떠나면 같이 사라지게 한다.
 * 거래소의 CSS와 섞이지 않도록 Shadow DOM 안에서 그린다.
 */

const STORAGE_KEY = 'bookmarks';
const BUILDER_KEY = 'builder';
const LEAGUE_CACHE_KEY = 'leagues';
const PENDING_KEY = 'pending';
const PANEL_OPEN_KEY = 'panelOpen';

const HOST_ID = 'poe-trade-bookmark-root';

// 칸의 폭. 패널 자신의 width이자, 페이지를 밀어낼 거리이기도 하다.
// 창이 좁을 때 거래소가 완전히 가려지지 않도록 절반까지만 차지한다.
const PANEL_WIDTH = 'min(360px, 50vw)';

const PANEL_HTML = `
  <button type="button" class="toggle" id="toggle"></button>

  <div class="panel" id="panel" hidden>
    <div class="body">
      <h1>PoE Trade Bookmark</h1>

      <section class="card">
        <p id="status" class="status">현재 페이지를 확인하는 중…</p>

        <form id="add-form" hidden>
          <label for="title">이름</label>
          <input id="title" type="text" maxlength="80" autocomplete="off" placeholder="북마크 이름" />
          <p id="target" class="target"></p>
          <button type="submit" id="add-btn">북마크 추가</button>
        </form>
      </section>

      <section class="card">
        <h2>
          <button type="button" id="builder-toggle" class="section-toggle">
            <span id="builder-arrow">▶</span> 16T 8모드 검색 만들기
          </button>
        </h2>

        <div id="builder" hidden>
          <div class="row">
            <select id="league" title="리그"></select>
            <select id="preset" title="프리셋"></select>
            <button type="button" id="preset-none" class="mini">해제</button>
          </div>
          <p id="preset-desc" class="target"></p>

          <input id="mod-search" type="text" autocomplete="off" placeholder="맵모드 검색 (예: 반사, 재생)" />

          <div id="mod-list" class="mod-list"></div>

          <label for="regex-out">
            인게임 정규식 <span id="regex-len" class="count"></span>
          </label>
          <div class="row">
            <input id="regex-out" type="text" readonly placeholder="거를 모드를 선택하세요" />
            <button type="button" id="copy-regex" class="mini">복사</button>
          </div>

          <button type="button" id="run-search">거래소 검색 만들기</button>
          <p id="builder-status" class="status" hidden></p>
        </div>
      </section>

      <section class="card list-card">
        <h2>저장된 북마크 <span id="count" class="count"></span></h2>
        <ul id="list" class="list"></ul>
        <p id="empty" class="status" hidden>아직 저장된 북마크가 없습니다.</p>
      </section>
    </div>
  </div>
`;

/* ---------------- 패널 심기 ---------------- */

const host = document.createElement('div');
host.id = HOST_ID;
// 화면 오른쪽 끝에 세로로 꽉 차게 세운다. 위치/쌓임 순서는 거래소 CSS에 밀리지
// 않도록 인라인으로 못 박고, 스타일이 붙기 전의 맨 얼굴은 잠깐 숨겨 둔다.
host.style.cssText =
  'position:fixed;top:0;right:0;bottom:0;z-index:2147483647;margin:0;padding:0;border:0;width:auto;display:none;';

const root = host.attachShadow({ mode: 'open' });

const wrapEl = document.createElement('div');
wrapEl.className = 'wrap';
// 폭은 여기 한 곳에서만 정한다. .wrap의 all:initial에 지워지지 않도록 인라인으로 준다.
wrapEl.style.setProperty('--panel-width', PANEL_WIDTH);
wrapEl.innerHTML = PANEL_HTML;

root.append(wrapEl);
// body는 거래소가 통째로 갈아끼울 수 있으므로 documentElement에 붙인다.
document.documentElement.append(host);

/**
 * panel.css를 읽어 그림자 트리에만 붙인다.
 * <link>나 <style>은 거래소의 CSP(style-src)에 막힐 수 있지만, 코드로 만든
 * 스타일시트는 문서에 로드되는 리소스가 아니라서 그 영향을 받지 않는다.
 */
async function applyStyles() {
  try {
    const css = await (await fetch(chrome.runtime.getURL('panel.css'))).text();
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
  } catch (e) {
    // 스타일을 못 읽어도 패널은 쓸 수 있어야 한다. 모양만 포기하고 계속 간다.
    console.warn('PoE Trade Bookmark: 스타일을 불러오지 못했습니다.', e);
  }
  host.style.display = '';
}

// 거래소의 전역 단축키가 패널 입력을 가로채지 않도록 키 이벤트를 여기서 끊는다.
for (const type of ['keydown', 'keyup', 'keypress']) {
  host.addEventListener(type, (event) => event.stopPropagation());
}

const $ = (id) => root.getElementById(id);

const toggleEl = $('toggle');
const panelEl = $('panel');
const statusEl = $('status');
const formEl = $('add-form');
const titleEl = $('title');
const targetEl = $('target');
const addBtn = $('add-btn');
const listEl = $('list');
const emptyEl = $('empty');
const countEl = $('count');

/* ---------------- 열기 / 접기 ---------------- */

/**
 * 칸이 거래소 화면을 덮지 않도록 문서 자체를 그만큼 밀어낸다.
 * 거래소가 margin을 따로 주더라도 이기도록 !important로 얹는다.
 */
function pushPage(open) {
  const html = document.documentElement.style;
  if (open) html.setProperty('margin-right', PANEL_WIDTH, 'important');
  else html.removeProperty('margin-right');
}

function renderPanel() {
  const open = !panelEl.hidden;
  wrapEl.classList.toggle('open', open);
  // 라벨 없이 화살표만 — 여는 쪽(왼쪽), 접는 쪽(오른쪽)을 그대로 가리킨다.
  toggleEl.textContent = open ? '▶' : '◀';
  toggleEl.title = open ? '북마크 사이드바 접기' : '북마크 사이드바 열기';
  toggleEl.setAttribute('aria-label', toggleEl.title);
  toggleEl.setAttribute('aria-expanded', String(open));
  pushPage(open);
}

async function setPanelOpen(open) {
  panelEl.hidden = !open;
  renderPanel();
  await chrome.storage.local.set({ [PANEL_OPEN_KEY]: open });
}

toggleEl.addEventListener('click', () => setPanelOpen(panelEl.hidden));

/* ---------------- 북마크 ---------------- */

let current = null; // 현재 페이지에서 파싱한 거래소 검색 정보
let savedBookmark = null; // 현재 검색이 이미 저장돼 있다면 그 북마크
let renderedUrl; // 폼에 이미 반영해 둔 URL (불필요한 재렌더 방지)
let rendering = false; // 폼을 그리는 중 (watchSearch가 끼어들지 않게)

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

/** 패널이 거래소 안에서만 살아 있으므로 항상 이 탭에서 그대로 이동한다. */
function openBookmark(bookmark) {
  location.assign(bookmark.url);
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

    li.append(open);

    if (bookmark.regex) {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'item-delete';
      copy.textContent = '정규식';
      copy.title = `인게임 정규식 복사\n${bookmark.regex}`;
      copy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(bookmark.regex);
        copy.textContent = '복사됨';
        setTimeout(() => (copy.textContent = '정규식'), 1200);
      });
      li.append(copy);
    }

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'item-delete';
    del.textContent = '삭제';
    del.title = '북마크 삭제';
    del.addEventListener('click', async () => {
      const remaining = (await getBookmarks()).filter((b) => b.id !== bookmark.id);
      await setBookmarks(remaining);
    });

    li.append(del);
    listEl.append(li);
  }
}

// 거래소가 폼을 채우기 전에 읽을 수 있다(북마크 링크로 새로 열었을 때). 페이지를
// 훑는 것뿐이라 비용이 거의 없으니, 값이 보일 때까지 잠깐 다시 본다.
const FILL_RETRY_MS = 250;
const FILL_TRIES = 8;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let filledName = null; // 우리가 채워 둔 추천 이름
let nameTouched = false; // 사용자가 이름 칸을 직접 고쳤는지

/**
 * 검색창·필터에서 뽑은 이름으로 기본값을 바꿔 준다. (titleFromSearchPane은 search-name.js)
 * 끝까지 못 뽑으면 검색 ID로 만든 이름이 그대로 남는다.
 */
async function fillTitle(parsed) {
  for (let i = 0; i < FILL_TRIES; i++) {
    // 그 사이 페이지가 바뀌었거나 사용자가 이름을 고쳤으면 건드리지 않는다.
    if (current?.url !== parsed.url || nameTouched) return;

    const title = titleFromSearchPane(document);
    if (title) {
      filledName = title;
      titleEl.value = title;
      syncButton();
      return;
    }
    await sleep(FILL_RETRY_MS);
  }
}

/**
 * 검색 내용이 바뀌면 추천 이름을 다시 채운다.
 *
 * 거래소는 조건이 같으면 같은 검색 ID를 돌려주므로, 다시 검색해도 주소가 그대로일
 * 수 있다. 주소만 보고 있으면 그때 추천을 놓친다. 그래서 폼에서 뽑은 이름이
 * 달라졌는지도 같이 본다. 검색이 바뀐 것이므로 입력해 둔 이름보다 우선한다.
 */
function watchSearch() {
  if (rendering || formEl.hidden || savedBookmark) return;
  if (pending && pending.url === current?.url) return;
  // 아직 한 번도 못 채웠으면 사용자가 적어 둔 이름을 건드리지 않는다.
  // (거래소가 폼을 채우는 중일 수 있어 '없음 → 있음'은 검색이 바뀐 게 아니다.)
  if (filledName === null) return;

  const name = titleFromSearchPane(document);
  if (!name || name === filledName) return;

  filledName = name;
  titleEl.value = name;
  nameTouched = false;
  syncButton();
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
  // 폼을 새로 그리는 동안에는 입력 흔적과 채워 둔 이름을 초기화한다.
  filledName = null;
  nameTouched = false;
  syncButton();

  if (!current) {
    setStatus('거래소 검색 페이지에서 저장할 수 있습니다.', 'error');
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
  } else if (pending && pending.url === current.url) {
    // 방금 8모드 빌더로 만든 검색 — 이름과 정규식을 미리 채워 둔다.
    setStatus('저장하면 인게임 정규식도 함께 보관됩니다.', null);
    titleEl.value = pending.title;
  } else {
    setStatus('', null);
    // 우선 검색 ID로 이름을 채워 두고, 검색창의 아이템 이름을 알아내면 그걸로 바꾼다.
    titleEl.value = suggestTitle(current);
    syncButton();
    await fillTitle(current);
    return;
  }
  syncButton();
}

/** 현재 주소를 다시 읽어 폼을 갱신한다. URL이 그대로면 입력 중인 이름을 보존한다. */
async function refresh({ force = false } = {}) {
  current = parseTradeUrl(location.href);

  const key = current ? current.url : null;
  if (!force && key === renderedUrl) return;
  renderedUrl = key;

  // 그리는 중에는 watchSearch가 끼어들지 않게 한다.
  rendering = true;
  try {
    await renderForm();
  } finally {
    rendering = false;
  }
}

titleEl.addEventListener('input', () => {
  nameTouched = true;
  syncButton();
});

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
    const built = pending && pending.url === current.url ? pending : null;
    record = {
      id: crypto.randomUUID(),
      title: name,
      url: current.url,
      league: current.league,
      mode: current.mode,
      searchId: current.searchId,
      createdAt: Date.now(),
      // 8모드 빌더로 만든 검색이면 인게임 정규식을 같이 저장한다.
      ...(built ? { regex: built.regex } : {}),
    };
    updated = [record, ...bookmarks];
    message = '북마크를 추가했습니다.';
    if (built) await clearPending();
  }

  // 저장 전에 상태를 맞춰 둬야 storage.onChanged가 폼을 다시 그리지 않고,
  // 아래 안내 문구가 그대로 남는다. 목록 갱신은 onChanged가 처리한다.
  savedBookmark = record;
  syncButton();
  setStatus(message, 'ok');
  await setBookmarks(updated);
});

// 거래소는 SPA라 주소만 바뀌는 이동이 잦다. 이벤트로 다 잡히지 않아 주기적으로도 확인한다.
let lastHref = location.href;
function watchUrl() {
  if (location.href === lastHref) return;
  lastHref = location.href;
  refresh();
}
window.addEventListener('popstate', watchUrl);
window.addEventListener('hashchange', watchUrl);
setInterval(() => {
  watchUrl();
  watchSearch();
}, 500);

// 다른 탭에서 추가/삭제한 내용도 즉시 반영한다.
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

/* ---------------- 16T 8모드 검색 만들기 ---------------- */

// DEFAULT_LEAGUE / REGEX_MAX / buildRegex / buildSearchQuery 는 trade-query.js 전역
const FALLBACK_LEAGUES = [{ id: 'Allflame', text: '올플레임' }, { id: 'Standard', text: 'Standard' }];
// 계정 한도가 5초당 3회다. 버튼 연타로 한도를 태우지 않도록 최소 간격을 둔다.
const SEARCH_COOLDOWN_MS = 2500;
// 만든 검색으로 이동하면 페이지가 다시 로드된다. 그 사이 정규식을 잃지 않도록
// 스토리지에 잠깐 맡겨 두고, 오래된 값은 무시한다.
const PENDING_TTL_MS = 10 * 60 * 1000;

const builderEl = $('builder');
const builderToggle = $('builder-toggle');
const builderArrow = $('builder-arrow');
const leagueEl = $('league');
const modSearchEl = $('mod-search');
const modListEl = $('mod-list');
const regexOutEl = $('regex-out');
const regexLenEl = $('regex-len');
const runSearchBtn = $('run-search');
const builderStatusEl = $('builder-status');
const presetEl = $('preset');
const presetDescEl = $('preset-desc');

const selected = new Set(); // 거를 모드 키
let lastSearchAt = 0;
let pending = null; // 방금 만든 검색 {url, title, regex, at}

const modKey = (mod) => mod.ids.join(',');
const selectedMods = () => MAP_MODS.filter((m) => selected.has(modKey(m)));

function setBuilderStatus(message, kind) {
  builderStatusEl.textContent = message;
  builderStatusEl.className = kind ? `status ${kind}` : 'status';
  builderStatusEl.hidden = !message;
}

async function loadPending() {
  const saved = (await chrome.storage.local.get(PENDING_KEY))[PENDING_KEY];
  if (!saved || Date.now() - saved.at > PENDING_TTL_MS) return null;
  return saved;
}

async function savePending(value) {
  pending = value;
  await chrome.storage.local.set({ [PENDING_KEY]: value });
}

async function clearPending() {
  pending = null;
  await chrome.storage.local.remove(PENDING_KEY);
}

function renderMods() {
  const q = modSearchEl.value.trim();
  modListEl.textContent = '';

  let group = null;
  for (const mod of MAP_MODS) {
    if (q && !mod.text.includes(q) && !mod.affix.includes(q)) continue;

    if (mod.group !== group) {
      group = mod.group;
      const head = document.createElement('div');
      head.className = 'mod-group';
      head.textContent = group;
      modListEl.append(head);
    }

    const key = modKey(mod);
    const label = document.createElement('label');
    label.className = 'mod-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selected.has(key);
    cb.addEventListener('change', () => {
      cb.checked ? selected.add(key) : selected.delete(key);
      updateRegex();
      saveBuilderState();
    });

    const text = document.createElement('span');
    text.textContent = mod.text.split('\n')[0];
    const kw = document.createElement('span');
    kw.className = 'kw';
    kw.textContent = ` (${mod.regex})`;
    text.append(kw);

    label.append(cb, text);
    modListEl.append(label);
  }
}

function updateRegex() {
  const regex = buildRegex(selectedMods());
  regexOutEl.value = regex;
  regexLenEl.textContent = regex ? `${regex.length} / ${REGEX_MAX}` : '';
  regexLenEl.className = regex.length > REGEX_MAX ? 'count over' : 'count';
  runSearchBtn.textContent = selected.size
    ? `거래소 검색 만들기 (${selected.size}개 거름)`
    : '거래소 검색 만들기';
}

async function saveBuilderState() {
  await chrome.storage.local.set({
    [BUILDER_KEY]: { selected: [...selected], league: leagueEl.value, open: !builderEl.hidden },
  });
}

async function loadLeagues() {
  const origin = location.origin;
  const cached = (await chrome.storage.local.get(LEAGUE_CACHE_KEY))[LEAGUE_CACHE_KEY];
  if (cached && cached.origin === origin && Date.now() - cached.at < 24 * 3600 * 1000) {
    return cached.leagues;
  }
  try {
    const res = await fetch(`${origin}/api/trade/data/leagues`, { credentials: 'include' });
    const body = await res.json();
    const leagues = body.result.filter((l) => l.realm === 'pc').map((l) => ({ id: l.id, text: l.text || l.id }));
    await chrome.storage.local.set({ [LEAGUE_CACHE_KEY]: { origin, at: Date.now(), leagues } });
    return leagues;
  } catch {
    return FALLBACK_LEAGUES;
  }
}

async function runSearch() {
  const mods = selectedMods();
  const wait = SEARCH_COOLDOWN_MS - (Date.now() - lastSearchAt);
  if (wait > 0) {
    setBuilderStatus(`거래소 요청 제한 때문에 ${Math.ceil(wait / 1000)}초 후에 다시 눌러주세요.`, 'error');
    return;
  }

  const origin = location.origin;
  // 리그 목록을 못 불러온 상황에서도 빈 주소로 요청하지 않도록 한다.
  const league = leagueEl.value || DEFAULT_LEAGUE;
  const query = buildSearchQuery({ modIds: mods.flatMap((m) => m.ids) });

  runSearchBtn.disabled = true;
  setBuilderStatus('거래소에 검색을 등록하는 중…', null);
  lastSearchAt = Date.now();

  try {
    const res = await fetch(`${origin}/api/trade/search/${encodeURIComponent(league)}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });

    if (res.status === 429) {
      const retry = res.headers.get('Retry-After');
      setBuilderStatus(`거래소 요청 한도 초과. ${retry ?? '잠시'}초 후 다시 시도하세요.`, 'error');
      return;
    }
    if (!res.ok) {
      setBuilderStatus(`검색 실패 (HTTP ${res.status}). 거래소 로그인 상태를 확인하세요.`, 'error');
      return;
    }

    const body = await res.json();
    if (!body.id) {
      setBuilderStatus(`검색 실패: ${body.error?.message ?? '알 수 없는 응답'}`, 'error');
      return;
    }

    const url = `${origin}/trade/search/${encodeURIComponent(league)}/${body.id}`;
    // 이동하면 이 스크립트도 다시 시작하므로 먼저 맡겨 두고 움직인다.
    await savePending({
      url,
      title: `16T 8모드 (${mods.length}개 거름)`,
      regex: buildRegex(mods),
      at: Date.now(),
    });
    setBuilderStatus(`검색 결과 ${body.total ?? 0}개. 검색 결과로 이동합니다…`, 'ok');
    location.assign(url);
  } catch (e) {
    setBuilderStatus(`요청 중 오류: ${e.message}`, 'error');
  } finally {
    runSearchBtn.disabled = false;
  }
}

builderToggle.addEventListener('click', () => {
  builderEl.hidden = !builderEl.hidden;
  builderArrow.textContent = builderEl.hidden ? '▶' : '▼';
  saveBuilderState();
});

modSearchEl.addEventListener('input', renderMods);
leagueEl.addEventListener('change', saveBuilderState);
runSearchBtn.addEventListener('click', runSearch);

function applyPreset(id) {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return;

  selected.clear();
  // keys가 없는 프리셋은 map-mods.js의 rec 플래그를 쓴다.
  const keys = preset.keys ?? MAP_MODS.filter((m) => m.rec).map(modKey);
  const known = new Set(MAP_MODS.map(modKey));
  let missing = 0;
  for (const key of keys) {
    if (known.has(key)) selected.add(key);
    else missing++;
  }

  renderMods();
  updateRegex();
  saveBuilderState();
  setBuilderStatus(
    missing
      ? `${preset.label}: ${selected.size}개 적용 (모드 목록에 없는 ${missing}개는 건너뜀)`
      : `${preset.label}: ${selected.size}개 적용`,
    missing ? 'error' : 'ok'
  );
}

presetEl.addEventListener('change', () => {
  applyPreset(presetEl.value);
  const preset = PRESETS.find((p) => p.id === presetEl.value);
  presetDescEl.textContent = preset?.desc ?? '';
});

$('preset-none').addEventListener('click', () => {
  selected.clear();
  presetEl.value = '';
  presetDescEl.textContent = '';
  renderMods();
  updateRegex();
  saveBuilderState();
  setBuilderStatus('', null);
});

$('copy-regex').addEventListener('click', async () => {
  if (!regexOutEl.value) return;
  await navigator.clipboard.writeText(regexOutEl.value);
  setBuilderStatus('정규식을 복사했습니다.', 'ok');
});

async function initBuilder() {
  const saved = (await chrome.storage.local.get(BUILDER_KEY))[BUILDER_KEY] ?? {};
  for (const key of saved.selected ?? []) selected.add(key);

  builderEl.hidden = !saved.open;
  builderArrow.textContent = saved.open ? '▼' : '▶';

  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = '프리셋…';
  presetEl.append(blank);
  for (const p of PRESETS) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    presetEl.append(opt);
  }

  const leagues = await loadLeagues();
  leagueEl.textContent = '';
  for (const l of leagues) {
    const opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = l.text;
    leagueEl.append(opt);
  }
  if (saved.league && leagues.some((l) => l.id === saved.league)) leagueEl.value = saved.league;

  renderMods();
  updateRegex();
}

(async function init() {
  await applyStyles();

  // 기본은 접힌 상태 — 거래소 화면을 좁히지 않도록 손잡이만 띄운다.
  const stored = await chrome.storage.local.get(PANEL_OPEN_KEY);
  panelEl.hidden = stored[PANEL_OPEN_KEY] !== true;
  renderPanel();

  pending = await loadPending();
  renderList(await getBookmarks());
  await refresh({ force: true });
  await initBuilder();
})();
