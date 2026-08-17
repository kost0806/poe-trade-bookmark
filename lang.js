/*
 * 언어 고르기와 화면 문구.
 *
 * 확장이 붙는 거래소는 서버마다 언어가 다르다. 한국 서버(poe.kakaogames.com,
 * poe.game.daum.net, kr.pathofexile.com)는 한글이고 나머지는 영문이다. 사용자가
 * 직접 고를 수도 있어야 해서 설정은 세 가지다 — 자동 / 한글 / English.
 *
 *   자동   : 지금 보고 있는 거래소의 호스트로 정한다
 *   한글   : 어디서 보든 한글
 *   English: 어디서 보든 영문
 *
 * 언어가 바뀌면 세 가지가 함께 바뀐다.
 *   1. 화면 문구 (여기 TEXT)
 *   2. 맵모드 목록 — 한글 `map-mods.js` / 영문 `map-mods-en.js`
 *   3. 인게임 정규식 오류 문구 (`poe-regex.js`의 setRegexLanguage)
 *
 * 바뀌지 않는 것: 저장해 둔 북마크·기록·프리셋. 프리셋은 모드를 stat id로 담고,
 * 거래소 검색 쿼리도 id로 보내므로 언어와 무관하다. 언어를 바꿔도 고른 모드가
 * 그대로 남는 것은 두 맵모드 목록이 같은 순서·같은 id이기 때문이다
 * (`test/map-mods-en.test.js`가 확인한다).
 *
 * 다른 콘텐츠 스크립트는 `T()`로 지금 언어의 문구를 가져다 쓴다.
 */

const LANG_KEY = 'lang';
const LANG_OPTIONS = ['auto', 'ko', 'en'];

// 한글 거래소. 나머지 서버(www/br/ru/th/de/fr/es/jp …)는 전부 영문으로 본다.
// 여기 목록은 trade-url.js의 TRADE_HOSTS와 함께 유지한다.
const KO_HOSTS = ['poe.kakaogames.com', 'poe.game.daum.net', 'kr.pathofexile.com'];

/** 호스트만 보고 정한다. 주소의 /kr/ 같은 구역은 보지 않는다 — 서버가 곧 언어다. */
function langForHost(hostname) {
  return KO_HOSTS.includes(hostname) ? 'ko' : 'en';
}

/** 설정값과 호스트로 실제 언어를 정한다. 모르는 값은 자동으로 본다. */
function resolveLang(setting, hostname) {
  return setting === 'ko' || setting === 'en' ? setting : langForHost(hostname);
}

/* ---------------- 화면 문구 ---------------- */

/*
 * 영문 문구는 PoE 커뮤니티에서 쓰는 말을 그대로 따른다 — 'T16 8-mod', 'regex',
 * 'exclude', 'bulk exchange'. 게임/거래소가 쓰는 낱말과 어긋나면 같은 것을 두
 * 이름으로 부르게 된다.
 */
