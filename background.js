/*
 * 영문 아이템 정보를 가져오는 서비스 워커.
 *
 * 거래소는 아이템 텍스트를 사이트 언어로만 준다. 한국 서버(poe.kakaogames.com)나
 * kr.pathofexile.com에서 보면 스탯 문구가 전부 한글이라 PoB에 붙여넣을 수 없다.
 *
 * 아이템 ID는 realm이나 언어와 무관한 해시라서, 같은 ID를 영문 거래소에 다시
 * 물어보면 GGG가 직접 번역한 영문 텍스트가 그대로 나온다. 사전을 만들어 옮기는
 * 것보다 정확하다 — 옮기는 과정이 아예 없기 때문이다.
 *
 * 이 요청은 페이지와 다른 출처로 나가고 거래소 API는 CORS 헤더를 주지 않으므로
 * 콘텐츠 스크립트에서는 보낼 수 없다. host_permissions를 가진 여기서 대신 보낸다.
 *
 * 실패는 글자가 아니라 까닭(code)으로 돌려준다. 화면 언어는 탭마다 다를 수 있고
 * (`lang.js`), 서비스 워커는 그것을 모른다. 글자로 바꾸는 일은 copy-en.js가 한다.
 */

const EN_ORIGIN = 'https://www.pathofexile.com';

/**
 * 응답의 extended.text는 UTF-8을 base64로 감싼 값이다.
 * atob()만 쓰면 바이트가 그대로 문자가 되어 비ASCII 글자가 깨지므로 한 번 더 푼다.
 */
function decodeItemText(encoded) {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * 아이템 하나의 영문 텍스트를 가져온다.
 * 성공하면 { ok: true, text }, 실패하면 { ok: false, code, detail }을 돌려준다.
 *
 * query 파라미터(검색 ID)는 붙이지 않는다. 한국 서버의 검색 ID는 영문 거래소에
 * 없고, fetch는 검색 ID 없이도 아이템을 돌려준다.
 * 로그인 정보도 보내지 않는다 — 필요 없고, 요청 한도도 계정이 아닌 IP로 잡힌다.
 */
async function fetchEnglishItem(itemId) {
  let res;
  try {
    res = await fetch(`${EN_ORIGIN}/api/trade/fetch/${encodeURIComponent(itemId)}`, {
      credentials: 'omit',
    });
  } catch (e) {
    return { ok: false, code: 'offline', detail: e.message };
  }

  if (res.status === 429) {
    // 아이템 조회 한도는 IP 기준 5분당 50회다. 넘기면 잠시 막힌다.
    const retry = res.headers.get('Retry-After');
    return { ok: false, code: 'rateLimit', detail: retry };
  }
  if (!res.ok) {
    return { ok: false, code: 'http', detail: res.status };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    return { ok: false, code: 'badResponse' };
  }

  const item = body.result?.[0]?.item;
  if (!item) {
    // 판매가 내려갔거나, 아직 영문 거래소에 올라오지 않은 아이템.
    return { ok: false, code: 'notFound' };
  }

  const encoded = item.extended?.text;
  if (!encoded) {
    return { ok: false, code: 'noText' };
  }

  try {
    return { ok: true, text: decodeItemText(encoded) };
  } catch (e) {
    return { ok: false, code: 'decode', detail: e.message };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'fetchEnglishItem') return;

  fetchEnglishItem(message.itemId).then(sendResponse);
  return true; // 비동기 응답
});
