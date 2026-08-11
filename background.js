// 툴바 아이콘을 누르면 팝업 대신 사이드 패널이 열리도록 한다.
// (action.default_popup을 두지 않아야 이 동작이 적용된다.)
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('사이드 패널 설정 실패:', error));