const TEXT = {
  ko: {
    langLabel: '언어',
    langAuto: '자동',

    // 사이드바
    expand: '북마크 사이드바 열기',
    collapse: '북마크 사이드바 접기',
    checking: '현재 페이지를 확인하는 중…',
    nameLabel: '이름',
    namePlaceholder: '북마크 이름',
    addBookmark: '북마크 추가',
    rename: '이름 변경',
    notTradePage: '거래소 검색 페이지에서 저장할 수 있습니다.',
    noSearchId: '검색을 실행한 뒤(주소에 검색 ID가 생긴 뒤) 저장해 주세요.',
    alreadySaved: '이미 저장된 검색입니다. 이름을 고치면 바꿀 수 있습니다.',
    savedWithRegex: '저장하면 인게임 정규식도 함께 보관됩니다.',
    bookmarkAdded: '북마크를 추가했습니다.',
    renamed: (name) => `이름을 "${name}"(으)로 바꿨습니다.`,

    // 목록
    bookmarks: '저장된 북마크',
    noBookmarks: '아직 저장된 북마크가 없습니다.',
    history: '검색 기록',
    noHistory: '거래소에서 직접 검색하면 여기에 쌓입니다.',
    clearHistory: '기록 비우기',
    deleteLabel: '삭제',
    deleteBookmark: '북마크 삭제',
    removeFromHistory: '기록에서 지우기',
    copyRegexLabel: '정규식',
    copied: '복사됨',
    copyRegexTitle: (regex) => `인게임 정규식 복사\n${regex}`,
    modeSearch: '검색',
    modeExchange: '대량거래',

    // 8모드 빌더
    builder: '16T 8모드 검색 만들기',
    league: '리그',
    pickMods: '거를 모드 고르기',
    pickModsWith: (n) => `거를 모드 고르기 (${n}개 고름)`,
    inGameRegex: '인게임 정규식',
    regexPlaceholder: '거를 모드를 선택하세요',
    copy: '복사',
    regexCopied: '정규식을 복사했습니다.',
    runSearch: '거래소 검색 만들기',
    runSearchWith: (n) => `거래소 검색 만들기 (${n}개 거름)`,
    searchCooldown: (sec) => `거래소 요청 제한 때문에 ${sec}초 후에 다시 눌러주세요.`,
    searchSubmitting: '거래소에 검색을 등록하는 중…',
    searchRateLimited: (retry) => `거래소 요청 한도 초과. ${retry}초 후 다시 시도하세요.`,
    searchRateLimitedSoon: '잠시',
    searchFailedHttp: (status) => `검색 실패 (HTTP ${status}). 거래소 로그인 상태를 확인하세요.`,
    searchFailed: (message) => `검색 실패: ${message}`,
    unknownResponse: '알 수 없는 응답',
    searchDone: (total) => `검색 결과 ${total}개. 검색 결과로 이동합니다…`,
    requestError: (message) => `요청 중 오류: ${message}`,
    builtTitle: (n) => `16T 8모드 (${n}개 거름)`,

    // 모드 고르기 창
    pickModsTitle: '거를 맵모드 고르기',
    close: '닫기 (Esc)',
    modSearchPlaceholder: '모드 검색 — 문구, 접두어 이름, 정규식(예: 반사, 원소.가)',
    modListLabel: '목록에 보일 모드',
    viewAll: '전체',
    viewSelected: '고른 것만',
    clearAll: '전체 해제',
    done: '완료',
    nonePicked: '아직 고른 모드 없음',
    pickedCount: (n) => `${n}개 고름`,
    noneSelected: '고른 모드가 없습니다.',
    noModsMatch: '검색과 맞는 모드가 없습니다.',
    commonlyExcluded: '흔히 거르는 모드',
    regexChars: (len, max) => `(${len}/${max}자)`,

    // 프리셋
    presets: '프리셋',
    presetPlaceholder: '프리셋…',
    presetBuiltin: '기본',
    presetMine: '내 프리셋',
    presetSave: '저장…',
    presetSaveTitle: '지금 고른 모드를 프리셋으로 저장',
    presetDelete: '삭제',
    presetDeleteTitle: '고른 내 프리셋 지우기',
    presetNamePlaceholder: '프리셋 이름 — 지금 고른 모드를 이 이름으로 저장합니다',
    save: '저장',
    cancel: '취소',
    presetNeedSelection: '고른 모드가 없습니다. 거를 모드를 먼저 고르세요.',
    presetNeedName: '프리셋 이름을 적어 주세요.',
    presetNameTaken: (label) => `'${label}'은(는) 기본 프리셋 이름입니다. 다른 이름을 쓰세요.`,
    presetSaved: (label, n) => `프리셋 '${label}'을(를) 저장했습니다 (${n}개)`,
    presetOverwritten: (label, n) => `프리셋 '${label}'을(를) 덮어썼습니다 (${n}개)`,
    presetDeleted: (label) => `프리셋 '${label}'을(를) 지웠습니다. 고른 모드는 그대로입니다.`,
    presetApplied: (label, n) => `${label}: ${n}개 적용`,
    presetAppliedPartly: (label, n, missing) =>
      `${label}: ${n}개 적용 (모드 목록에 없는 ${missing}개는 건너뜀)`,
    presetDesc: (n, date) => `내 프리셋 · ${n}개 · ${date}`,

    // 정규식으로 선택
    regexInPlaceholder: '인게임 정규식을 붙여넣어 한 번에 선택 (예: !대상이|재사용)',
    applyRegex: '정규식으로 선택',
    regexNeeded: '선택에 쓸 인게임 정규식을 붙여넣으세요.',
    regexError: (pattern, message) => `정규식 오류 — ${pattern}: ${message}`,
    regexNoMods: '정규식에 매칭되는 맵모드가 없습니다.',
    regexApplied: (n) => `정규식에서 ${n}개 모드 선택`,
    regexAppliedPartly: (n, unmatched) =>
      `정규식에서 ${n}개 모드 선택 (매칭 안 된 패턴: ${unmatched})`,

    // 검색 조건 요약 (search-summary.js / search-name.js)
    summaryMore: (n) => `…외 ${n}줄`,
    summaryStats: '능력치',
    summaryGroupCount: (title, n) => `${title} ${n}개`,

    // 영문 복사 단추 (copy-en.js)
    copyEnTitle: '영문 아이템 정보 복사 (PoB 붙여넣기용)',
    copyEnReloaded: '확장을 새로고침했습니다. 페이지를 새로 열어주세요.',
    copyEnFailed: '영문 정보를 가져오지 못했습니다.',
    copyEnOffline: (detail) => `영문 거래소에 연결하지 못했습니다. (${detail})`,
    copyEnRateLimit: (retry) => `요청 한도 초과. ${retry}초 후 다시 시도하세요.`,
    copyEnHttp: (status) => `영문 정보를 가져오지 못했습니다. (HTTP ${status})`,
    copyEnBadResponse: '영문 거래소가 알 수 없는 응답을 보냈습니다.',
    copyEnNotFound: '영문 거래소에서 이 아이템을 찾지 못했습니다.',
    copyEnNoText: '이 아이템은 영문 텍스트가 제공되지 않습니다.',
    copyEnDecode: (detail) => `영문 텍스트를 읽지 못했습니다. (${detail})`,
    copyEnClipboard: '클립보드에 쓰지 못했습니다. 페이지를 클릭한 뒤 다시 눌러주세요.',

    locale: 'ko-KR',
  },

  en: {
    langLabel: 'Language',
    langAuto: 'Auto',

    expand: 'Open the bookmark sidebar',
    collapse: 'Collapse the bookmark sidebar',
    checking: 'Checking this page…',
    nameLabel: 'Name',
    namePlaceholder: 'Bookmark name',
    addBookmark: 'Add bookmark',
    rename: 'Rename',
    notTradePage: 'Open a trade search to bookmark it.',
    noSearchId: 'Run the search first — the URL needs a search ID.',
    alreadySaved: 'Already bookmarked. Edit the name to rename it.',
    savedWithRegex: 'Saving keeps the in-game regex with the bookmark.',
    bookmarkAdded: 'Bookmark added.',
    renamed: (name) => `Renamed to "${name}".`,

    bookmarks: 'Bookmarks',
    noBookmarks: 'No bookmarks yet.',
    history: 'Search history',
    noHistory: 'Searches you run on the trade site land here.',
    clearHistory: 'Clear history',
    deleteLabel: 'Delete',
    deleteBookmark: 'Delete bookmark',
    removeFromHistory: 'Remove from history',
    copyRegexLabel: 'Regex',
    copied: 'Copied',
    copyRegexTitle: (regex) => `Copy the in-game regex\n${regex}`,
    modeSearch: 'Search',
    modeExchange: 'Bulk exchange',

    builder: 'T16 8-mod search',
    league: 'League',
    pickMods: 'Pick mods to exclude',
    pickModsWith: (n) => `Pick mods to exclude (${n} picked)`,
    inGameRegex: 'In-game regex',
    regexPlaceholder: 'Pick the mods you want excluded',
    copy: 'Copy',
    regexCopied: 'Regex copied.',
    runSearch: 'Run trade search',
    runSearchWith: (n) => `Run trade search (excluding ${n})`,
    searchCooldown: (sec) => `Trade rate limit — try again in ${sec}s.`,
    searchSubmitting: 'Registering the search on the trade site…',
    searchRateLimited: (retry) => `Trade rate limit hit. Try again in ${retry}s.`,
    searchRateLimitedSoon: 'a few',
    searchFailedHttp: (status) => `Search failed (HTTP ${status}). Check that you are logged in.`,
    searchFailed: (message) => `Search failed: ${message}`,
    unknownResponse: 'unknown response',
    searchDone: (total) => `${total} results. Opening the search…`,
    requestError: (message) => `Request failed: ${message}`,
    builtTitle: (n) => `T16 8-mod (excluding ${n})`,

    pickModsTitle: 'Pick map mods to exclude',
    close: 'Close (Esc)',
    modSearchPlaceholder: 'Search mods — text, affix name, or regex (e.g. Thorns, have.Elemental)',
    modListLabel: 'Which mods to list',
    viewAll: 'All',
    viewSelected: 'Picked only',
    clearAll: 'Clear all',
    done: 'Done',
    nonePicked: 'No mods picked yet',
    pickedCount: (n) => `${n} picked`,
    noneSelected: 'No mods picked.',
    noModsMatch: 'No mods match that search.',
    commonlyExcluded: 'Commonly excluded',
    regexChars: (len, max) => `(${len}/${max} chars)`,

    presets: 'Presets',
    presetPlaceholder: 'Presets…',
    presetBuiltin: 'Built-in',
    presetMine: 'My presets',
    presetSave: 'Save…',
    presetSaveTitle: 'Save the mods you picked as a preset',
    presetDelete: 'Delete',
    presetDeleteTitle: 'Delete the selected preset of yours',
    presetNamePlaceholder: 'Preset name — saves the mods you picked under this name',
    save: 'Save',
    cancel: 'Cancel',
    presetNeedSelection: 'Nothing picked yet — choose the mods to exclude first.',
    presetNeedName: 'Give the preset a name.',
    presetNameTaken: (label) => `"${label}" is a built-in preset name. Pick another one.`,
    presetSaved: (label, n) => `Saved preset "${label}" (${n} mods)`,
    presetOverwritten: (label, n) => `Overwrote preset "${label}" (${n} mods)`,
    presetDeleted: (label) => `Deleted preset "${label}". Your selection is unchanged.`,
    presetApplied: (label, n) => `${label}: ${n} mods applied`,
    presetAppliedPartly: (label, n, missing) =>
      `${label}: ${n} mods applied (${missing} not in the mod list, skipped)`,
    presetDesc: (n, date) => `My preset · ${n} mods · ${date}`,

    regexInPlaceholder: 'Paste an in-game regex to pick its mods (e.g. !Leeched|Cooldown)',
    applyRegex: 'Pick from regex',
    regexNeeded: 'Paste the in-game regex you want to pick from.',
    regexError: (pattern, message) => `Regex error — ${pattern}: ${message}`,
    regexNoMods: 'No map mods match that regex.',
    regexApplied: (n) => `Picked ${n} mods from the regex`,
    regexAppliedPartly: (n, unmatched) =>
      `Picked ${n} mods from the regex (no match: ${unmatched})`,

    summaryMore: (n) => `…and ${n} more`,
    summaryStats: 'Stats',
    summaryGroupCount: (title, n) => `${title} ×${n}`,

    copyEnTitle: 'Copy the item text in English (for PoB)',
    copyEnReloaded: 'The extension was reloaded. Open the page again.',
    copyEnFailed: 'Could not fetch the English item text.',
    copyEnOffline: (detail) => `Could not reach the English trade site. (${detail})`,
    copyEnRateLimit: (retry) => `Rate limit hit. Try again in ${retry}s.`,
    copyEnHttp: (status) => `Could not fetch the English item text. (HTTP ${status})`,
    copyEnBadResponse: 'The English trade site sent something we could not read.',
    copyEnNotFound: 'The English trade site does not have this item.',
    copyEnNoText: 'This item comes with no English text.',
    copyEnDecode: (detail) => `Could not read the English text. (${detail})`,
    copyEnClipboard: 'Could not write to the clipboard. Click the page and try again.',

    locale: 'en-GB',
  },
};

// 콘텐츠 스크립트는 전역을 나눠 쓴다. 패널이 시작할 때 정하고, 설정이 바뀌면 다시 정한다.
let uiLang = 'ko';

function setLang(lang) {
  uiLang = TEXT[lang] ? lang : 'ko';
  // 정규식 오류 문구도 같은 언어로 맞춘다 (poe-regex.js).
  if (typeof setRegexLanguage === 'function') setRegexLanguage(uiLang);
}

/** 지금 언어의 문구 묶음. */
function T() {
  return TEXT[uiLang];
}

/** 지금 언어의 맵모드 목록. 두 목록은 같은 순서·같은 id다. */
function mapModsFor(lang) {
  return lang === 'en'
    ? { mods: MAP_MODS_EN, groups: MOD_GROUPS_EN }
    : { mods: MAP_MODS_KO, groups: MOD_GROUPS_KO };
}

// 브라우저에서는 <script>로 로드되고, 테스트에서는 require로 쓴다.
if (typeof module !== 'undefined') {
  module.exports = { LANG_KEY, LANG_OPTIONS, KO_HOSTS, langForHost, resolveLang, TEXT, setLang, T };
}
