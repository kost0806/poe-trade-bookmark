/**
 * 16T 8모드 지도 검색용 쿼리/정규식 생성.
 *
 * 거래소는 URL 파라미터로 검색 조건을 받지 않는다(trade 번들에 location.search
 * 처리가 없음). 대신 POST /api/trade/search/<리그>에 쿼리 JSON을 보내면 검색
 * id를 돌려주고, 그 id가 곧 /trade/search/<리그>/<id> 주소의 끝부분이 된다.
 */

// '# 속성 부여' — 지도의 모드 개수를 세는 유사(pseudo) 스탯
const AFFIX_COUNT_ID = 'pseudo.pseudo_number_of_affix_mods';

// 서버(origin)는 패널이 붙어 있는 거래소 페이지에서 그대로 가져다 쓴다.
const DEFAULT_LEAGUE = 'Allflame';

// 인게임 검색창 입력 한도
const REGEX_MAX = 250;

/** 거래소 검색 쿼리 JSON */
function buildSearchQuery({ modIds = [], tier = 16, affixCount = 8, onlineOnly = true } = {}) {
  const stats = [
    { type: 'and', filters: [{ id: AFFIX_COUNT_ID, value: { min: affixCount } }] },
  ];
  // 거를 모드는 NOT 그룹 하나에 모두 넣는다.
  if (modIds.length) {
    stats.push({ type: 'not', filters: modIds.map((id) => ({ id })) });
  }

  return {
    query: {
      status: { option: onlineOnly ? 'online' : 'any' },
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

// 브라우저에서는 <script>로 로드되고, 테스트에서는 require로 쓴다.
if (typeof module !== 'undefined') {
  module.exports = { buildSearchQuery, buildRegex, AFFIX_COUNT_ID, REGEX_MAX };
}
