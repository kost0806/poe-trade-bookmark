/**
 * 16T 8모드 지도 검색용 쿼리/정규식 생성.
 *
 * 거래소는 URL 파라미터로 검색 조건을 받지 않는다(trade 번들에 location.search
 * 처리가 없음). 대신 POST /api/trade/search/<리그>에 쿼리 JSON을 보내면 검색
 * id를 돌려주고, 그 id가 곧 /trade/search/<리그>/<id> 주소의 끝부분이 된다.
 */

// '# 속성 부여' — 지도의 모드 개수를 세는 유사(pseudo) 스탯
const AFFIX_COUNT_ID = 'pseudo.pseudo_number_of_affix_mods';

/*
 * 영향력 받은 지도를 빼기 위한 스탯 id.
 *
 * 거래소의 영향력 체크박스(shaper_item 류)는 지금 필터 목록에 아예 없고,
 * pseudo 영향력 스탯은 지도에 걸리지 않는다 — 지도 매물에는 influences 속성이
 * 없고 오로지 implicit 모드로만 표시되기 때문이다. 그래서 implicit id를 직접 뺀다.
 */
const INFLUENCE_IDS = [
  'implicit.stat_1792283443|1', // 쉐이퍼의 영향
  'implicit.stat_1792283443|2', // 엘더의 영향
  'implicit.stat_3624393862|1', // 속박자 점령
  'implicit.stat_3624393862|2', // 근절자 점령
  'implicit.stat_3624393862|3', // 압제자 점령
  'implicit.stat_3624393862|4', // 정화자 점령
  'implicit.stat_1795443614', // 엘더·쉐이퍼·정복자 전부
  'implicit.stat_2696470877', // 근원의 기억
];

// 거래 옵션 — 'securable'이 거래소의 '즉시 구입'이다.
// 귓속말을 기다려야 하는 직접 거래 매물은 8모드 지도를 사는 데 방해만 된다.
const STATUS_INSTANT_BUYOUT = 'securable';

// 서버(origin)는 패널이 붙어 있는 거래소 페이지에서 그대로 가져다 쓴다.
const DEFAULT_LEAGUE = 'Allflame';

// 인게임 검색창 입력 한도. 한도도 문법도 poe-regex.js가 갖고 있다.
const REGEX_MAX = POE_QUERY_MAX;

/** 거래소 검색 쿼리 JSON */
function buildSearchQuery({
  modIds = [],
  tier = 16,
  affixCount = 8,
  status = STATUS_INSTANT_BUYOUT,
} = {}) {
  const stats = [
    { type: 'and', filters: [{ id: AFFIX_COUNT_ID, value: { min: affixCount } }] },
    // 영향력 붙은 지도는 값도 성격도 달라서 늘 뺀다.
    { type: 'not', filters: INFLUENCE_IDS.map((id) => ({ id })) },
  ];
  // 거를 모드는 NOT 그룹 하나에 모두 넣는다.
  if (modIds.length) {
    stats.push({ type: 'not', filters: modIds.map((id) => ({ id })) });
  }

  return {
    query: {
      status: { option: status },
      filters: {
        type_filters: { filters: { category: { option: 'map' } } },
        map_filters: { filters: { map_tier: { min: tier, max: tier } } },
      },
      stats,
    },
    sort: { price: 'asc' },
  };
}

/**
 * 인게임 정규식. '!'는 부정(선택한 모드가 없는 지도만 표시),
 * 각 모드는 그 모드에만 매칭되는 최단 부분문자열, 공백은 .으로 쓴다.
 */
function buildRegex(mods) {
  if (!mods.length) return '';
  // 짧은 키워드를 앞에 두어 잘렸을 때도 더 많은 모드가 살아남게 한다.
  const keys = [...new Set(mods.map((m) => m.regex))].sort((a, b) => a.length - b.length);
  return '!' + keys.join('|');
}

/* ---------------- 정규식 → 모드 (역방향) ---------------- */

/*
 * 맞춰 보는 일은 poe-regex.js가 한다. 자바스크립트의 RegExp를 쓰면 게임에 없는
 * 문법(전방 탐색 등)까지 통과시켜, 확장에서만 걸리고 게임에서는 안 걸리는
 * 정규식을 멀쩡한 것처럼 받아 주게 된다.
 */

/*
 * 모드 text의 수치 구간 "(22—25)%"는 실제 아이템에서는 "23%"처럼 한 값으로
 * 찍힌다. poe.re 등에서 만든 정규식은 실제 문구를 기준으로 하므로("피해...%"),
 * 구간을 첫 값으로 치환한 표본도 같이 대조한다.
 */
const RANGE_RE = /\((-?\d+)—(-?\d+)\)/g;

/** 정규식을 맞춰 볼 문구 — 원문 + 수치 구간을 채운 표본 */
function modTexts(mod) {
  const raw = mod.text;
  const sample = mod.text.replace(RANGE_RE, '$1');
  return raw === sample ? [raw] : [raw, sample];
}

/**
 * 인게임 정규식을 개별 패턴으로 쪼갠다.
 * 여기서는 어떤 모드를 가리키는지만 필요하므로 부정('!')과 따옴표는 벗기고
 * 최상위 '|'로 나뉜 대안을 전부 편다.
 */
function parseRegexInput(input) {
  const patterns = [];
  for (const term of splitTerms(input)) {
    patterns.push(...splitAlternatives(term.pattern));
  }
  return patterns;
}

/** 패턴 하나가 이 모드의 문구에 걸리는지. 문법이 깨진 패턴은 불일치로 본다. */
function modMatchesPattern(pattern, mod) {
  const compiled = compileQuery(pattern);
  if (compiled.errors.length) return false;
  return modTexts(mod).some((text) => compiled.test(text));
}

/**
 * 인게임 정규식에서 거를 모드 목록을 복원한다.
 *
 * 넓은 패턴은 여러 모드에 걸릴 수 있고(인게임에서도 전부 숨겨지므로 전부
 * 선택하는 것이 맞다), 지도 모드가 아닌 줄(아이템 이름·속성 줄)만 노리는
 * 패턴은 어디에도 안 걸려 unmatched로 남는다.
 */
function matchModsByRegex(input, mods) {
  const matched = new Set();
  const unmatched = [];
  const invalid = [];

  for (const pattern of parseRegexInput(input)) {
    const compiled = compileQuery(pattern);
    if (compiled.errors.length) {
      invalid.push({ pattern, message: compiled.errors[0].message });
      continue;
    }
    const hits = mods.filter((mod) => modTexts(mod).some((text) => compiled.test(text)));
    if (hits.length) hits.forEach((mod) => matched.add(mod));
    else unmatched.push(pattern);
  }

  return { mods: [...matched], unmatched, invalid };
}

// 브라우저에서는 <script>로 로드되고, 테스트에서는 require로 쓴다.
if (typeof module !== 'undefined') {
  module.exports = {
    buildSearchQuery,
    buildRegex,
    parseRegexInput,
    modMatchesPattern,
    matchModsByRegex,
    AFFIX_COUNT_ID,
    INFLUENCE_IDS,
    STATUS_INSTANT_BUYOUT,
    REGEX_MAX,
  };
}
