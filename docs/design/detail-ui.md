# 모듈 상세 설계 3편 — 사이드바 셸·EN 복사

이 편은 **남의 페이지 안에서 사는 UI**의 코드 레벨 설계를 다룹니다. 거래소 문서에 사이드바를 심고 그 스타일을 격리하는 셸, 그 위에 얹힌 모드 고르기 창의 껍데기, 그리고 결과 줄마다 붙어 아이템을 영문으로 복사해 주는 EN 단추와 서비스 워커입니다. 공통 주제는 하나입니다 — **거래소와 섞이지 않으면서, 거래소가 바뀌어도 조용히 죽지 않는 것.**

| 항목 | 내용 |
| --- | --- |
| 담당 파일 | `panel.css`, `copy-en.js`, `copy-en.css`, `background.js`, `manifest.json` |
| `panel.js` 담당 줄 | `:1`~`:247` (상수·`PANEL_HTML`·호스트 심기·스타일·키 차단·요소 참조·여닫기), `:1122`~`:1167` (모드 고르기 창 껍데기), `:1449`~`:1468` (`init`) |
| 계약 테스트 | 없음. 브라우저가 있어야 확인되는 자리라 `../REQUIREMENT.md` §7의 수용 기준으로 대신한다 |
| 요구사항 | [`../REQUIREMENT.md`](../REQUIREMENT.md) §3.1 사이드바(FR-PANEL) · §3.6 모드 고르기 창(FR-MODAL) · §3.10 영문 복사(FR-EN) · §5.3 견고성(NFR-ROB) |

**경계에 걸친 항목** — 모드 고르기 창은 **껍데기가 이 편, 속이 2편**입니다. 띄우고 닫고 보기를 전환하는 것(`panel.js:1122`~`:1166`)은 여기서, 그 안에서 선택 집합을 바꾸는 동작(체크박스·전체 해제·프리셋·정규식 역선택)은 2편에서 다룹니다. 목록을 그리는 **정책**(통째로 다시 그리기, `createElement`)은 셸의 결정이라 이 편(§2.8)이지만, **목록 항목의 단추 동작**은 1편입니다. 절 접기는 그 기능을 맡은 편이 다루므로 기록은 1편, 빌더는 2편이고, 사이드바 자체의 여닫기만 이 편입니다.

**함께 읽을 문서** — 상위 설계는 [`../DESIGN.md`](../DESIGN.md), 선택의 배경은 [`adr.md`](adr.md), 나머지 상세는 [1편 검색 판독·북마크](detail-search.md)와 [2편 정규식 엔진·8모드 빌더](detail-mapfilter.md)입니다.

---

## 1. 모듈 지도

| 자리 | 실체 | 사는 곳 | 코드 |
| --- | --- | --- | --- |
| 사이드바 | `<div id="poe-trade-bookmark-root">` + open 모드 Shadow DOM | `document.documentElement`의 마지막 자식 | `panel.js:152`, `:159`, `:170` |
| EN 단추 | 결과 줄마다 하나씩 붙는 `<button class="ptb-en-copy">` | 거래소 DOM 안(줄의 `.left`) | `copy-en.js:152`, `:162` |
| 서비스 워커 | MV3 background | 페이지 밖 | `background.js:35`, `manifest.json:8` |

세 자리 사이의 통신은 세 갈래뿐입니다.

- **EN 단추 → 서비스 워커**: `chrome.runtime.sendMessage({type:'fetchEnglishItem', itemId})`(`copy-en.js:46`)와 `onMessage` 리스너(`background.js:79`). 리스너는 `return true`로 비동기 응답을 예약합니다.
- **사이드바 ↔ 저장소**: `chrome.storage.local`과 `chrome.storage.onChanged`(`panel.js:757`). 다른 탭의 변경도 같은 경로로 들어옵니다(1편 §6.6).
- **콘텐츠 스크립트끼리**: 메시지가 아니라 **공유 전역**입니다. `manifest.json:28`~`:38`이 한 문서에 아홉 파일을 같은 스코프로 주입하므로, `copy-en.js:36`은 `trade-url.js`의 `parseTradeUrl`을 그냥 호출합니다. 그래서 `copy-en.js`는 통째로 IIFE로 감싸 이름 충돌을 막고(`copy-en.js:13`), `panel.js`는 전역을 그대로 씁니다.

사이드바와 EN 단추는 **서로를 모릅니다** — 참조도 이벤트도 없어, 한쪽이 깨져도 다른 쪽은 그대로 돕니다(→ `../DESIGN.md` §4).

---

## 2. 사이드바 셸 설계

### 2.1 호스트 요소 심기

호스트는 빈 `<div>` 하나이고, 위치·쌓임 순서를 인라인 `cssText`로 못 박습니다(`panel.js:156`~`:157`).

| 인라인 선언 | 역할 |
| --- | --- |
| `position:fixed; top/right/bottom:0` | 화면 오른쪽 끝에 세로로 세운다. 페이지 스크롤과 무관하게 붙어 있다 |
| `z-index:2147483647` | 거래소가 어떤 값을 쓰든 위에 온다 |
| `margin/padding/border:0`, `width:auto` | 거래소의 `div` 대상 전역 규칙이 호스트를 부풀리지 못하게 한다 |
| `display:none` | 스타일이 붙기 전의 맨 얼굴을 감춘다 |

