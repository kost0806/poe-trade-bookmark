# PoE Trade Bookmark

Path of Exile 1 거래소(Trade)의 검색 결과 URL을 북마크로 저장하는 크롬 확장입니다.

## 설치 (개발자 모드)

1. 크롬에서 `chrome://extensions` 접속
2. 우측 상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드** → 이 폴더(`poe-trade-bookmark`) 선택

## 사용법

1. 거래소에서 검색을 실행합니다. 주소가
   `.../trade/search/<리그>/<검색ID>` 형태가 되어야 저장할 수 있습니다.
   (검색 전에는 검색 ID가 없어 저장 버튼이 나오지 않습니다.)
2. 툴바의 확장 아이콘을 클릭합니다.
3. 이름을 입력하고 **북마크 추가**를 누릅니다.
4. 목록의 항목을 클릭하면 새 탭에서 해당 검색이 열립니다.

## 지원 사이트

- `www.pathofexile.com` 및 각 언어권 서브도메인(`kr.`, `jp.`, `ru.` 등)
- `poe.game.daum.net` (한국 서버)
- 일반 검색(`/trade/search/`)과 대량 거래(`/trade/exchange/`) 모두

PoE2(`/trade2/`)는 대상이 아닙니다.

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
  "createdAt": 1700000000000
}
```

## 파일 구성

| 파일 | 역할 |
| --- | --- |
| `manifest.json` | 확장 설정 (Manifest V3) |
| `trade-url.js` | 거래소 URL 파싱/검증 |
| `popup.html` / `popup.css` / `popup.js` | 팝업 UI 및 저장·목록 로직 |
| `icons/` | 툴바 아이콘 |
