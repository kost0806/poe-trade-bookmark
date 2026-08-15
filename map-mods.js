/**
 * T16(top tier) 지도 모드 목록 — 한글 전용.
 *
 * 생성 근거:
 *  - 모드 풀/한글 표기: https://poedb.tw/kr/Maps_top_tier
 *  - 거래소 stat id: https://poe.kakaogames.com/api/trade/data/stats (explicit 그룹)
 *  - 정규식 키워드 규칙: https://poeregexkr.web.app/ (! 부정, | 연결, 공백은 .)
 *
 * regex 값은 '이 모드에만 매칭되는 부분문자열'이다. 공백은 .으로 쓰고, 굴림마다
 * 바뀌는 숫자는 넣지 않는다.
 *
 * 한글 3글자 이상으로 쓴다. 희귀 지도에는 무작위로 만든 이름('운명의 도전' 같은)이
 * 붙는데 그 낱말 목록을 구할 수 없어 검사로 막지 못하고, 2글자는 그런 이름에 걸릴
 * 확률이 무시할 수준이 아니다. 맵모드를 열 개 넘게 거는 일이 드물어서 길이는
 * 문제가 안 된다 — 12개를 골라도 58자로, 인게임 한도 250자의 4분의 1이다.
 *
 * 유일성은 여기 적힌 text만 놓고 맞춰 보면 안 된다. 인게임 검색은 아이템 전문을
 * 훑기 때문에, 목록 밖의 모드나 이름·속성 줄에 걸려도 엉뚱한 지도가 사라진다.
 * test/trade-query.test.js가 다섯 방향으로 대조한다 — 목록끼리, T16 풀 전체,
 * 지도 이름, 고급 모드 설명 줄(접두어 이름·태그), 실제 지도 한 장의 전문.
 *
 * ids가 여러 개인 항목은 값만 다른 같은 계열(인게임 문구로는 구분 불가)이다.
 * 타락으로 붙는 모드는 explicit이 아니라 implicit이므로 id 앞자리를 주의한다.
 */
