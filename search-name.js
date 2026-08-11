/**
 * 거래소 검색 폼(DOM)에서 북마크 이름을 짓는다.
 *
 * 검색 조건은 주소에 남지 않고 폼에만 있다. 패널은 거래소 페이지 안에서 도는
 * 콘텐츠 스크립트라, 요청을 보낼 필요 없이 폼을 그대로 읽으면 된다.
 *
 * 거래소 폼은 vue-multiselect를 쓰고, 값이 있는 곳이 자리마다 다르다.
 *   - 검색창(아이템): `.search-left .search-select` 안의 태그/선택 라벨/입력값
 *   - 드롭다운 필터(아이템 유형, 희귀도, 판매 형식 …): 고른 라벨이 안쪽 input의
 *     placeholder로 들어가고, 컨테이너에 `modified`가 붙는다
 *   - 최소/최대 칸: `input.form-control.minmax`, 값이 있으면 `modified`가 붙는다
 *   - 능력치 그룹(`.search-advanced-pane.brown`): 사용자가 쌓은 스탯 행들.
 *     그룹 제목이 곧 조건(전체 / 제외 / 개수 …)이다
 *
 * 상단의 리그·상태 드롭다운은 `.status-select`라서 필터 선택자에 걸리지 않는다.
 * 아무것도 못 찾으면 ''을 돌려주고, 부르는 쪽이 검색 ID로 만든 이름을 쓴다.
 */

// 거래소가 마크업을 바꾸면 손볼 곳은 여기뿐이다.
const SEARCH_PANE = '.search-panel';
const SEARCH_BOX = '.search-left .search-select';
const STAT_PANE = '.search-advanced-pane.brown';
const PICKED_FILTER = '.multiselect.filter-select.modified';

const NAME_MAX = 80; // 이름 칸(input maxlength)과 같은 한도
const SEP = ' · ';

const clean = (value) => (value ?? '').replace(/\s+/g, ' ').trim();

/**
 * 필터 행 제목. `유사`, `비고정` 같은 스탯 종류 딱지는 이름에서 군더더기라 뺀다.
 * (예: `유사 # 속성 부여` → `# 속성 부여`)
 */
function rowTitle(row) {
  const title = row?.querySelector('.filter-title');
  if (!title) return '';

  let text = '';
  for (const node of title.childNodes) {
    if (node.nodeType === 1 && node.classList.contains('mutate-type')) continue;
    text += node.textContent ?? '';
  }
  return clean(text);
}

/** 최소/최대 칸에 든 값. 한쪽만 넣는 일이 많아 모양을 나눠 쓴다. */
function rowRange(row) {
  const inputs = row.querySelectorAll('input.minmax');
  const min = clean(inputs[0]?.value);
  const max = clean(inputs[1]?.value);

  if (min && max) return min === max ? min : `${min}-${max}`;
  if (min) return `${min}+`;
  if (max) return `~${max}`;
  return '';
}

function rowLabel(row) {
  const title = rowTitle(row);
  if (!title) return '';
  const range = rowRange(row);
  return range ? `${title} ${range}` : title;
}

/** 검색창에 고르거나 입력한 아이템. */
function searchBoxItem(pane) {
  const box = pane.querySelector(SEARCH_BOX) ?? pane.querySelector('.search-select');
  if (!box) return '';

  // 고른 아이템은 태그로 남는다(여럿일 수 있다).
  const tags = [...box.querySelectorAll('.multiselect__tag')].map((el) => clean(el.textContent));
  const tagged = tags.filter(Boolean);
  if (tagged.length) return tagged.join(', ');

  const single = clean(box.querySelector('.multiselect__single')?.textContent);
  if (single) return single;

  const input = box.querySelector('.multiselect__input');
  // 타이핑만 하고 아직 고르지 않은 글자.
  const typed = clean(input?.value);
  if (typed) return typed;

  // 필터 드롭다운처럼 고른 값을 placeholder로 보여주는 경우.
  return box.classList.contains('modified') ? clean(input?.placeholder) : '';
}

/** 조건들을 이름 한도에 맞게 이어 붙인다. 넘치는 뒷부분은 버린다. */
function joinParts(parts) {
  let out = '';
  for (const part of new Set(parts.filter(Boolean))) {
    const next = out ? out + SEP + part : part;
    if (next.length > NAME_MAX) break;
    out = next;
  }
  return out;
}

/**
 * 검색 폼에서 이름을 뽑는다. 검색창에 넣은 아이템이 있으면 그것,
 * 없으면 사용자가 고르거나 입력한 조건들을 이어 붙인다.
 * (예: `지도 · 지도 등급 16 · # 속성 부여 8+ · 제외 12개`)
 */
function titleFromSearchPane(doc) {
  const pane = doc?.querySelector(SEARCH_PANE);
  if (!pane) return '';

  const item = searchBoxItem(pane);
  if (item) return item.slice(0, NAME_MAX);

  const parts = [];

  // 고른 드롭다운 필터 — 아이템 유형(지도, 활 …), 희귀도, 판매 형식 …
  for (const el of pane.querySelectorAll(PICKED_FILTER)) {
    parts.push(clean(el.querySelector('.multiselect__input')?.placeholder));
  }

  // 값이 든 최소/최대 행 — 지도 등급, 아이템 레벨, 즉시 구입 가격 …
  // 능력치 그룹 행은 아래에서 그룹째로 다루므로 건너뛴다.
  for (const row of pane.querySelectorAll('.filter')) {
    if (row.closest(STAT_PANE)) continue;
    if (!row.querySelector('input.minmax.modified')) continue;
    parts.push(rowLabel(row));
  }

  // 능력치 그룹 — 행이 하나면 그 스탯을, 여럿이면 그룹 제목과 개수를 쓴다.
  // ('+ 능력치 필터 추가' 행은 제목이 없어 세지 않는다.)
  for (const group of pane.querySelectorAll(`${STAT_PANE} .filter-group`)) {
    const rows = [...group.querySelectorAll('.filter-group-body > .filter')].filter((row) =>
      row.querySelector('.filter-title')
    );
    if (!rows.length) continue;

    if (rows.length === 1) {
      parts.push(rowLabel(rows[0]));
      continue;
    }
    const name = rowTitle(group.querySelector('.filter-group-header'));
    parts.push(name ? `${name} ${rows.length}개` : `능력치 ${rows.length}개`);
  }

  return joinParts(parts);
}

// 브라우저에서는 <script>로 로드되고, 테스트에서는 require로 쓴다.
if (typeof module !== 'undefined') {
  module.exports = { titleFromSearchPane, NAME_MAX };
}