**인라인으로 둔 이유**: 호스트는 Shadow DOM 바깥이라 `panel.css`가 닿지 않고(`:host` 규칙은 쓰지 않았습니다), 인라인은 거래소 CSS와의 우선순위 싸움을 아예 없앱니다.

`display:none`은 `applyStyles()`가 끝나는 지점에서 성공·실패와 무관하게 해제됩니다(`panel.js:187`). `init()`이 `applyStyles`를 가장 먼저 `await`하므로(`panel.js:1450`), 스타일 없는 HTML이 한 프레임 노출되는 일이 없습니다.

붙이는 곳이 `body`가 아니라 `documentElement`인 이유는 주석에 적혀 있습니다(`panel.js:169`): 거래소는 SPA라 `body`를 통째로 갈아끼울 수 있고, 그러면 패널이 함께 사라집니다.

### 2.2 Shadow DOM 경계가 지키는 것

`host.attachShadow({ mode: 'open' })`(`panel.js:159`). 경계가 막는 것은 두 가지입니다.

1. **CSS 양방향 격리.** 거래소 규칙은 안으로 들어오지 못하고, `panel.css`의 `button`·`label`·`h2` 같은 태그 선택자(`panel.css:124`, `:137`, `:159`)는 밖으로 새지 않습니다. 다만 **상속되는 속성**(색, 글꼴 등)은 호스트를 타고 흘러 들어오므로 `.wrap`에서 `all: initial`로 한 번 끊습니다(`panel.css:7`, 근거는 `panel.css:2`~`:3` 주석).
2. **키 이벤트 차단.** `keydown`/`keyup`/`keypress` 세 종류를 호스트에서 `stopPropagation()` 합니다(`panel.js:191`~`:193`). 거래소의 전역 단축키가 패널 입력 칸의 타이핑을 가로채지 않게 하려는 것입니다(FR-PANEL-08). 리스너를 **호스트에 건다**는 점이 중요합니다 — 그림자 안에서 올라온 이벤트는 호스트에서 리타깃되고 여기서 끊으면 문서까지 가지 않습니다. 덕분에 그림자 루트에 건 Esc 리스너(`panel.js:1161`)와 2편 §5.7의 Enter 단축키는 호스트보다 **먼저** 실행되어 정상 동작하고, 그 뒤 막힙니다.

### 2.3 `adoptedStyleSheets`로 넣는 이유

`applyStyles()`는 `chrome.runtime.getURL('panel.css')`를 `fetch`해 문자열로 읽고, `new CSSStyleSheet()` + `replaceSync()`로 만든 시트를 `root.adoptedStyleSheets`에 넣습니다(`panel.js:179`~`:182`).

`<link>`나 `<style>`을 쓰지 않은 이유는 주석에 있습니다(`panel.js:173`~`:176`): 거래소의 CSP `style-src`가 그것들을 막을 수 있지만, 코드로 만든 시트는 **문서가 로드하는 리소스가 아니므로** CSP 판정 대상이 아닙니다. `fetch` 대상이 확장 리소스이므로 `manifest.json:43`의 `web_accessible_resources`에 `panel.css`가 등재되어 있어야 하고, 실제로 등재되어 있습니다(`manifest.json:45`).

실패 시에는 `console.warn`만 남기고 계속 진행합니다(`panel.js:183`~`:186`). `catch` 뒤에서도 `host.style.display = ''`가 실행되므로(`panel.js:187`), **모양만 잃고 기능은 삽니다** — FR-PANEL-09의 "스타일을 못 읽어도 기능은 계속 동작한다"가 이 한 줄의 배치로 보장됩니다. `CSSStyleSheet` 생성자와 `adoptedStyleSheets` 배열 할당은 `manifest.json:6`의 `minimum_chrome_version: 102`가 덮습니다.

### 2.4 폭을 한곳에서만 정하기

폭 값은 `PANEL_WIDTH = 'min(360px, 50vw)'` 하나(`panel.js:23`)이고, 패널 자신의 너비(`panel.js:165` → `panel.css:69`의 `width: var(--panel-width)`)와 페이지를 밀어낼 거리(`pushPage`의 `margin-right`, `panel.js:223`) 두 곳에서 쓰입니다. **둘이 반드시 같아야** 패널이 밀어낸 자리에 정확히 들어앉습니다(`panel.css:66`의 주석). 그래서 값의 출처를 JS 상수 하나로 두고 CSS는 변수를 읽기만 합니다. `min(360px, 50vw)`는 좁은 창에서 거래소가 완전히 가려지지 않게 하려는 상한입니다(FR-PANEL-04).

`all: initial`과의 관계: `.wrap`은 상속을 끊은 뒤 같은 블록에서 토큰과 레이아웃을 다시 선언합니다(`panel.css:7`~`:24`). `--panel-width`만은 CSS 파일이 JS 상수를 알 수 없으므로 인라인으로 심습니다.

### 2.5 페이지를 밀어내는 방식

`pushPage(open)`(`panel.js:221`)은 `document.documentElement.style`의 `margin-right`를 `important` 우선순위로 켜고, 닫을 때 `removeProperty`로 지웁니다(`panel.js:223`~`:224`). `!important`는 거래소가 `<html>`에 자체 margin을 줄 경우에도 이기기 위한 것입니다(`panel.js:219`의 주석).

