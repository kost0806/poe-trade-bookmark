/*
 * 검색 결과의 아이템을 영문 텍스트로 복사한다 (PoB 붙여넣기용).
 *
 * 결과 줄에 마우스를 올리면 아이템 그림 옆에 EN 단추가 나오고, 누르면 그 아이템의
 * 영문 정보가 클립보드에 들어간다. 붙여넣는 내용은 거래소가 주는 아이템 텍스트
 * 그대로라 PoB의 "Import item" 칸에 바로 넣을 수 있다.
 *
 * 영문 텍스트는 background.js가 영문 거래소에서 받아 온다(왜 그런지는 거기 설명).
 *
 * 다른 파일과 전역 이름이 겹치지 않도록 통째로 IIFE 안에 둔다.
 * (콘텐츠 스크립트는 모두 같은 스코프를 공유한다.)
 */
(() => {
  // 거래소 결과 줄의 구조: .results > .row[data-id] > .left(아이템 그림·이름)
  const ROW_SELECTOR = '.results .row[data-id]';
  // 거래소가 .row 클래스를 바꾸면 결과 영역 바로 아래 칸을 줄로 본다.
  // 위 선택자가 하나도 안 잡힐 때만 쓴다 (겹쳐 잡아 단추가 둘 붙지 않도록).
  const ROW_FALLBACK_SELECTOR = '.results > [data-id]';
  const BTN_CLASS = 'ptb-en-copy';
  // 단추를 이미 붙인 줄 표시. 줄은 스크롤할 때마다 새로 추가된다.
  const MARK = 'ptbEn';

  const LABEL = 'EN';
  // 복사됨/오류 표시를 잠깐 보여 준 뒤 원래 라벨로 되돌린다.
  const FLASH_MS = 1400;
  // 결과가 바뀔 때마다 훑지 않도록 잠깐 모아서 한 번에 처리한다.
  const SWEEP_DELAY_MS = 120;

  // 같은 아이템을 다시 누를 때 요청을 아낀다. 아이템 텍스트는 변하지 않는다.
  const cache = new Map(); // itemId -> 영문 텍스트
  const inFlight = new Map(); // itemId -> Promise (연타로 중복 요청하지 않도록)

  /**
   * 서비스 워커가 돌려준 까닭을 지금 화면 언어의 글자로 바꾼다.
   * (까닭만 돌려주는 이유는 background.js에 적어 두었다.)
   */
  function errorText({ code, detail }) {
    const t = T();
    switch (code) {
      case 'reloaded': return t.copyEnReloaded;
      case 'offline': return t.copyEnOffline(detail);
      case 'rateLimit': return t.copyEnRateLimit(detail ?? t.searchRateLimitedSoon);
      case 'http': return t.copyEnHttp(detail);
      case 'badResponse': return t.copyEnBadResponse;
      case 'notFound': return t.copyEnNotFound;
      case 'noText': return t.copyEnNoText;
      case 'decode': return t.copyEnDecode(detail);
      default: return t.copyEnFailed;
    }
  }

  /** 대량거래(exchange)는 통화 묶음이라 붙일 이유가 없다. 일반 검색에서만 붙인다. */
  function onSearchPage() {
    return parseTradeUrl(location.href)?.mode === 'search';
  }

  async function requestEnglishText(itemId) {
    if (cache.has(itemId)) return { ok: true, text: cache.get(itemId) };
    if (inFlight.has(itemId)) return inFlight.get(itemId);

    const promise = (async () => {
      let res;
      try {
        res = await chrome.runtime.sendMessage({ type: 'fetchEnglishItem', itemId });
      } catch {
        // 확장을 새로 로드하면 페이지에 남은 스크립트는 연결이 끊긴다.
        return { ok: false, code: 'reloaded' };
      }
      if (!res) return { ok: false, code: 'noAnswer' };
      if (res.ok) cache.set(itemId, res.text);
      return res;
    })();

    inFlight.set(itemId, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(itemId);
    }
  }

  /**
   * 클립보드 API는 문서가 포커스를 잃었거나 권한이 막히면 거절한다.
   * 그때는 예전 방식(숨긴 textarea + execCommand)으로 한 번 더 시도한다.
   */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* 아래 방식으로 다시 시도 */
    }

    const active = document.activeElement;
    const area = document.createElement('textarea');
    area.value = text;
    // 화면 밖에 두되 화면을 흔들지 않도록 스크롤 위치에 맞춰 붙인다.
    area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;';
    document.body.append(area);
    area.select();

    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }

    area.remove();
    if (active instanceof HTMLElement) active.focus();
    return ok;
  }

  // 되돌리기 타이머는 단추마다 따로 잡는다. 하나로 두면 다른 줄을 이어 눌렀을 때
  // 앞 단추가 ✓ 표시에 갇힌다.
  const flashTimers = new WeakMap();

  function flash(button, label, kind) {
    button.textContent = label;
    button.classList.toggle('ptb-ok', kind === 'ok');
    button.classList.toggle('ptb-error', kind === 'error');
    clearTimeout(flashTimers.get(button));
    flashTimers.set(
      button,
      setTimeout(() => {
        button.textContent = LABEL;
        button.title = T().copyEnTitle;
        button.classList.remove('ptb-ok', 'ptb-error');
      }, FLASH_MS)
    );
  }

  async function handleClick(event) {
    // 거래소가 줄 클릭에 걸어 둔 동작(아이템 펼치기 등)까지 일어나지 않게 한다.
    event.stopPropagation();

    const button = event.currentTarget;
    const itemId = button.closest('[data-id]')?.dataset.id;
    if (!itemId) return;

    clearTimeout(flashTimers.get(button));
    button.disabled = true;
    button.textContent = '…';
    button.classList.remove('ptb-ok', 'ptb-error');

    const result = await requestEnglishText(itemId);

    if (!result.ok) {
      button.title = errorText(result);
      flash(button, '!', 'error');
    } else if (await copyText(result.text)) {
      button.title = T().copyEnTitle;
      flash(button, '✓', 'ok');
    } else {
      button.title = T().copyEnClipboard;
      flash(button, '!', 'error');
    }

    button.disabled = false;
  }

  function addButton(row) {
    if (row.dataset[MARK]) return;
    row.dataset[MARK] = '1';

    // 단추는 줄을 기준으로 자리를 잡는다. 거래소가 이미 줄을 기준점으로 쓰고
    // 있지만, 아니라면 우리가 세운다(자리만 잡을 뿐 배치는 바뀌지 않는다).
    if (getComputedStyle(row).position === 'static') row.style.position = 'relative';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BTN_CLASS;
    button.textContent = LABEL;
    button.title = T().copyEnTitle;
    button.addEventListener('click', handleClick);
    // 거래소는 줄에서 mousedown도 따로 듣는다. 클릭만 막아서는 새어 나간다.
    button.addEventListener('mousedown', (e) => e.stopPropagation());

    // 아이템 그림이 있는 왼쪽 칸에 넣는다. 구조가 바뀌면 줄에 바로 붙인다.
    (row.querySelector('.left') ?? row).append(button);
  }

  function sweep() {
    if (!onSearchPage()) return;

    let rows = document.querySelectorAll(ROW_SELECTOR);
    if (!rows.length) rows = document.querySelectorAll(ROW_FALLBACK_SELECTOR);

    for (const row of rows) addButton(row);
  }

  // 결과는 스크롤할 때마다 이어 붙고, 라이브 검색이면 계속 들어온다.
  // 거래소는 SPA라 결과 영역 자체가 통째로 갈릴 수 있어 문서 전체를 지켜본다.
  let sweepTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(sweep, SWEEP_DELAY_MS);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  sweep();
})();