const MAP_MODS = [
  { ids: ["implicit.stat_804187877"], regex: "몬스터가.타", group: "기타", affix: "MapCorruptionBossCorruption", text: "고유 몬스터가 타락한 아이템을 떨어뜨림" },
  { ids: ["explicit.stat_4103440490"], regex: "쇠약화", group: "기타", affix: "- 쇠약", text: "플레이어가 쇠약화 저주에 걸림" },
  { ids: ["explicit.stat_2326202293"], regex: "시간의", group: "기타", affix: "- 시간의 사슬", text: "플레이어가 시간의 사슬 저주에 걸림" },
  { ids: ["explicit.stat_558910024"], regex: "원소.약", group: "기타", affix: "- 원소 약화", text: "플레이어가 원소 약화 저주에 걸림" },
  { ids: ["explicit.stat_1366534040"], regex: "취약성", group: "기타", affix: "- 취약성", text: "플레이어가 취약성 저주에 걸림" },
  { ids: ["explicit.stat_1217583941"], regex: "는.버프가", group: "기타", affix: "- 덧없음", text: "플레이어에게 적용되는 버프가 70% 더 빠르게 만료됨" },
  { ids: ["explicit.stat_272758639", "explicit.stat_3729221884"], regex: "방어도", group: "기타", affix: "- 녹", text: "플레이어의 방어도 30% 감폭\n플레이어의 막기 확률 40% 감소" },
  { ids: ["explicit.stat_2312028586"], regex: "어의.효", group: "기타", affix: "- 무기력", text: "플레이어의 효과 범위 25% 감폭" },
  { ids: ["explicit.stat_816367946"], regex: "모든.몬", group: "몬스터 강화", affix: "불태우는", text: "모든 몬스터의 적중 피해가 항상 점화 유발" },
  { ids: ["explicit.stat_1106651798", "explicit.stat_798009319", "explicit.stat_798009319"], regex: "밑으로", group: "몬스터 강화", affix: "폭주", text: "몬스터 도발 면역\n몬스터의 동작 속도가 기본 수치 밑으로 내려가지 않음\n몬스터의 이동 속도가 기본 수치 밑으로 내려가지 않음" },
  { ids: ["explicit.stat_1890519597"], regex: "터.피해", group: "몬스터 강화", affix: "야만적인", text: "몬스터 피해 (22—25)% 증가" },
  { ids: ["explicit.stat_3448216135"], regex: "냉기.속", group: "몬스터 강화", affix: "동결의", text: "몬스터가 (90—110)%의 추가 물리 피해를 냉기 속성으로 가함" },
  { ids: ["explicit.stat_3416853625"], regex: "번개.속", group: "몬스터 강화", affix: "감전의", text: "몬스터가 (90—110)%의 추가 물리 피해를 번개 속성으로 가함" },
  { ids: ["explicit.stat_1497673356"], regex: "화염.속", group: "몬스터 강화", affix: "불타는", text: "몬스터가 (90—110)%의 추가 물리 피해를 화염 속성으로 가함" },
  { ids: ["explicit.stat_144665660"], regex: "꿰뚫기", group: "몬스터 강화", affix: "뚫리지 않는", text: "몬스터가 50%의 확률로 중독, 꿰뚫기, 출혈 회피" },
  { ids: ["explicit.stat_322206271"], regex: "긴급회", group: "몬스터 강화", affix: "- 절연", text: "몬스터가 70%의 확률로 원소 상태 이상 긴급회피" },
  { ids: ["explicit.stat_4164174520"], regex: "시.힘줄", group: "몬스터 강화", affix: "- 살육", text: "몬스터가 공격 명중 시 힘줄 절단 유발" },
  { ids: ["explicit.stat_2553656203"], regex: "감전.유", group: "몬스터 강화", affix: "강화된", text: "몬스터가 명중 시 20%의 확률로 점화, 동결, 감전 유발" },
  { ids: ["explicit.stat_1629869774"], regex: "시.실명", group: "몬스터 강화", affix: "- 실명", text: "몬스터가 명중 시 실명 유발" },
  { ids: ["explicit.stat_1840747977", "explicit.stat_3044826007"], regex: "피해로", group: "몬스터 강화", affix: "모독적인", text: "몬스터가 물리 피해의 (31—35)%를 추가 카오스 피해로 획득\n몬스터가 명중 시 2초 동안 위축 유발" },
  { ids: ["explicit.stat_4154059009"], regex: "방지.보", group: "몬스터 강화", affix: "사술 방지", text: "몬스터가 사술 방지 보유" },
  { ids: ["explicit.stat_2887760183"], regex: "명력의", group: "몬스터 강화", affix: "강해진", text: "몬스터가 최대 생명력의 (40—49)%를 추가 에너지 보호막 최대치로 획득" },
  { ids: ["explicit.stat_337935900"], regex: "명타로", group: "몬스터 강화", affix: "- 강인함", text: "몬스터가 치명타로 받는 추가 피해 (36—40)% 감소" },
  { ids: ["explicit.stat_1309819744"], regex: "투사체", group: "몬스터 강화", affix: "분할의", text: "몬스터가 투사체 2개 추가 발사" },
  { ids: ["explicit.stat_3350803563"], regex: "시.중독", group: "몬스터 강화", affix: "- 독액", text: "몬스터의 공격 명중 시 중독" },
  { ids: ["explicit.stat_1541224187"], regex: "공격이", group: "몬스터 강화", affix: "꿰뚫는", text: "몬스터의 공격이 명중 시 60%의 확률로 꿰뚫음" },
  { ids: ["explicit.stat_839186746"], regex: "피해.감", group: "몬스터 강화", affix: "장갑을 두른", text: "몬스터의 물리 피해 감소 +40%" },
  { ids: ["explicit.stat_95249895", "explicit.stat_1041951480"], regex: "터의.생", group: "몬스터 강화", affix: "변함없는", text: "몬스터의 생명력 (25—30)% 증폭\n몬스터 기절 면역\n몬스터의 생명력 (40—49)% 증폭" },
  { ids: ["explicit.stat_3183973644"], regex: "추가.연", group: "몬스터 강화", affix: "연쇄의", text: "몬스터의 스킬 2회 추가 연쇄" },
  { ids: ["explicit.stat_2306522833", "explicit.stat_1913583994", "explicit.stat_2488361432"], regex: "공격.속", group: "몬스터 강화", affix: "쾌속의", text: "몬스터의 이동 속도 (25—30)% 증가\n몬스터의 공격 속도 (35—45)% 증가\n몬스터의 시전 속도 (35—45)% 증가" },
  { ids: ["explicit.stat_1588049749"], regex: "터의.정", group: "몬스터 강화", affix: "- 수렁", text: "몬스터의 정확도 50% 증가\n플레이어가 방지하는 억제된 주문 피해 -20%" },
  { ids: ["explicit.stat_962720646"], regex: "시.이동", group: "몬스터 강화", affix: "- 저해", text: "몬스터의 주문 명중 시 이동 방해 유발" },
  { ids: ["explicit.stat_2138205941"], regex: "피해.억", group: "몬스터 강화", affix: "억제하는", rec: true, text: "몬스터의 주문 피해 억제 확률 +60%" },
  { ids: ["explicit.stat_2753083623", "explicit.stat_57326096"], regex: "피해.배", group: "몬스터 강화", affix: "- 치명성", text: "몬스터의 치명타 확률 (360—400)% 증가\n몬스터의 치명타 피해 배율 +(41—45)%" },
  { ids: ["explicit.stat_365540634", "explicit.stat_1054098949"], regex: "터의.카", group: "몬스터 강화", affix: "저항하는", text: "몬스터의 카오스 저항 +25%\n몬스터의 원소 저항 +40%" },
  { ids: ["explicit.stat_1708461270"], regex: "터의.효", group: "몬스터 강화", affix: "- 거인", text: "몬스터의 효과 범위 100% 증가" },
  { ids: ["explicit.stat_3796523155"], regex: "걸리는", group: "방어 약화", affix: "사술 수호의", text: "몬스터에게 걸리는 저주 효과 60% 감폭" },
  { ids: ["explicit.stat_1026390635"], regex: "노출.유", group: "방어 약화", affix: "- 균형", text: "플레이어가 노출 유발 불가" },
  { ids: ["explicit.stat_2450628570"], regex: "스킬로", group: "방어 약화", affix: "- 의심", text: "플레이어가 비-저주 오라 스킬로 받는 효과 60% 감소" },
  { ids: ["explicit.stat_3376488707"], regex: "모든.저", group: "방어 약화", affix: "- 노출", rec: true, text: "플레이어의 모든 저항 최대치 (-12—-9)%" },
  { ids: ["explicit.stat_3667574329"], regex: "어의.정", group: "방어 약화", affix: "- 비정밀함", rec: true, text: "플레이어의 정확도 25% 감폭" },
  { ids: ["explicit.stat_2588474575"], regex: "사로잡", group: "보스 강화", affix: "예속된", text: "고유 보스가 사로잡힘" },
  { ids: ["explicit.stat_124877078", "explicit.stat_2109106920"], regex: "공격.및", group: "보스 강화", affix: "대군주의", text: "고유 보스가 주는 피해 25% 증가\n고유 보스의 공격 및 시전 속도 30% 증가" },
  { ids: ["explicit.stat_1959158336", "explicit.stat_3040667106"], regex: "보스의.생", group: "보스 강화", affix: "거신의", text: "고유 보스의 생명력 35% 증가\n고유 보스의 효과 범위 70% 증가" },
  { ids: ["explicit.stat_799271621"], regex: "에.고유", group: "보스 강화", affix: "이중", text: "지역에 고유 보스 2마리 등장" },
  { ids: ["explicit.stat_1821565133"], regex: "마법.몬", group: "지역 구성", affix: "- 혈맹", text: "마법 몬스터 (20—30)% 증가" },
  { ids: ["explicit.stat_3246076198"], regex: "증가한", group: "지역 구성", affix: "- 번개", text: "지역에 50%만큼 피해가 증가한 감전 지대 존재" },
  { ids: ["explicit.stat_1000591322"], regex: "다수의", group: "지역 구성", affix: "의식의", text: "지역에 다수의 토템 존재" },
  { ids: ["explicit.stat_4198346809"], regex: "동물.서", group: "지역 구성", affix: "야생의", text: "지역에 동물 서식" },
  { ids: ["explicit.stat_3561450806"], regex: "등장하", group: "지역 구성", affix: "다양한", text: "지역에 등장하는 몬스터 종류 증가" },
  { ids: ["explicit.stat_3134632618"], regex: "루나리", group: "지역 구성", affix: "달의", text: "지역에 루나리스 광신도 거주" },
  { ids: ["explicit.stat_25085466"], regex: "마녀.및", group: "지역 구성", affix: "기어가는", text: "지역에 바다 마녀 및 유충 서식" },
  { ids: ["explicit.stat_2609768284", "explicit.stat_728267040"], regex: "발견하", group: "지역 구성", affix: "지하의", text: "지역에 바알 서식\n지역에서 발견하는 아이템이 10% 확률로 타락" },
  { ids: ["implicit.stat_1612402470"], regex: "정교한", group: "지역 구성", affix: "MapCorruptionVaalVessel", text: "지역에 방어되는 정교한 바알 그릇 1개 추가 등장" },
  { ids: ["explicit.stat_2457517302"], regex: "솔라리", group: "지역 구성", affix: "태양의", text: "지역에 솔라리스 광신도 거주" },
  { ids: ["explicit.stat_1948962470"], regex: "신성화", group: "지역 구성", affix: "- 신성화", text: "지역에 신성화 지대 존재" },
  { ids: ["explicit.stat_3916182167"], regex: "악마.서", group: "지역 구성", affix: "악마의", text: "지역에 악마 서식" },
  { ids: ["explicit.stat_808491979"], regex: "언데드", group: "지역 구성", affix: "언데드", text: "지역에 언데드 서식" },
  { ids: ["explicit.stat_349586058"], regex: "얼음.지", group: "지역 구성", affix: "- 얼음", text: "지역에 얼음 지대 존재" },
  { ids: ["explicit.stat_1813544255"], regex: "염소인", group: "지역 구성", affix: "변덕스러운", text: "지역에 염소인간 서식" },
  { ids: ["explicit.stat_133340941"], regex: "용암.지", group: "지역 구성", affix: "- 화염", text: "지역에 용암 지대 존재" },
  { ids: ["explicit.stat_645841425"], regex: "원거리", group: "지역 구성", affix: "발산하는", text: "지역에 원거리형 몬스터 서식" },
  { ids: ["explicit.stat_2651141461"], regex: "인간형", group: "지역 구성", affix: "이족보행의", text: "지역에 인간형 적 서식" },
  { ids: ["explicit.stat_4252630904"], regex: "키타바", group: "지역 구성", affix: "연회의", text: "지역에 키타바 광신자 거주" },
  { ids: ["explicit.stat_45546355"], regex: "해골.서", group: "지역 구성", affix: "해골의", text: "지역에 해골 서식" },
  { ids: ["explicit.stat_3516340048"], regex: "혼.서식", group: "지역 구성", affix: "출몰하는", text: "지역에 혼 서식" },
  { ids: ["explicit.stat_3577222856"], regex: "훼손된", group: "지역 구성", affix: "- 모독", text: "지역에 훼손된 지대 존재" },
  { ids: ["explicit.stat_2961018200"], regex: "흉물.서", group: "지역 구성", affix: "혐오스러운", text: "지역에 흉물 서식" },
  { ids: ["explicit.stat_3126771445"], regex: "스터.수", group: "지역 구성", affix: "적대자의", text: "희귀 몬스터 수 (20—30)% 증가" },
  { ids: ["explicit.stat_3278889477"], regex: "물리.가", group: "피해 반사", affix: "응징하는", rec: true, text: "희귀 몬스터가 물리 가시를 보유하고 800의 물리 피해 반사" },
  { ids: ["explicit.stat_3938822425"], regex: "원소.가", group: "피해 반사", affix: "반사된", rec: true, text: "희귀 몬스터가 원소 가시를 보유하고 1500의 원소 피해 반사" },
  { ids: ["explicit.stat_1742567045"], regex: "시.격분", group: "회복 방해", affix: "- 격분", text: "몬스터가 명중 시 격분 충전 획득" },
  { ids: ["explicit.stat_406353061"], regex: "권능.충", group: "회복 방해", affix: "- 권능", text: "몬스터가 명중 시 권능 충전 획득" },
  { ids: ["explicit.stat_3222482040"], regex: "충전.강", group: "회복 방해", affix: "- 피폐", text: "몬스터가 명중 시 권능, 격분, 인내 충전 강탈" },
  { ids: ["explicit.stat_687813731"], regex: "중.시.인", group: "회복 방해", affix: "- 인내", text: "몬스터가 명중 시 인내 충전 획득" },
  { ids: ["explicit.stat_1140978125"], regex: "대상이", group: "회복 방해", affix: "- 응고", rec: true, text: "몬스터는 흡수 대상이 되지 않음" },
  { ids: ["explicit.stat_1910157106"], regex: "마나.또", group: "회복 방해", affix: "- 정체", rec: true, text: "플레이어가 생명력, 마나 또는 에너지 보호막 재생 불가" },
  { ids: ["explicit.stat_4181072906"], regex: "및.에너", group: "회복 방해", affix: "- 질식", rec: true, text: "플레이어의 생명력 및 에너지 보호막 회복 속도 60% 감폭" },
  { ids: ["explicit.stat_941368244"], regex: "재사용", group: "회복 방해", affix: "- 피로", rec: true, text: "플레이어의 재사용 대기시간 회복 속도 40% 감폭" },
  { ids: ["explicit.stat_2549889921"], regex: "충전량", group: "회복 방해", affix: "- 가뭄", rec: true, text: "플레이어의 플라스크 충전량 50% 감소" },
];

const MOD_GROUPS = ["기타","몬스터 강화","방어 약화","보스 강화","지역 구성","피해 반사","회복 방해"];

// 브라우저에서는 <script>로 로드되고, 테스트에서는 require로 쓴다.
if (typeof module !== 'undefined') {
  module.exports = { MAP_MODS, MOD_GROUPS };
}