**설계 약속**: 거래소 문서에 남기는 레이아웃 흔적은 이것 하나뿐입니다(FR-PANEL-03, NFR-ROB-05). 요소를 삽입하거나 클래스를 붙이지 않고, `<body>`는 건드리지 않습니다. 유일한 예외는 EN 단추 쪽의 `position: relative` 승격(§4.1)이며, 그 역시 배치를 바꾸지 않는 기준점 세우기입니다.

부수 효과: `margin-right`가 켜져도 뷰포트 폭 자체는 그대로이므로 `50vw`가 재계산되지 않고, 패널 폭과 밀어낸 거리는 계속 일치합니다.

### 2.6 여닫기 상태

`setPanelOpen(open)`(`panel.js:238`)이 유일한 진입점입니다. 하는 일은 `panel[hidden]` 토글 → (닫을 때) `closeMods()` → `renderPanel()` → 저장, 넷입니다. `renderPanel()`(`panel.js:227`)은 `panelEl.hidden`을 **단일 진실**로 읽어 `.wrap.open` 클래스, 손잡이 글자(`▶`/`◀`), `title`, `aria-label`, `aria-expanded`, `pushPage`까지 한 번에 맞춥니다. 상태를 여러 곳에 복제하지 않으므로 어긋날 여지가 없습니다. 기본값은 접힘입니다 — `stored[PANEL_OPEN_KEY] !== true`(`panel.js:1454`)라 저장값이 없으면 닫힌 채로 시작합니다(FR-PANEL-05). 기록 절과 빌더 절의 접기는 같은 장치를 쓰지만 기본값과 저장 위치가 달라 각각 1편 §6.5와 2편 §5.5에서 다룹니다.

### 2.7 모드 고르기 창

**`.panel` 바깥에 둔 이유.** 창의 마크업은 `PANEL_HTML` 안에서 `.panel`의 형제입니다(`panel.js:97`, 주석은 `panel.js:93`~`:96`). `.panel`은 `overflow: hidden`이고(`panel.css:73`) 폭이 360px로 묶여 있어, 창을 그 안에 두면 잘립니다.

**`position: fixed` 선택.** `.modal`은 `position: fixed; inset: 0`로 화면 전체를 덮고 그 안에서 가운데 정렬합니다(`panel.css:286`). 화면 기준이므로 `<html>`의 `margin-right`에도, `.panel`의 `overflow`에도 영향을 받지 않습니다(`panel.css:283`~`:285`의 주석, FR-MODAL-01). 상자는 `min(1080px, 92vw)` 폭으로 넓게 펴집니다(`panel.css:310`). 창이 화면을 통째로 덮으므로 사이드바의 안내 문구가 가려지고, 그래서 빌더의 상태 문구는 두 곳에 동시에 쓰입니다(2편 §5.3).

**닫는 경로 네 가지**(FR-MODAL-02): 닫기 단추(`panel.js:1153`), 완료 단추(`panel.js:1154`), 바깥 클릭(`panel.js:1156`), Esc(`panel.js:1161`). 바깥 클릭은 전용 요소 `#mod-back`(`panel.css:299`)에 리스너를 걸어 상자 안 클릭과 헷갈릴 여지를 없앴습니다. 선택은 체크박스 변경 즉시 저장되므로(2편 §5.1) 어떤 경로로 닫아도 잃을 것이 없습니다. 여기에 더해 **사이드바를 접으면 창도 닫힙니다**(`panel.js:241`) — 칸 없이 창만 떠 있을 이유가 없습니다(FR-MODAL-08).

**Esc의 2단 처리.** 리스너는 창이 닫혀 있으면 아무것도 하지 않고 빠집니다(`panel.js:1162`). 열려 있으면 프리셋 이름 입력 줄이 펴져 있는지를 먼저 봅니다 — 펴져 있으면 그것만 접고(`panel.js:1164`), 아니면 창을 닫습니다(`panel.js:1165`). 이름을 짓다 말았다고 창까지 닫히면 골라 둔 맥락을 잃기 때문입니다.

**열 때의 초기화**(`openMods`, `panel.js:1137`): 보기 모드를 늘 '전체'로 되돌리고(`setView(false)`, `panel.js:1140`), 이름 입력 줄을 접고(`panel.js:1142`), 검색 칸에 포커스를 준 뒤 기존 값을 통째로 선택합니다(`panel.js:1144`~`:1145`). 지난번 '고른 것만'에 갇히지 않게 하려는 것입니다. `setView`(`panel.js:1125`)는 두 단추의 `on` 클래스와 `aria-pressed`를 **함께** 뒤집으므로(`panel.js:1131`~`:1132`), §2.6의 `renderPanel`이 손잡이에 하는 것과 마찬가지로 보기 상태가 보조기술에도 그대로 전달됩니다. 같은 머리줄에 있는 '전체 해제'는 선택 집합을 건드리므로 2편 §5.7에서 다룹니다(FR-MODAL-06은 이 둘에 걸쳐 있습니다).

### 2.8 렌더 방식

