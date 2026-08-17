# 영문판 데이터

영문 클라이언트/거래소를 지원하려고 모은 데이터입니다. `tools/build-en-data.js`가
만들고, 다시 실행하면 그대로 다시 나옵니다.

확장은 아직 이 파일들을 읽지 않습니다 — 영문 지원을 붙일 때 쓸 재료입니다.

| 파일 | 내용 |
| --- | --- |
| `map-mods.json` | `map-mods.js`의 80개 모드를 영문 문구·접두어/접미어 이름으로 옮긴 것 |
| `../../test/fixtures/en/map-mod-pool.json` | 상위 등급 지도에 붙을 수 있는 모드 전체(86개)의 영문판 |
| `../../test/fixtures/en/trade-stats.json` | stat id → 영문 문구 대조표(99개) |
| `../../test/fixtures/en/map-item-names.json` | 지도 칸에 들어가는 아이템의 영문 이름(583개) |

## 어디서 왔는가

사전을 지어내면 안 됩니다. GGG가 쓰는 문구와 한 글자라도 다르면 인게임 검색이
조용히 빗나갑니다. 그래서 두 언어를 함께 내놓는 출처만 썼습니다.

| 출처 | 받는 것 |
| --- | --- |
| [poedb `Maps_top_tier`](https://poedb.tw/us/Maps_top_tier) (kr/us) | 지도 모드 풀 — 접두어/접미어 이름, 태그, 모드 문구 |
| [awakened-poe-trade](https://github.com/SnosMe/awakened-poe-trade) `stats.ndjson` (ko/en) | 거래소 stat id ↔ 언어별 아이템 문구 |
| [RePoE](https://github.com/lvlvllvlvllvlvl/RePoE) `base_items.json` | 지도 칸 아이템의 영문 이름 |

poedb의 두 판은 같은 표를 언어만 바꿔 그린 것이라 항목 순서가 같습니다. 그래서
`kr[i]`와 `us[i]`가 같은 모드입니다. 스크립트는 그 가정을 매번 확인합니다 —
한글판을 뽑아 `test/fixtures/map-mod-pool.json`(거래소에서 직접 받아 만든 것)과
견주어 86개가 전부 같은지, 두 판의 모드 계열(`ModFamilyList`)이 자리마다 같은지
봅니다. 한 글자라도 어긋나면 영문판도 믿을 수 없다는 뜻입니다.

## 얼마나 확인되었는가

80개 모드의 영문 문구를 poedb에서 옮긴 뒤, 같은 문구가 그 stat id의 실제 변형인지
APT 데이터로 다시 확인했습니다. **78개는 두 출처가 일치**합니다. 나머지 둘은 APT에
대응하는 데이터가 없어서 poedb만 근거입니다.

| 모드 | 확인 못 한 줄 | 왜 |
| --- | --- | --- |
| `of Miring` (`- 수렁`) | `Players have -20% to amount of Suppressed Spell Damage Prevented` | 이 줄은 거래소에 대응하는 스탯이 아예 없습니다(한글판도 같음, `test/fixtures/README.md` 참고) |
| `Subterranean` (`지하의`) | `Area is inhabited by the Vaal` | `explicit.stat_2609768284`이 APT 데이터에 없습니다 |

matchers의 **자리(index)로 짝짓지 않습니다.** 언어마다 순서가 달라서입니다 —
`of Transience`는 ko가 `[느리게, 빠르게]`, en이 `[faster, slower]` 순이라 자리로
맞추면 뜻이 뒤집힙니다. 그래서 '그 id의 변형들 중 모양이 같은 것이 있는가'만 봅니다.

## 아직 없는 것

**영문 거래소 API 원본.** 한글 데이터(`data/*.json`)는 거래소 API에서 직접 받은
것입니다. 영문도 그게 제일 좋지만 `https://www.pathofexile.com/api/trade/data/*`는
데이터센터 IP를 막습니다(HTTP 403, `{"error":{"code":6}}`). 직접 쓰는 컴퓨터에서는
받아집니다:

```sh
curl -s https://www.pathofexile.com/api/trade/data/stats   -o data/en/search-mods.json
curl -s https://www.pathofexile.com/api/trade/data/items   -o data/en/search-items.json
curl -s https://www.pathofexile.com/api/trade/data/filters -o data/en/search-filters.json
```

받아 두면 두 가지가 좋아집니다.

- `trade-stats.json`의 값이 지금은 **아이템 문구**입니다(APT의 `ref`). 한글 쪽
  대조표는 **거래소 문구**라 자리가 조금씩 다릅니다(`test/fixtures/README.md`의
  표 참고). 원본을 받으면 한글과 같은 기준으로 맞출 수 있습니다.
- `map-item-names.json`이 지금은 RePoE의 아이템 분류(`Map`, `MapFragment`,
  `AtlasUpgradeItem`, `VaultKey`)에 한국 거래소 '지도' 분류를 영문으로 옮겨 보탠
  것입니다. 거래소가 실제로 '지도' 칸에 넣는 목록 그대로는 아닙니다.

검색 폼의 옵션 id(`nonunique`, `rare`, `securable` …)는 언어와 무관합니다. 한글
`data/search-filters.json`에서 확인했고, 그래서 `trade-query.js`는 영문판에서도
고칠 곳이 없습니다.

**인게임 정규식 키워드.** `map-mods.js`의 `regex`는 '이 모드에만 걸리는 최단
부분문자열'이라 언어마다 새로 골라야 합니다. 영문은 아직 고르지 않았습니다. 고를
때 대조할 재료(영문 모드 풀, 영문 아이템 이름)는 여기 다 있습니다.

**패널 문구.** 단추·안내문은 아직 한글입니다. `groups`의 영문 이름(`Misc`,
`Monster buffs` …)은 GGG 문구가 아니라 이 확장이 모드를 묶어 부르는 이름입니다.

## 갱신

리그가 바뀌면 `tools/.cache/`를 지우고 `node tools/build-en-data.js`를 다시
실행합니다. 한글 픽스처(`test/fixtures/map-mod-pool.json`)를 먼저 갱신해야 대조가
의미 있습니다.
