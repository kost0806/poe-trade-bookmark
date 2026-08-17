/*
 * 거래소 페이지 안에 직접 붙는 북마크 패널.
 *
 * 크롬 사이드 패널은 탭을 옮겨도 계속 떠 있어서, 거래소를 벗어나면 방해가 됐다.
 * 그래서 콘텐츠 스크립트로 페이지에 심고, 페이지를 떠나면 같이 사라지게 한다.
 * 거래소의 CSS와 섞이지 않도록 Shadow DOM 안에서 그린다.
 */

const STORAGE_KEY = 'bookmarks';
const HISTORY_KEY = 'history';
const BUILDER_KEY = 'builder';
const LEAGUE_CACHE_KEY = 'leagues';
const PENDING_KEY = 'pending';
const PANEL_OPEN_KEY = 'panelOpen';
const HISTORY_OPEN_KEY = 'historyOpen';
const NAV_KEY = 'nav';
const USER_PRESETS_KEY = 'userPresets';

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
          </div>

          <button type="button" id="open-mods">거를 모드 고르기</button>

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

      <section class="card">
        <h2>
          <button type="button" id="history-toggle" class="section-toggle">
            <span id="history-arrow">▼</span> 검색 기록 <span id="history-count" class="count"></span>
          </button>
        </h2>

        <div id="history">
          <ul id="history-list" class="list history-list"></ul>
          <p id="history-empty" class="status" hidden>거래소에서 직접 검색하면 여기에 쌓입니다.</p>
          <button type="button" id="history-clear" class="mini wide" hidden>기록 비우기</button>
        </div>
      </section>
    </div>
  </div>

  <!--
    모드 고르기 창. 사이드바 폭(360px)으로는 80개를 훑기가 어려워서, 고를 때만
    화면 가운데에 넓게 편다. .panel 바깥에 두어 칸 안에서 잘리지 않게 한다.
  -->
  <div class="modal" id="mod-modal" hidden>
    <div class="modal-back" id="mod-back"></div>

    <div class="modal-box" role="dialog" aria-modal="true" aria-label="거를 맵모드 고르기">
      <div class="modal-head">
        <h2>거를 맵모드 고르기</h2>
        <button type="button" id="mod-close" class="mini">닫기 (Esc)</button>
      </div>

      <!-- 찾는 줄: 검색과 프리셋 -->
      <div class="modal-tools">
        <input id="mod-search" type="text" autocomplete="off" placeholder="모드 검색 — 문구, 접두어 이름, 정규식(예: 반사, 원소.가)" />
        <select id="preset" title="프리셋"></select>
        <button type="button" id="preset-save" class="mini" title="지금 고른 모드를 프리셋으로 저장">저장…</button>
        <button type="button" id="preset-delete" class="mini" title="고른 내 프리셋 지우기">삭제</button>
      </div>

      <!-- 이름 짓는 줄: 저장…을 눌렀을 때만 나온다 -->
      <div class="modal-tools" id="preset-save-row" hidden>
        <input id="preset-name" type="text" maxlength="40" autocomplete="off" placeholder="프리셋 이름 — 지금 고른 모드를 이 이름으로 저장합니다" />
        <button type="button" id="preset-save-ok" class="mini">저장</button>
        <button type="button" id="preset-save-cancel" class="mini">취소</button>
      </div>

      <!-- 붙여넣는 줄: 인게임 정규식으로 한 번에 선택 -->
      <div class="modal-tools">
        <input id="regex-in" type="text" autocomplete="off" placeholder="인게임 정규식을 붙여넣어 한 번에 선택 (예: !대상이|재사용)" />
        <button type="button" id="apply-regex" class="mini">정규식으로 선택</button>
      </div>

      <p id="preset-desc" class="target"></p>
      <p id="modal-status" class="status" hidden></p>

      <!-- 목록 머리: 지금 몇 개를 골랐고, 무엇을 보여줄지 -->
      <div class="modal-strip">
        <span id="mod-count" class="count">아직 고른 모드 없음</span>
        <div class="seg" role="group" aria-label="목록에 보일 모드">
          <button type="button" id="view-all" class="seg-btn on" aria-pressed="true">전체</button>
          <button type="button" id="view-selected" class="seg-btn" aria-pressed="false">고른 것만</button>
        </div>
        <button type="button" id="preset-none" class="mini push">전체 해제</button>
      </div>

      <div id="mod-list" class="mod-grid"></div>

      <div class="modal-foot">
        <span id="mod-regex" class="modal-regex"></span>
        <button type="button" id="mod-done">완료</button>
      </div>
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
const historyEl = $('history');
const historyToggle = $('history-toggle');
const historyArrow = $('history-arrow');
const historyListEl = $('history-list');
const historyEmptyEl = $('history-empty');
const historyCountEl = $('history-count');
const historyClearEl = $('history-clear');

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
  // 칸을 접으면 모드 고르기 창도 같이 닫는다 — 칸 없이 창만 떠 있을 이유가 없다.
  if (!open) closeMods();
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