1. **정적 골격은 템플릿 문자열 한 덩어리.** `PANEL_HTML`(`panel.js:25`~`:148`)을 `wrapEl.innerHTML`에 한 번 넣습니다(`panel.js:166`). 이 문자열에는 **주입 값이 하나도 없습니다** — 전부 리터럴이라 조립 과정이 없고, 따라서 인젝션 경로도 없습니다.
2. **이후 모든 동적 DOM은 `createElement`.** 북마크 줄(`panel.js:331`~`:348`), 삭제/정규식 단추(`panel.js:366`, `:378`), 기록 줄(`panel.js:482`), 모드 항목과 계열 제목(`panel.js:883`~`:922`), 프리셋 `optgroup`(`panel.js:1207`, `:1213`), 리그 `option`(`panel.js:1000`, `fillLeagues` 안) — 문자열 HTML을 만드는 곳이 한 군데도 없고, 텍스트는 모두 `textContent`로 넣습니다. 북마크 이름·프리셋 이름·리그 이름은 사용자나 거래소에서 온 값이므로 이 규칙이 유일한 방어선입니다.

**목록은 통째로 다시 그립니다.** 지우는 방식은 `container.textContent = ''` 한 줄입니다(`panel.js:351`, `:477`, `:875`, `:998`, `:1204`). diff도 키도 없고, 다시 그릴 때 리스너를 새 요소에 다시 답니다. 이 단순 전략이 타당한 근거는 **항목 수 상한**입니다.

| 목록 | 상한 | 근거 |
| --- | --- | --- |
| 검색 기록 | 50 | `HISTORY_MAX`(`panel.js:403`), 저장 시 `slice`(`panel.js:473`) |
| 맵모드 | 80 | `map-mods.js`의 `MAP_MODS` 항목 수 |
| 리그 | 리그 목록 길이(수십) | `panel.js:999` |
| 북마크 | 상한 없음 | ⚠ 코드상 개수 제한이 없다. 수백 개가 쌓이면 매 `storage.onChanged`마다 전체 재렌더가 돈다 |

재렌더가 도는 시점도 드뭅니다 — 저장소 변경(`panel.js:757`), 검색어 입력(`panel.js:1093`), 보기 전환(`panel.js:1134`) 정도이고 스크롤이나 마우스 이동으로는 돌지 않습니다. 이 규모에서 가상화나 부분 갱신은 얻는 것보다 잃는 코드가 큽니다.

---

## 3. `panel.css` 체계

### 3.1 토큰

`.wrap` 한 블록에 색 토큰 8개가 모여 있습니다(`panel.css:9`~`:16`): `--bg` `--card` `--border` `--text` `--muted` `--accent` `--accent-hover` `--danger`. 어두운 갈색 계열은 거래소 톤에 맞춘 것이고, `--panel-width`만 JS가 인라인으로 심습니다(§2.4). 토큰을 `:root`가 아니라 `.wrap`에 둔 것은 그림자 트리에서 `:root`가 실제 스타일 대상이 아니기 때문이며, `all: initial`(`panel.css:7`) 바로 다음 줄이라 리셋과 토큰 정의가 한눈에 붙어 있습니다.

### 3.2 상태 클래스

| 클래스 | 의미 | 위치 |
| --- | --- | --- |
| `.wrap.open` | 사이드바 열림. 쓰이는 곳은 손잡이 강조 한 군데뿐 | `panel.css:61` |
| `.mod-item.on` | 고른 모드. 배경색 + 왼쪽 `inset box-shadow` 2px | `panel.css:442` |
| `.seg-btn.on` | 보기 전환에서 눌린 쪽 | `panel.css:392` |
| `.status.error` / `.status.ok` | 안내 문구의 실패/성공 | `panel.css:190` / `:194` |
| `.count.over` / `.modal-regex.over` | 정규식이 길이 상한을 넘음 | `panel.css:533` / `:490` |
| `[hidden]` | 접힘. `display`를 직접 준 요소는 별도 규칙 필요 | `panel.css:79`, `:295`, `:339` |

`.status`의 두 클래스는 `setStatus`(1편 §6.6)와 `setBuilderStatus`(2편 §5.3)가 문자열로 그대로 붙이는 이름이라, **CSS 클래스 이름이 곧 두 함수의 인자 규약**입니다.

`[hidden]` 세 줄은 **의도적인 중복**입니다. `hidden` 속성의 UA 규칙(`display:none`)은 저자 스타일의 `display: flex`에 집니다. `.panel`·`.modal`·`.modal-tools`는 모두 `display: flex`를 갖고 있으므로, 각각 `[hidden] { display: none }`을 따로 써 줘야 접힙니다(`panel.css:338`의 주석이 이를 명시).

상태 색은 세 가지로 통일되어 있습니다 — 성공 `#8fb56a`, 오류/초과 `#d08a6a`, 파괴 `--danger #8c3b3b`. 오류색과 초과색이 같은 값인 것은 "정상이 아님"을 한 가지 신호로 묶은 결과입니다.

### 3.3 레이아웃 축

