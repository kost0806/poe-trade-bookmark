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
  } else if (pending && pending.url === current.url) {
    // 방금 8모드 빌더로 만든 검색 — 이름과 정규식을 미리 채워 둔다.
    setStatus('저장하면 인게임 정규식도 함께 보관됩니다.', null);
    titleEl.value = pending.title;
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
      // 8모드 빌더로 만든 검색이면 인게임 정규식을 같이 저장한다.
      ...(pending && pending.url === current.url ? { regex: pending.regex } : {}),
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

/* ---------------- 16T 8모드 검색 만들기 ---------------- */

const BUILDER_KEY = 'builder';
const LEAGUE_CACHE_KEY = 'leagues';
// DEFAULT_ORIGIN / REGEX_MAX / buildRegex / buildSearchQuery 는 trade-query.js 전역
const FALLBACK_LEAGUES =[{ id: 'Allflame', text: '올플레임' }, { id: 'Standard', text: 'Standard' }];
// 계정 한도가 5초당 3회다. 버튼 연타로 한도를 태우지 않도록 최소 간격을 둔다.
const SEARCH_COOLDOWN_MS = 2500;

const builderEl = document.getElementById('builder');
const builderToggle = document.getElementById('builder-toggle');
const builderArrow = document.getElementById('builder-arrow');
const leagueEl = document.getElementById('league');
const modSearchEl = document.getElementById('mod-search');
const modListEl = document.getElementById('mod-list');
const regexOutEl = document.getElementById('regex-out');
const regexLenEl = document.getElementById('regex-len');
const runSearchBtn = document.getElementById('run-search');
const builderStatusEl = document.getElementById('builder-status');
const presetEl = document.getElementById('preset');
const presetDescEl = document.getElementById('preset-desc');

const selected = new Set(); // 거를 모드 키
let lastSearchAt = 0;
let pending = null; // 방금 만든 검색 {url, title, regex}

const modKey = (mod) => mod.ids.join(',');
const selectedMods = () => MAP_MODS.filter((m) => selected.has(modKey(m)));

function setBuilderStatus(message, kind) {
  builderStatusEl.textContent = message;
  builderStatusEl.className = kind ? `status ${kind}` : 'status';
  builderStatusEl.hidden = !message;
}

/** 현재 탭이 거래소면 그 서버를, 아니면 카카오 서버를 쓴다. */
async function tradeOrigin() {
  const [tab] = await chrome.tabs.query({ active: true, windowId: panelWindowId });
  const parsed = parseTradeUrl(tab?.url ?? '');
  return parsed ? new URL(parsed.url).origin : DEFAULT_ORIGIN;
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

async function loadLeagues(origin) {
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

  const origin = await tradeOrigin();
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
    pending = {
      url,
      title: `16T 8모드 (${mods.length}개 거름)`,
      regex: buildRegex(mods),
    };
    setBuilderStatus(`검색 결과 ${body.total ?? 0}개. 위에서 이름을 정해 저장하세요.`, 'ok');

    const [tab] = await chrome.tabs.query({ active: true, windowId: panelWindowId });
    if (tab && parseTradeUrl(tab.url ?? '')) await chrome.tabs.update(tab.id, { url });
    else await chrome.tabs.create({ url, windowId: panelWindowId });
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

document.getElementById('preset-none').addEventListener('click', () => {
  selected.clear();
  presetEl.value = '';
  presetDescEl.textContent = '';
  renderMods();
  updateRegex();
  saveBuilderState();
  setBuilderStatus('', null);
});

document.getElementById('copy-regex').addEventListener('click', async () => {
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

  const leagues = await loadLeagues(await tradeOrigin());
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
  panelWindowId = (await chrome.windows.getCurrent()).id;
  renderList(await getBookmarks());
  await refresh({ force: true });
  await initBuilder();
})();