/** 기록은 같은 날 여러 번 쌓이므로 시각까지 보여 준다. */
function formatTime(ts) {
  return new Date(ts).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const modeLabel = (mode) => (mode === 'exchange' ? '대량거래' : '검색');

/** 패널이 거래소 안에서만 살아 있으므로 항상 이 탭에서 그대로 이동한다. */
async function openRecord(record) {
  // 패널에서 옮겨 간 검색은 기록에 남기지 않는다 — 기록은 거래소에서 직접 한 검색만이다.
  await markPanelNav(record.url);
  location.assign(record.url);
}

/**
 * 목록 한 줄의 본체. 마우스를 올리면 어떤 조건으로 검색한 것인지 요약이 뜬다.
 * 요약이 없으면(옛 북마크, 폼을 못 읽은 대량거래) 주소라도 보여 준다.
 */
function itemButton(record, meta) {
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'item-open';
  open.title = formatSummary(record.summary) || record.url;

  const name = document.createElement('span');
  name.className = 'item-title';
  name.textContent = record.title;

  const sub = document.createElement('span');
  sub.className = 'item-meta';
  sub.textContent = meta;

  open.append(name, sub);
  open.addEventListener('click', () => openRecord(record));
  return open;
}

function renderList(bookmarks) {
  listEl.textContent = '';
  countEl.textContent = bookmarks.length ? `(${bookmarks.length})` : '';
  emptyEl.hidden = bookmarks.length > 0;

  for (const bookmark of bookmarks) {
    const li = document.createElement('li');

    li.append(
      itemButton(
        bookmark,
        `${bookmark.league} · ${modeLabel(bookmark.mode)} · ${formatDate(bookmark.createdAt)}`
      )
    );

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

/* ---------------- 검색 기록 ---------------- */

/*
 * 거래소에서 직접 한 검색을 그대로 쌓아 둔다. 북마크는 남길 것을 골라 두는 자리라
 * 검색할 때마다 손이 가지만, 기록은 아무것도 안 해도 남아서 "아까 그 검색"으로
 * 되돌아갈 수 있다. 검색 조건은 검색 ID에 묶여 있으므로 주소만 있으면 그때의
 * 검색어와 필터가 그대로 복원된다 — 조건을 따로 재현할 필요가 없다.
 */

// 기록은 오래된 것부터 밀려난다. 저장 공간보다 목록에서 찾기 좋은 길이가 기준이다.
const HISTORY_MAX = 50;
// 패널에서 이동했다는 표식의 수명. 이동 직후의 로드에서만 쓰이므로 짧아도 된다.
const NAV_TTL_MS = 60 * 1000;

// 패널의 북마크/기록을 눌러 들어온 주소. 그 검색은 한 번 건너뛴다.
let skipNavUrl = null;
// 지금 페이지에서 읽어 둔 검색 조건 요약 (북마크를 저장할 때 함께 넣는다).
let currentSummary = null;

async function getHistory() {
  const data = await chrome.storage.local.get(HISTORY_KEY);
  return Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
}

async function setHistory(history) {
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

/**
 * 패널에서 옮겨 간다고 표시해 둔다.
 * 이동하면 페이지가 다시 로드되어 이 스크립트도 새로 시작하므로 스토리지에 맡긴다.
 */
async function markPanelNav(url) {
  await chrome.storage.local.set({ [NAV_KEY]: { url, at: Date.now() } });
}

/**
 * 표식을 한 번 쓰고 지운다. 오래된 것은 (탭을 한참 뒤에 열었을 때) 무시한다.
 * 주소가 맞을 때만 가져가므로, 마침 같이 열린 다른 탭이 대신 써 버리지 않는다.
 */
async function takePanelNav(url) {
  const saved = (await chrome.storage.local.get(NAV_KEY))[NAV_KEY];
  if (!saved) return null;

  const stale = Date.now() - saved.at > NAV_TTL_MS;
  if (stale || saved.url === url) await chrome.storage.local.remove(NAV_KEY);
  return !stale && saved.url === url ? saved.url : null;
}

/**
 * 지금 보고 있는 검색을 기록에 남긴다.
 *
 * 같은 검색(같은 주소)은 새로 쌓지 않고 맨 위로 올린다. 거래소는 조건이 같으면
 * 같은 검색 ID를 돌려주므로, 같은 검색을 반복해도 목록이 그것으로 채워지지 않는다.
 */
async function recordHistory(parsed, summary) {
  if (!parsed?.searchId) return;

  // 패널에서 눌러 들어온 검색은 한 번만 건너뛴다. 그 뒤 이 페이지에서 새로 한
  // 검색은 주소가 바뀌므로 정상적으로 쌓인다.
  if (skipNavUrl === parsed.url) {
    skipNavUrl = null;
    return;
  }

  const history = await getHistory();
  const previous = history.find((h) => h.url === parsed.url);
  const record = {
    id: previous?.id ?? crypto.randomUUID(),
    title: titleFromSummary(summary) || suggestTitle(parsed),
    url: parsed.url,
    league: parsed.league,
    mode: parsed.mode,
    searchId: parsed.searchId,
    // 구조 그대로 넣어 둔다. 보여 주는 모양은 그릴 때 정한다.
    ...(hasSummary(summary) ? { summary } : {}),
    at: Date.now(),
  };

  const rest = history.filter((h) => h.url !== parsed.url);
  await setHistory([record, ...rest].slice(0, HISTORY_MAX));
}

function renderHistory(history) {
  historyListEl.textContent = '';
  historyCountEl.textContent = history.length ? `(${history.length})` : '';
  historyEmptyEl.hidden = history.length > 0;
  historyClearEl.hidden = history.length === 0;

  for (const entry of history) {
    const li = document.createElement('li');
    li.append(itemButton(entry, `${entry.league} · ${modeLabel(entry.mode)} · ${formatTime(entry.at)}`));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'item-delete';
    del.textContent = '삭제';
    del.title = '기록에서 지우기';
    del.addEventListener('click', async () => {
      await setHistory((await getHistory()).filter((h) => h.id !== entry.id));
    });

    li.append(del);
    historyListEl.append(li);
  }
}

historyToggle.addEventListener('click', async () => {
  historyEl.hidden = !historyEl.hidden;
  historyArrow.textContent = historyEl.hidden ? '▶' : '▼';
  await chrome.storage.local.set({ [HISTORY_OPEN_KEY]: !historyEl.hidden });
});

historyClearEl.addEventListener('click', async () => {
  await setHistory([]);
});

/* ---------------- 북마크 폼 채우기 ---------------- */

// 거래소가 폼을 채우기 전에 읽을 수 있다(북마크 링크로 새로 열었을 때). 페이지를
// 훑는 것뿐이라 비용이 거의 없으니, 값이 보일 때까지 잠깐 다시 본다.
const FILL_RETRY_MS = 250;
const FILL_TRIES = 8;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let filledName = null; // 우리가 채워 둔 추천 이름
let nameTouched = false; // 사용자가 이름 칸을 직접 고쳤는지

/**
 * 폼이 채워질 때까지 기다렸다가 검색 조건을 읽는다.
 * (summarizeSearchPane / hasSummary는 search-summary.js)
 */
async function readSummary(parsed) {
  for (let i = 0; i < FILL_TRIES; i++) {
    // 그 사이 페이지가 바뀌었으면 그만둔다.
    if (current?.url !== parsed.url) return null;

    const summary = summarizeSearchPane(document);
    if (hasSummary(summary)) return summary;
    await sleep(FILL_RETRY_MS);
  }
  return null;
}

/**
 * 폼에서 읽은 조건으로 추천 이름을 채우고, 이 검색을 기록에 남긴다.
 * 끝까지 못 읽으면 검색 ID로 만든 이름이 그대로 남는다.
 */
async function fillFromSearchPane(parsed) {
  const summary = await readSummary(parsed);
  if (current?.url !== parsed.url) return;

  // 북마크로 저장할 때 이 요약을 함께 넣는다.
  currentSummary = summary;

  // 저장해 둔 이름, 빌더가 지어 준 이름, 사용자가 적어 둔 이름은 건드리지 않는다.
  const title = titleFromSummary(summary);
  if (title && !nameTouched && !savedBookmark && !(pending && pending.url === parsed.url)) {
    filledName = title;
    titleEl.value = title;
    syncButton();
  }

  await recordHistory(parsed, summary);
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

  const summary = summarizeSearchPane(document);
  const name = titleFromSummary(summary);
  if (!name || name === filledName) return;

  currentSummary = summary;
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
  }
  syncButton();
}

/** 현재 주소를 다시 읽어 폼을 갱신한다. URL이 그대로면 입력 중인 이름을 보존한다. */
async function refresh({ force = false } = {}) {
  current = parseTradeUrl(location.href);

  const key = current ? current.url : null;
  if (!force && key === renderedUrl) return;
  renderedUrl = key;
  currentSummary = null;

  // 그리는 중에는 watchSearch가 끼어들지 않게 한다.
  rendering = true;
  try {
    await renderForm();
    // 폼은 거래소가 조금 늦게 채운다. 채워지면 추천 이름과 검색 기록에 쓴다.
    if (current?.searchId) await fillFromSearchPane(current);
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
    record = {
      ...existing,
      title: name,
      updatedAt: Date.now(),
      // 요약을 붙이기 전에 저장한 북마크라면 이번에 함께 넣어 준다.
      ...(hasSummary(currentSummary) ? { summary: currentSummary } : {}),
    };
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
      // 마우스를 올렸을 때 보여줄 검색 조건.
      ...(hasSummary(currentSummary) ? { summary: currentSummary } : {}),
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
  if (area !== 'local') return;

  if (changes[HISTORY_KEY]) renderHistory(changes[HISTORY_KEY].newValue ?? []);

  // 다른 탭에서 저장하거나 지운 프리셋도 바로 목록에 반영한다.
  if (changes[USER_PRESETS_KEY]) {
    userPresets = changes[USER_PRESETS_KEY].newValue ?? [];
    renderPresets();
  }

  if (!changes[STORAGE_KEY]) return;
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
const regexInEl = $('regex-in');
const applyRegexBtn = $('apply-regex');
const regexOutEl = $('regex-out');
const regexLenEl = $('regex-len');
const runSearchBtn = $('run-search');
const builderStatusEl = $('builder-status');
const presetEl = $('preset');
const presetDescEl = $('preset-desc');
const presetSaveBtn = $('preset-save');
const presetDeleteBtn = $('preset-delete');
const presetSaveRow = $('preset-save-row');
const presetNameEl = $('preset-name');
const openModsBtn = $('open-mods');
const modalEl = $('mod-modal');
const modCountEl = $('mod-count');
const modRegexEl = $('mod-regex');
const viewAllBtn = $('view-all');
const viewSelectedBtn = $('view-selected');
const modalStatusEl = $('modal-status');

const selected = new Set(); // 거를 모드 키
let onlySelected = false; // 창의 목록에 고른 모드만 보이기
let lastSearchAt = 0;
let pending = null; // 방금 만든 검색 {url, title, regex, at}

const modKey = (mod) => mod.ids.join(',');
const selectedMods = () => MAP_MODS.filter((m) => selected.has(modKey(m)));

/**
 * 빌더의 안내 문구. 모드를 고르는 동안에는 사이드바가 창에 가려 보이지 않으므로
 * 창 안에도 같은 문구를 띄운다.
 */
function setBuilderStatus(message, kind) {
  for (const el of [builderStatusEl, modalStatusEl]) {
    el.textContent = message;
    el.className = kind ? `status ${kind}` : 'status';
    el.hidden = !message;
  }
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

/**
 * 창 안의 모드 목록.
 *
 * 사이드바 폭으로는 80개를 한 줄씩 훑어야 해서 찾기가 어려웠다. 창은 넓으므로
 * 여러 칸으로 늘어놓고, 계열 제목은 칸 전체에 걸쳐 붙여 어디를 보고 있는지
 * 잃지 않게 한다. 고른 항목은 색으로 표시해 목록을 되짚지 않아도 되게 한다.
 */
function renderMods() {
  const q = modSearchEl.value.trim();
  modListEl.textContent = '';

  let group = null;
  let shown = 0;

  for (const mod of MAP_MODS) {
    const key = modKey(mod);
    if (onlySelected && !selected.has(key)) continue;
    // 이름·문구 부분일치 외에 인게임 정규식꼴 검색("원소.가")도 받는다.
    if (q && !mod.text.includes(q) && !mod.affix.includes(q) && !modMatchesPattern(q, mod)) continue;

    if (mod.group !== group) {
      group = mod.group;
      const head = document.createElement('div');
      head.className = 'mod-group';
      head.textContent = group;
      modListEl.append(head);
    }

    const label = document.createElement('label');
    label.className = selected.has(key) ? 'mod-item on' : 'mod-item';
    // 한 항목이 여러 줄을 묶기도 한다(값만 다른 같은 계열). 나머지 줄은 여기에 둔다.
    label.title = `${mod.affix}\n${mod.text}`;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selected.has(key);
    cb.addEventListener('change', () => {
      cb.checked ? selected.add(key) : selected.delete(key);
      label.classList.toggle('on', cb.checked);
      updateRegex();
      saveBuilderState();
    });

    const text = document.createElement('span');
    text.className = 'mod-text';
    text.textContent = mod.text.split('\n')[0];

    if (mod.rec) {
      // 빌드와 무관하게 흔히 거르는 모드. 무엇부터 볼지 정하는 데 쓴다.
      const star = document.createElement('span');
      star.className = 'rec';
      star.textContent = ' ★';
      star.title = '흔히 거르는 모드';
      text.append(star);
    }

    const kw = document.createElement('span');
    kw.className = 'kw';
    kw.textContent = ` (${mod.regex})`;
    text.append(kw);

    label.append(cb, text);
    modListEl.append(label);
    shown++;
  }

  if (!shown) {
    const none = document.createElement('p');
    none.className = 'status mod-none';
    none.textContent = onlySelected ? '고른 모드가 없습니다.' : '검색과 맞는 모드가 없습니다.';
    modListEl.append(none);
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

  openModsBtn.textContent = selected.size
    ? `거를 모드 고르기 (${selected.size}개 고름)`
    : '거를 모드 고르기';
  modCountEl.textContent = selected.size ? `${selected.size}개 고름` : '아직 고른 모드 없음';
  // 창을 닫지 않아도 정규식이 어떻게 자라는지 보이게 한다.
  modRegexEl.textContent = regex ? `${regex}  (${regex.length}/${REGEX_MAX}자)` : '';
  modRegexEl.className = regex.length > REGEX_MAX ? 'modal-regex over' : 'modal-regex';
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

/* ---------------- 모드 고르기 창 ---------------- */

/** 목록에 무엇을 보일지 — 전체냐, 고른 것만이냐. */
function setView(only) {
  onlySelected = only;
  for (const [btn, on] of [
    [viewAllBtn, !only],
    [viewSelectedBtn, only],
  ]) {
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  }
  renderMods();
}

function openMods() {
  modalEl.hidden = false;
  // 열 때는 늘 전체부터 — 지난번에 걸어 둔 '고른 것만'에 갇히지 않게 한다.
  setView(false);
  // 지난번에 펴 둔 이름 칸이 남아 있지 않게 한다.
  closePresetSave();
  // 바로 검색어를 칠 수 있게 한다. 찾던 말이 남아 있으면 통째로 잡아 준다.
  modSearchEl.focus();
  modSearchEl.select();
}

function closeMods() {
  modalEl.hidden = true;
}

openModsBtn.addEventListener('click', openMods);
$('mod-close').addEventListener('click', closeMods);
$('mod-done').addEventListener('click', closeMods);
// 바깥을 눌러도 닫는다. 고른 내용은 그때그때 저장되므로 잃을 것이 없다.
$('mod-back').addEventListener('click', closeMods);
viewAllBtn.addEventListener('click', () => setView(false));
viewSelectedBtn.addEventListener('click', () => setView(true));

// Esc로 닫기. 이 키는 host에서 이미 거래소로 새지 않게 막아 두었다.
root.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || modalEl.hidden) return;
  // 이름 칸이 펴져 있으면 그것부터 접는다 — 이름을 짓다 말았다고 창까지 닫히면 곤란하다.
  if (!presetSaveRow.hidden) closePresetSave();
  else closeMods();
});

/* ---------------- 프리셋 ---------------- */

/*
 * 기본 프리셋은 presets.js에 박혀 있고, 여기서 만드는 것은 사용자가 지금 고른 모드를
 * 그대로 담아 두는 '내 프리셋'이다. 담는 값이 기본 프리셋과 같은 keys 배열이라
 * applyPreset은 어느 쪽인지 몰라도 된다.
 */
const USER_PRESET_PREFIX = 'user:';

let userPresets = [];

async function getUserPresets() {
  const data = await chrome.storage.local.get(USER_PRESETS_KEY);
  return Array.isArray(data[USER_PRESETS_KEY]) ? data[USER_PRESETS_KEY] : [];
}

async function setUserPresets(presets) {
  await chrome.storage.local.set({ [USER_PRESETS_KEY]: presets });
}

const isUserPreset = (id) => typeof id === 'string' && id.startsWith(USER_PRESET_PREFIX);
const userPresetDesc = (preset) =>
  `내 프리셋 · ${preset.keys.length}개 · ${formatDate(preset.at)}`;

/** 두 출처를 한 자리에서 찾는다. id가 겹치지 않으므로 어느 쪽인지 물을 필요가 없다. */
function presetById(id) {
  if (!id) return null;
  if (!isUserPreset(id)) return PRESETS.find((p) => p.id === id) ?? null;

  const found = userPresets.find((p) => p.id === id);
  return found ? { ...found, desc: userPresetDesc(found) } : null;
}

/** 드롭다운을 다시 그린다. 고르고 있던 것이 아직 있으면 그대로 둔다. */
function renderPresets() {
  const keep = presetEl.value;
  presetEl.textContent = '';
  presetEl.append(new Option('프리셋…', ''));

  const builtin = document.createElement('optgroup');
  builtin.label = '기본';
  for (const preset of PRESETS) builtin.append(new Option(preset.label, preset.id));
  presetEl.append(builtin);

  if (userPresets.length) {
    const mine = document.createElement('optgroup');
    mine.label = '내 프리셋';
    for (const preset of userPresets) mine.append(new Option(preset.label, preset.id));
    presetEl.append(mine);
  }

  // 지운 프리셋을 고른 채로 두지 않는다.
  presetEl.value = presetById(keep) ? keep : '';
  syncPresetButtons();
}

/** 삭제는 내 프리셋에만 쓴다 — 기본 프리셋은 지울 수 있는 것이 아니다. */
function syncPresetButtons() {
  presetDeleteBtn.disabled = !isUserPreset(presetEl.value);
}

function closePresetSave() {
  presetSaveRow.hidden = true;
  presetNameEl.value = '';
}

function openPresetSave() {
  if (!selected.size) {
    setBuilderStatus('고른 모드가 없습니다. 거를 모드를 먼저 고르세요.', 'error');
    return;
  }
  // 내 프리셋을 고른 채라면 그 이름을 채워 둔다 — 같은 이름으로 저장하면 덮어쓴다.
  const current = presetById(presetEl.value);
  presetNameEl.value = isUserPreset(current?.id) ? current.label : '';
  presetSaveRow.hidden = false;
  presetNameEl.focus();
  presetNameEl.select();
}

async function savePreset() {
  const label = presetNameEl.value.trim();
  if (!selected.size) {
    setBuilderStatus('고른 모드가 없습니다. 거를 모드를 먼저 고르세요.', 'error');
    return;
  }
  if (!label) {
    setBuilderStatus('프리셋 이름을 적어 주세요.', 'error');
    return;
  }
  if (PRESETS.some((p) => p.label === label)) {
    setBuilderStatus(`'${label}'은(는) 기본 프리셋 이름입니다. 다른 이름을 쓰세요.`, 'error');
    return;
  }

  // 같은 이름이면 새로 만들지 않고 덮어쓴다. 이름이 곧 그 프리셋이다.
  const existing = userPresets.find((p) => p.label === label);
  const record = {
    id: existing?.id ?? `${USER_PRESET_PREFIX}${crypto.randomUUID()}`,
    label,
    keys: [...selected],
    at: Date.now(),
  };

  userPresets = existing
    ? userPresets.map((p) => (p.id === existing.id ? record : p))
    : [...userPresets, record];
  await setUserPresets(userPresets);

  closePresetSave();
  renderPresets();
  presetEl.value = record.id;
  syncPresetButtons();
  presetDescEl.textContent = userPresetDesc(record);
  setBuilderStatus(
    `프리셋 '${label}'을(를) ${existing ? '덮어썼습니다' : '저장했습니다'} (${record.keys.length}개)`,
    'ok'
  );
}

async function deletePreset() {
  const preset = presetById(presetEl.value);
  if (!isUserPreset(preset?.id)) return;

  userPresets = userPresets.filter((p) => p.id !== preset.id);
  await setUserPresets(userPresets);

  renderPresets();
  presetEl.value = '';
  presetDescEl.textContent = '';
  syncPresetButtons();
  // 목록에서만 지운다. 지금 고른 모드까지 풀어 버리면 되돌릴 방법이 없다.
  setBuilderStatus(`프리셋 '${preset.label}'을(를) 지웠습니다. 고른 모드는 그대로입니다.`, 'ok');
}

presetSaveBtn.addEventListener('click', openPresetSave);
presetDeleteBtn.addEventListener('click', deletePreset);
$('preset-save-ok').addEventListener('click', savePreset);
$('preset-save-cancel').addEventListener('click', closePresetSave);
presetNameEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') savePreset();
});

function applyPreset(id) {
  const preset = presetById(id);
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
  presetDescEl.textContent = presetById(presetEl.value)?.desc ?? '';
  syncPresetButtons();
});

$('preset-none').addEventListener('click', () => {
  selected.clear();
  presetEl.value = '';
  presetDescEl.textContent = '';
  syncPresetButtons();
  renderMods();
  updateRegex();
  saveBuilderState();
  setBuilderStatus('', null);
});

/**
 * 붙여넣은 인게임 정규식에서 거를 모드를 복원해 그대로 선택한다.
 * 정규식이 선택 전체를 나타내므로 기존 선택은 대체한다.
 */
function applyRegexSelection() {
  const input = regexInEl.value.trim();
  if (!input) {
    setBuilderStatus('선택에 쓸 인게임 정규식을 붙여넣으세요.', 'error');
    return;
  }

  const { mods, unmatched, invalid } = matchModsByRegex(input, MAP_MODS);

  // 문법이 깨졌으면 어디가 왜 틀렸는지부터 알린다. 인게임에서도 통하지 않을
  // 정규식이므로 고쳐 쓰는 편이 낫다.
  if (invalid.length) {
    const [{ pattern, message }] = invalid;
    setBuilderStatus(`정규식 오류 — ${pattern}: ${message}`, 'error');
    return;
  }
  if (!mods.length) {
    setBuilderStatus('정규식에 매칭되는 맵모드가 없습니다.', 'error');
    return;
  }

  selected.clear();
  for (const mod of mods) selected.add(modKey(mod));
  presetEl.value = '';
  presetDescEl.textContent = '';

  renderMods();
  updateRegex();
  saveBuilderState();

  setBuilderStatus(
    unmatched.length
      ? `정규식에서 ${mods.length}개 모드 선택 (매칭 안 된 패턴: ${unmatched.join(', ')})`
      : `정규식에서 ${mods.length}개 모드 선택`,
    unmatched.length ? 'error' : 'ok'
  );
}

applyRegexBtn.addEventListener('click', applyRegexSelection);
regexInEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') applyRegexSelection();
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

  userPresets = await getUserPresets();
  renderPresets();

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
  const stored = await chrome.storage.local.get([PANEL_OPEN_KEY, HISTORY_OPEN_KEY]);
  panelEl.hidden = stored[PANEL_OPEN_KEY] !== true;
  renderPanel();

  // 검색 기록은 기본이 펼친 상태다. 손대지 않아도 쌓이는 목록이라 보여야 쓸모가 있다.
  historyEl.hidden = stored[HISTORY_OPEN_KEY] === false;
  historyArrow.textContent = historyEl.hidden ? '▶' : '▼';

  pending = await loadPending();
  // 기록에 남길지 가리는 표식이라, 첫 refresh보다 먼저 읽어 둔다.
  skipNavUrl = await takePanelNav(parseTradeUrl(location.href)?.url ?? null);
  renderList(await getBookmarks());
  renderHistory(await getHistory());
  await refresh({ force: true });
  await initBuilder();
})();