- **사이드바 축**: `.wrap`이 `flex-direction: row`로 손잡이와 패널을 가로로 세웁니다(`panel.css:19`~`:21`). `.toggle`은 `flex: none`(`panel.css:39`)이라 패널이 접혀도 화면에 남습니다. 세로 방향은 `.panel` → `.body`(`overflow-y: auto`, `panel.css:90`) → `.card`들이고, 목록 카드만 `flex: 1`을 받습니다(`panel.css:118`). 그 안의 `.list`도 `flex:1; min-height:0; overflow-y:auto`(`panel.css:537`~`:540`)라 **목록 안에서만** 스크롤합니다. 기록 목록은 반대로 `flex: none; max-height: 168px`(`panel.css:587`~`:589`)로 제 높이만 씁니다 — 북마크가 주인공이고 기록은 곁가지라는 우선순위를 CSS가 그대로 표현합니다.
- **모달 축**: `.modal`(fixed 덮개) → `.modal-back`(반투명 배경, `panel.css:299`) → `.modal-box`(`position: relative`로 배경 위, `panel.css:306`). 상자는 세로 flex이고 머리·도구줄·머리띠·발은 고정 높이, `.mod-grid`만 `flex: 1; min-height: 0`(`panel.css:400`)으로 남는 높이를 전부 가져갑니다.
- **모드 그리드**: `repeat(auto-fill, minmax(300px, 1fr))`(`panel.css:404`)로 창 폭에 따라 칸 수가 자동으로 늘고 줄어듭니다(FR-MODAL-04). `align-content: start`(`panel.css:405`)는 항목이 적을 때 세로로 퍼지는 것을 막고, `gap: 1px 10px`은 세로 간격을 거의 붙여 한 화면에 더 담습니다.

### 3.4 스티키 계열 제목

`.mod-group`은 `grid-column: 1 / -1`로 모든 칸에 걸치고, `position: sticky; top: 0; z-index: 1`로 스크롤 중에도 붙어 있습니다(`panel.css:415`~`:419`). 스티키의 기준 스크롤 컨테이너는 `overflow-y: auto`인 `.mod-grid` 자신입니다. `z-index: 1`은 아래로 지나가는 `.mod-item`이 제목 위로 겹쳐 보이지 않게 하는 최소값입니다. 항목이 없을 때 뜨는 안내문도 같은 `grid-column: 1 / -1`을 받아 칸 하나에 갇히지 않습니다(`panel.css:469`).

### 3.5 거래소와 충돌하지 않기 위해 한 것들

| 조치 | 위치 | 막는 것 |
| --- | --- | --- |
| `all: initial`로 상속 끊기 | `panel.css:7` | 거래소의 글꼴·색·`line-height`가 새어 들어옴 |
| 폰트·행간을 `.wrap`에서 명시 | `panel.css:24` | 리셋 후 브라우저 기본값(16px)으로 떨어짐 |
| `box-sizing: border-box` 재선언 | `panel.css:27`~`:31` | 리셋이 `content-box`로 돌려놓아 폭 계산이 어긋남 |
| `scrollbar-width/color` 지정 | `panel.css:92`, `:410`, `:544` | 밝은 기본 스크롤바가 어두운 패널에서 튀어 보임 |

태그 선택자(`panel.css:124`, `:137`, `:159`, `:235`)를 마음 놓고 쓸 수 있는 것도 그림자 경계 덕입니다 — 클래스를 남발할 이유가 없습니다.

---

## 4. EN 복사 설계

### 4.1 줄 탐지

기본 선택자는 `.results .row[data-id]`(`copy-en.js:15`), 대체 선택자는 `.results > [data-id]`(`copy-en.js:18`)이고, 부착 표시는 `dataset.ptbEn = '1'`(→ `data-ptb-en`, `copy-en.js:21`, `:145`), 붙이는 자리는 `row.querySelector('.left') ?? row`입니다(`copy-en.js:162`).

대체 선택자는 **기본이 하나도 안 잡힐 때만** 씁니다(`copy-en.js:169`). 둘을 합집합으로 돌리면 같은 줄이 양쪽에 잡혀 단추가 둘 붙기 때문입니다(`copy-en.js:16`~`:17`의 주석). 이 "폴백은 배타적으로"가 NFR-ROB-02를 값싸게 만족시키는 핵심입니다.

중복 부착 방지: `dataset[MARK]`가 있으면 즉시 반환하고, 없으면 **단추를 만들기 전에** 표시부터 남깁니다(`copy-en.js:145`~`:146`). 순서가 이래야 이후 예외가 나도 표시가 남습니다.

단추의 배치 기준점은 줄입니다. `copy-en.css:17`이 `position: absolute`이므로 줄에 위치 기준이 필요한데, 거래소가 이미 세워 두었으면 그대로 두고 `static`일 때만 `relative`로 올립니다(`copy-en.js:150`). 덮어쓰지 않으므로 거래소 레이아웃은 변하지 않습니다.

⚠ 확인 필요: 거래소가 줄은 유지한 채 내부(`.left`)만 다시 그리면 표시가 남아 단추가 복구되지 않습니다. 실제로 그런 갱신이 있는지는 코드만으로 판단할 수 없습니다.

### 4.2 관찰 전략

`MutationObserver`를 `document.documentElement`에 `{childList: true, subtree: true}`로 겁니다(`copy-en.js:181`). 변화마다 훑지 않고 120ms 디바운스로 모읍니다(`copy-en.js:28`, `:177`~`:180`). 초기 1회는 직접 호출합니다(`copy-en.js:183`).

