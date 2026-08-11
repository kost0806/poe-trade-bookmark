# PoE Trade Bookmark

Path of Exile 1 거래소(Trade)의 검색 결과 URL을 북마크로 저장하는 크롬 확장입니다.

## 설치 (개발자 모드)

1. 크롬에서 `chrome://extensions` 접속
2. 우측 상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드** → 이 폴더(`poe-trade-bookmark`) 선택

## 사용법

툴바의 확장 아이콘을 클릭하면 브라우저 오른쪽에 **사이드바(사이드 패널)** 가 열려
그대로 고정됩니다. 탭을 옮기거나 검색을 다시 실행해도 닫히지 않고, 현재 보고 있는
검색에 맞춰 내용이 자동으로 갱신됩니다.

1. 거래소에서 검색을 실행합니다. 주소가
   `.../trade/search/<리그>/<검색ID>` 형태가 되어야 저장할 수 있습니다.
   (검색 전에는 검색 ID가 없어 저장 버튼이 나오지 않습니다.)
2. 사이드바에서 이름을 입력하고 **북마크 추가**를 누릅니다.
3. 이미 저장한 검색을 다시 열면 저장해 둔 이름이 채워지고 버튼이 **이름 변경**으로
   바뀝니다. 이름을 고친 뒤 누르면 새 항목을 만들지 않고 이름만 바꿉니다.
4. 목록의 항목을 클릭하면 해당 검색이 열립니다. 거래소를 보고 있던 중이라면 그 탭에서
   이동하고, 다른 페이지였다면 새 탭에서 엽니다.

사이드바를 계속 띄워 두려면 크롬 사이드 패널의 **고정(핀)** 옵션을 사용하세요.
Chrome 114 이상이 필요합니다.

## 지원 사이트

- `poe.kakaogames.com` (한국 서버)
- `poe.game.daum.net` (한국 서버 구 도메인)
- `www.pathofexile.com` 및 각 언어권 서브도메인(`kr.`, `jp.`, `ru.` 등)
- 일반 검색(`/trade/search/`)과 대량 거래(`/trade/exchange/`) 모두

PoE2(`/trade2/`)는 대상이 아닙니다.

## 권한

`manifest.json`의 `host_permissions`로 위 사이트의 `/trade/*` 경로에만 접근합니다.
확장은 이 권한으로 현재 탭의 주소를 읽어 검색 ID를 추출합니다. 그 외 사이트의
주소는 읽지 않으며, 페이지에 스크립트를 주입하지도 않습니다.

사이트를 추가하려면 `manifest.json`의 `host_permissions`와 `trade-url.js`의
`TRADE_HOSTS` 두 곳을 함께 수정해야 합니다.

## 저장 방식

`chrome.storage.local`에 아래 형태로 저장됩니다. 확장을 삭제하면 함께 지워집니다.

```json
{
  "id": "uuid",
  "title": "표시 이름",
  "url": "https://www.pathofexile.com/trade/search/<리그>/<검색ID>",
  "league": "리그명",
  "mode": "search | exchange",
  "searchId": "검색ID",
  "createdAt": 1700000000000,
  "updatedAt": 1700000000000
}
```

## 파일 구성

| 파일 | 역할 |
| --- | --- |
| `manifest.json` | 확장 설정 (Manifest V3) |
| `background.js` | 아이콘 클릭 시 사이드 패널이 열리도록 설정 |
| `trade-url.js` | 거래소 URL 파싱/검증 |
| `sidepanel.html` / `sidepanel.css` / `sidepanel.js` | 사이드바 UI 및 저장·목록 로직 |
| `icons/` | 툴바 아이콘 |
