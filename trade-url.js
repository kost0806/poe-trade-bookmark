/**
 * PoE1 거래소 URL 파싱.
 *
 * 지원 형태:
 *   https://www.pathofexile.com/trade/search/<league>/<id>
 *   https://www.pathofexile.com/trade/search/<league>
 *   https://www.pathofexile.com/trade/exchange/<league>/<id>
 *   https://poe.kakaogames.com/trade/search/<league>/<id>  (한국 서버)
 *   https://poe.game.daum.net/trade/search/<league>/<id>   (한국 서버 구 도메인)
 *   위 형태에 /<locale>/ 세그먼트가 끼어드는 경우도 허용
 *
 * PoE2(/trade2/)는 대상이 아니므로 제외한다.
 *
 * 여기의 호스트 목록은 manifest.json의 content_scripts.matches와 함께 유지해야 한다.
 */
const TRADE_HOSTS = [
  'www.pathofexile.com',
  'pathofexile.com',
  'poe.kakaogames.com',
  'poe.game.daum.net',
  'br.pathofexile.com',
  'ru.pathofexile.com',
  'th.pathofexile.com',
  'de.pathofexile.com',
  'fr.pathofexile.com',
  'es.pathofexile.com',
  'jp.pathofexile.com',
  'kr.pathofexile.com',
];

function parseTradeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!TRADE_HOSTS.includes(url.hostname)) return null;

  const parts = url.pathname.split('/').filter(Boolean);
  const tradeIndex = parts.indexOf('trade');
  if (tradeIndex === -1) return null;

  const mode = parts[tradeIndex + 1];
  if (mode !== 'search' && mode !== 'exchange') return null;

  // trade/<mode> 뒤에 남는 세그먼트: [league] | [league, id] | [locale, league, id]
  const rest = parts.slice(tradeIndex + 2);
  if (rest.length === 0) return null;

  let league;
  let searchId = null;
  if (rest.length === 1) {
    league = rest[0];
  } else {
    league = rest[rest.length - 2];
    searchId = rest[rest.length - 1];
  }

  return {
    mode,
    league: decodeURIComponent(league),
    searchId,
    host: url.hostname,
    // 쿼리스트링/해시는 검색 결과와 무관하므로 버리고 정규화한다.
    url: `${url.origin}${url.pathname.replace(/\/$/, '')}`,
  };
}

function suggestTitle(parsed) {
  if (!parsed) return '';
  const modeLabel = parsed.mode === 'exchange' ? '대량거래' : '검색';
  return parsed.searchId
    ? `${parsed.league} ${modeLabel} ${parsed.searchId}`
    : `${parsed.league} ${modeLabel}`;
}