**결과 컨테이너만 보지 않는 이유**(`copy-en.js:174`~`:175`의 주석): 거래소는 SPA라 `.results` 요소 자체가 통째로 교체될 수 있습니다. 그 요소를 붙잡고 관찰하면 교체된 순간 관찰 대상이 문서에서 떨어져 나가 조용히 죽습니다. 문서 루트는 절대 교체되지 않으므로 관찰이 끊기지 않습니다. 대신 관찰 범위가 넓어 콜백이 자주 불리는데, 그 비용은 디바운스 + 콜백 본문이 `clearTimeout`/`setTimeout` 두 줄뿐이라는 점으로 상쇄합니다(NFR-ROB-03).

`sweep()`은 매번 `onSearchPage()`를 다시 확인합니다(`copy-en.js:166`). 페이지 이동 없이 `/exchange/`로 넘어가도 그 시점부터 단추가 붙지 않습니다(FR-EN-05).

### 4.3 요청 경로

`requestEnglishText(itemId)`(`copy-en.js:39`)는 세 겹입니다.

| 단계 | 조건 | 막는 낭비 | 위치 |
| --- | --- | --- | --- |
| 1. 캐시 | `cache.has(itemId)` | 이미 받은 아이템의 재요청. 아이템 텍스트는 불변이라 무효화가 필요 없다 | `copy-en.js:40` |
| 2. in-flight 합치기 | `inFlight.has(itemId)` | 연타·중복 클릭이 만드는 동시 요청. 같은 Promise를 돌려준다 | `copy-en.js:41`, `:56` |
| 3. 메시지 | `chrome.runtime.sendMessage` | — (여기서만 실제 네트워크로 나간다) | `copy-en.js:46` |

`inFlight` 항목은 `finally`에서 지웁니다(`copy-en.js:59`~`:61`) — 실패해도 남지 않으므로 재시도가 막히지 않습니다. 성공한 경우에만 캐시에 넣습니다(`copy-en.js:52`). 두 맵 모두 페이지 수명과 함께 사라지는 메모리 캐시이며(`copy-en.js:31`~`:32`), 이 캐시가 NFR-API-02(IP 기준 5분당 50회)를 지키는 1차 방어선입니다. `sendMessage` 자체가 던지는 경우는 확장 재로드로 연결이 끊긴 상황이라 별도 문구로 구분합니다(`copy-en.js:47`~`:49`).

### 4.4 서비스 워커

`fetchEnglishItem(itemId)`(`background.js:35`)는 `https://www.pathofexile.com/api/trade/fetch/<id>`를 `credentials: 'omit'`으로 부릅니다(`background.js:38`~`:40`).

- **왜 워커인가**: 요청이 페이지와 다른 출처이고 거래소 API는 CORS 헤더를 주지 않아 콘텐츠 스크립트에서는 보낼 수 없습니다. `host_permissions`(`manifest.json:11`)를 가진 워커가 대신 보냅니다(`background.js:11`~`:12`, FR-EN-04).
- **`credentials: 'omit'`**: 로그인 정보가 필요 없고 요청 한도도 계정이 아닌 IP로 잡히기 때문입니다(`background.js:33`, NFR-SEC-02).
- **검색 ID 미포함**: `query` 파라미터를 붙이지 않습니다. 한국 서버의 검색 ID는 영문 거래소에 없고, 없어도 아이템은 돌아옵니다(`background.js:31`~`:32`).
- **base64 디코드**: `atob()`만 쓰면 각 바이트가 그대로 한 문자가 되어(latin-1 해석) 비ASCII가 깨집니다. 그래서 `atob` → `Uint8Array.from(...charCodeAt)` → `TextDecoder('utf-8')` 세 단계를 거칩니다(`background.js:21`~`:25`, FR-EN-03).

**오류 → 사용자 문구 매핑**(FR-EN-08):

| 상황 | 판정 | 문구 | 위치 |
| --- | --- | --- | --- |
| 네트워크 실패 | `fetch` throw | 영문 거래소에 연결하지 못했습니다. (사유) | `background.js:41`~`:43` |
| 한도 초과 | `status === 429` | 요청 한도 초과. N초 후 다시 시도하세요 (`Retry-After` 그대로) | `background.js:45`~`:49` |
| 기타 HTTP 오류 | `!res.ok` | 영문 정보를 가져오지 못했습니다. (HTTP nnn) | `background.js:50`~`:52` |
| JSON 아님 | `res.json()` throw | 영문 거래소가 알 수 없는 응답을 보냈습니다 | `background.js:56`~`:59` |
| 결과 비어 있음 | `result[0].item` 없음 | 영문 거래소에서 이 아이템을 찾지 못했습니다 (매물 내려감) | `background.js:61`~`:65` |
| 텍스트 없음 | `extended.text` 없음 | 이 아이템은 영문 텍스트가 제공되지 않습니다 | `background.js:67`~`:70` |
| 디코드 실패 | `decodeItemText` throw | 영문 텍스트를 읽지 못했습니다. (사유) | `background.js:72`~`:76` |
| 연결 끊김 | (콘텐츠 스크립트 쪽) | 확장을 새로고침했습니다. 페이지를 새로 열어주세요 | `copy-en.js:48`~`:49` |
| 응답 없음 | `!res` | 영문 정보를 가져오지 못했습니다 | `copy-en.js:51` |
| 클립보드 거부 | `copyText` false | 클립보드에 쓰지 못했습니다. 페이지를 클릭한 뒤 다시 눌러주세요 | `copy-en.js:137` |

워커는 예외를 밖으로 던지지 않고 **전부 `{ok:false, error}` 형태로 정규화**합니다. 호출 측은 `result.ok` 하나만 보면 됩니다(`copy-en.js:130`).

### 4.5 클립보드

`copyText(text)`(`copy-en.js:68`)는 2단입니다. 먼저 `navigator.clipboard.writeText`(`copy-en.js:70`)를 쓰고, 문서가 포커스를 잃었거나 권한이 막혀 거절되면 숨긴 `<textarea>` + `document.execCommand('copy')`로 한 번 더 시도합니다(`copy-en.js:77`~`:89`, FR-EN-09). 화면을 흔들지 않도록 `position:fixed; top:0; left:-9999px; opacity:0`으로 붙입니다(`copy-en.js:80`) — `top:0` 고정이 스크롤 점프를 막습니다.

**포커스 복원**: 폴백은 `area.select()`로 포커스를 뺏으므로, 시작 전 `document.activeElement`를 기억했다가 정리 후 되돌립니다(`copy-en.js:76`, `:92`). 거래소 검색 칸에 커서를 둔 채 눌러도 커서를 잃지 않습니다. `area.remove()`는 성공/실패 어느 쪽이든 먼저 실행됩니다(`copy-en.js:91`). 두 경로 모두 실패하면 `false`를 돌려주고, 호출 측이 안내 문구를 툴팁에 답니다(`copy-en.js:137`). 사이드바 안의 복사 단추들(1편 §6.3, 2편 §5.2)은 이 폴백을 쓰지 않습니다 — 그쪽은 방금 누른 자리라 문서가 포커스를 잃은 상태가 아니기 때문입니다.

### 4.6 단추 상태 기계

| 상태 | 표시 | 전이 계기 | 위치 |
| --- | --- | --- | --- |
| 대기 | `EN`, `disabled=false` | 초기값 / 되돌림 | `copy-en.js:155`, `:108` |
| 요청 중 | `…`, `disabled=true`, 색 클래스 제거 | 클릭 | `copy-en.js:124`~`:126` |
| 성공 | `✓` + `.ptb-ok`, 툴팁 원복 | 복사 성공 | `copy-en.js:134`~`:135` |
| 실패 | `!` + `.ptb-error`, 툴팁에 사유 | 조회 실패 또는 복사 실패 | `copy-en.js:131`~`:132`, `:137`~`:138` |
| 되돌림 | `EN`, 툴팁 원복, 클래스 제거 | 1400ms 경과 | `copy-en.js:26`, `:107`~`:111` |

`disabled`는 `flash()` 호출 여부와 무관하게 마지막에 해제되므로(`copy-en.js:141`), ✓/! 를 보여 주는 동안에도 다시 누를 수 있습니다.

**타이머를 단추마다 따로 잡은 이유**: 되돌리기 타이머를 `WeakMap<button, timerId>`로 관리합니다(`copy-en.js:98`). 모듈 전역 변수 하나로 두면, 다른 줄의 단추를 이어 눌렀을 때 새 `clearTimeout`이 앞 단추의 타이머를 지워 앞 단추가 `✓` 표시에 영구히 갇힙니다(`copy-en.js:96`~`:97`의 주석, FR-EN-07). `WeakMap`이라 줄이 DOM에서 사라지면 항목도 함께 회수됩니다. `handleClick` 시작 시에도 `clearTimeout`을 부릅니다(`copy-en.js:123`) — 앞 표시가 남은 상태에서 다시 누르면 옛 타이머가 새 표시를 지워 버리기 때문입니다.

### 4.7 이벤트 전파 차단과 CSS 노출 규칙

거래소는 줄에 클릭 동작(아이템 펼치기 등)을 걸어 두었습니다. 그래서 **두 이벤트를 모두** 막습니다 — `click`에서 `stopPropagation()`(`copy-en.js:117`), 그리고 `mousedown`에도 별도 리스너(`copy-en.js:159`). 거래소가 `mousedown`을 따로 듣기 때문에 클릭만 막아서는 새어 나갑니다(`copy-en.js:158`의 주석, FR-EN-11). `preventDefault`는 부르지 않습니다 — 단추는 `type="button"`(`copy-en.js:153`)이라 기본 동작이 없습니다.

CSS 쪽은 표시 조건을 네 갈래로 둡니다(`copy-en.css:43`~`:48`): 줄 hover, `:disabled`(요청 중), `.ptb-ok`, `.ptb-error`. 뒤 셋 덕분에 **마우스가 줄을 떠난 뒤에도** 진행 상태와 결과를 볼 수 있습니다. 평소에는 `display: none`(`copy-en.css:14`)이라 거래소 화면을 어지럽히지 않습니다.

### 4.8 `copy-en.css`가 Shadow DOM 밖인 이유

EN 단추는 거래소 DOM 안(`.left` 자식)에 그대로 들어갑니다. 배치 기준점도 hover 조건도 거래소의 줄이므로 그림자 경계로 감쌀 수 없고(`copy-en.css:3`~`:5`), `manifest.json:39`가 이 파일만 페이지에 직접 주입합니다.

경계가 없는 만큼 선택자로 대신 막습니다. 모든 규칙이 `.ptb-en-copy` 클래스로 끝나므로 거래소 요소에는 닿지 않습니다. 기준은 `.row`가 아니라 `.results [data-id]`인데(`copy-en.css:7`~`:9`), **대체 선택자로 붙은 단추에도 그대로 먹이기 위해서**이며 동시에 거래소의 `button` 규칙에 밀리지 않을 특이도를 벌어 줍니다.

부작용: 색 값이 리터럴로 중복됩니다(`copy-en.css:30`·`:31`·`:33`의 `#221f1c`·`#3b342c`·`#af6025`는 `panel.css:10`/`:11`/`:14`와 같은 값). 그림자 밖이라 변수를 공유할 수 없는 구조적 결과이며, 팔레트를 바꿀 때 두 파일을 함께 고쳐야 합니다.

---

## 5. DOM 계약과 취약점

거래소 마크업에 기대는 지점은 `copy-en.js` 상단에 모아 두는 것이 규칙입니다(NFR-ROB-01). 이 편이 의존하는 전부는 다음과 같습니다.

| 의존 대상 | 쓰는 곳 | 깨졌을 때의 증상 | 고칠 위치 |
| --- | --- | --- | --- |
| `.results` 컨테이너 | `copy-en.js:15`, `:18` / `copy-en.css:12` | 단추가 아예 안 붙는다. 폴백도 같은 접두사라 함께 죽는다 | `copy-en.js:15`, `:18`과 `copy-en.css`의 모든 셀렉터 |
| 줄의 `.row` 클래스 | `copy-en.js:15` | 기본 선택자가 0건 → 폴백으로 자동 전환, 단추는 계속 붙는다 | 조치 불필요 (설계된 폴백) |
| 줄의 `data-id` 속성 | `copy-en.js:15`, `:18`, `:120` | 단추가 안 붙거나, 붙어도 클릭이 조용히 무시된다 | `copy-en.js:15`, `:18`, `:120` |
| `data-id` 값 = 영문 거래소의 아이템 ID | `background.js:38` | 조회가 "찾지 못했습니다"로 실패한다 | `background.js:35` 전체 (근거 재검토) |
| 줄 안의 `.left` 칸 | `copy-en.js:162` | 단추가 줄 자체에 붙는다. 위치가 어긋날 수 있으나 동작은 유지 | `copy-en.js:162`, `copy-en.css:18`~`:19` |
| 줄의 좌표계(`position`) | `copy-en.js:150` / `copy-en.css:17` | 단추가 엉뚱한 곳에 뜬다 | `copy-en.js:150`, `copy-en.css:18`~`:19` |
| 줄의 `click`/`mousedown` 동작 | `copy-en.js:117`, `:159` | 단추를 누르면 아이템 상세가 함께 펼쳐진다 | `copy-en.js:117`, `:159` |
| `/trade/` URL 모양 | `copy-en.js:36` → `trade-url.js:31` | 단추가 붙는 페이지가 어긋난다 | `trade-url.js:31`, `manifest.json:14` |
| `<html>`에 margin을 얹을 수 있음 | `panel.js:223` | 패널이 거래소 화면을 덮는다 | `panel.js:221` |
| 응답의 `result[0].item.extended.text` | `background.js:61`, `:67` | "찾지 못했습니다" / "영문 텍스트가 제공되지 않습니다" | `background.js:61`, `:67` |
| 확장 리소스 접근(`panel.css`) | `panel.js:179` | 패널이 스타일 없이 뜬다(기능은 유지) | `manifest.json:45` |

검색 폼 쪽 DOM 의존은 성격이 달라 1편 §7에 따로 모아 두었습니다.

---

## 확인이 필요한 자리

- **눈대중 좌표.** 단추 위치 `left: 86px; bottom: 8px`(`copy-en.css:18`~`:19`)는 거래소 아이템 그림 크기에 맞춘 값입니다. 그림 크기가 바뀌면 §5 표에 없는 조용한 어긋남이 납니다.
- **`z-index` 최대값 의존.** 거래소가 같은 값을 쓰면 DOM 순서로 갈립니다. 호스트가 `documentElement`의 마지막 자식이므로 현재는 우리가 이깁니다(`panel.js:170`).
- **거래소 DOM에 남기는 흔적.** NFR-ROB-05는 "스타일·레이아웃"을 바꾸지 않는다는 약속이고, 실제로 레이아웃 흔적은 `margin-right`와 `position: relative` 승격뿐입니다. 다만 속성 수준에서는 줄마다 `data-ptb-en`(`copy-en.js:146`)과 단추 요소가 남습니다.
- **거래소 결과 줄의 실제 DOM.** §4.1의 선택자와 `.left` 구조는 관찰에 기댄 것이고, 줄 내부만 다시 그리는 갱신이 있는지(§4.1의 ⚠)는 코드만으로 확인할 수 없습니다.
- **북마크 개수 상한 없음.** §2.8의 표에 적은 대로 코드상 제한이 없습니다. 실사용 규모에서 문제가 되는지 확인이 필요합니다(→ `../DESIGN.md` §9).
