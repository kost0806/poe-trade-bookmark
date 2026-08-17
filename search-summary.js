/**
 * 거래소 검색 폼(DOM)에서 검색 조건을 구조로 뽑고, 사람이 읽을 요약으로 만든다.
 *
 * 검색 조건은 주소에 남지 않고 폼에만 있다. 패널은 거래소 페이지 안에서 도는
 * 콘텐츠 스크립트라, 요청을 보낼 필요 없이 폼을 그대로 읽으면 된다.
 *
 * 거래소 폼은 vue-multiselect를 쓰고, 값이 있는 곳이 자리마다 다르다.
 *   - 검색창(아이템): `.search-left .search-select` 안의 태그/선택 라벨/입력값
 *   - 드롭다운 필터(아이템 유형, 희귀도, 타락함 …): 고른 라벨이 안쪽 input의
 *     placeholder로 들어가고, 컨테이너에 `modified`가 붙는다
 *   - 최소/최대 칸: `input.form-control.minmax`, 값이 있으면 `modified`가 붙는다
 *   - 능력치 그룹(`.search-advanced-pane.brown`): 사용자가 쌓은 스탯 행들.
 *     그룹 제목이 곧 조건(모두 일치 / 일치 없음 / 개수 …)이다
 *
 * 상단의 리그·상태 드롭다운은 `.status-select`라서 필터 선택자에 걸리지 않는다.
 * 폼을 못 찾으면 null을 돌려주고, 부르는 쪽이 주소로 만든 이름을 쓴다.
 *
 * 여기서 나온 구조를 두 곳이 쓴다 — 북마크 기본 이름(`search-name.js`)과
 * 목록 항목의 툴팁(`formatSummary`). 거래소가 마크업을 바꾸면 손볼 곳은 여기뿐이다.
 */

const SEARCH_PANE = '.search-panel';
const SEARCH_BOX = '.search-left .search-select';
const STAT_PANE = '.search-advanced-pane.brown';
const PICKED_FILTER = '.multiselect.filter-select.modified';

// 툴팁이 화면을 덮지 않을 만큼만 보여주고 나머지는 줄 수로 알린다.
const SUMMARY_MAX_LINES = 14;

const clean = (value) => (value ?? '').replace(/\s+/g, ' ').trim();

/**
 * 필터 행의 제목. `유사`, `비고정` 같은 스탯 종류 딱지(`.mutate-type`)는 따로 뽑는다.
 * 이름에서는 군더더기라 버리고, 요약에서는 `(유사) 힘 총 #`처럼 앞에 붙인다.
 */
function rowTitle(row) {
  const el = row?.querySelector('.filter-title');
  if (!el) return { label: '', type: '' };

  let label = '';
  let type = '';
  for (const node of el.childNodes) {
    const text = node.textContent ?? '';
    if (node.nodeType === 1 && node.classList.contains('mutate-type')) type += text;
    else label += text;
  }
  return { label: clean(label), type: clean(type) };
}

/** 최소/최대 칸에 든 값. 한쪽만 넣는 일이 많아 그대로 나눠 담는다. */
function rowRange(row) {
  const inputs = row.querySelectorAll('input.minmax');
  return { min: clean(inputs[0]?.value), max: clean(inputs[1]?.value) };
}

/** 행 안에서 고른 드롭다운 값. 고른 라벨은 안쪽 input의 placeholder에 들어간다. */
function pickedValue(row) {
  const el = row?.querySelector(PICKED_FILTER);
  return el ? clean(el.querySelector('.multiselect__input')?.placeholder) : '';
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

/**
 * 검색 폼을 읽어 조건을 구조로 돌려준다.
 *
 * {
 *   item: '괴사의 방어구',                                  // 검색창
 *   filters:    [{ label: '타락함', value: '아니오' }],      // 고른 드롭다운
 *   ranges:     [{ label: '지도 등급', min: '16', max: '16' }], // 값이 든 최소/최대 칸
 *   statGroups: [{ title: '모두 일치', rows: [{ label, type, min, max, value }] }],
 * }
 *
 * 담는 것은 사용자가 고르거나 입력한 값뿐이다. 건드리지 않은 칸은 거래소가
 * `modified`를 붙이지 않으므로 자연히 빠진다.
 */
function summarizeSearchPane(doc) {
  const pane = doc?.querySelector(SEARCH_PANE);
  if (!pane) return null;

  const filters = [];
  for (const el of pane.querySelectorAll(PICKED_FILTER)) {
    // 능력치 행의 값 드롭다운은 아래에서 그 행과 함께 다룬다.
    if (el.closest(STAT_PANE)) continue;
    const value = clean(el.querySelector('.multiselect__input')?.placeholder);
    if (!value) continue;
    filters.push({ label: rowTitle(el.closest('.filter')).label, value });
  }

  // 값이 든 최소/최대 행 — 지도 등급, 아이템 레벨, 즉시 구입 가격 …
  // 능력치 그룹 행은 아래에서 그룹째로 다루므로 건너뛴다.
  const ranges = [];
  for (const row of pane.querySelectorAll('.filter')) {
    if (row.closest(STAT_PANE)) continue;
    if (!row.querySelector('input.minmax.modified')) continue;
    ranges.push({ ...rowTitle(row), ...rowRange(row) });
  }

  // 능력치 그룹 — 그룹 제목이 곧 조건이라 행과 함께 남긴다.
  // ('+ 능력치 필터 추가' 행은 제목이 없어 세지 않는다.)
  const statGroups = [];
  for (const group of pane.querySelectorAll(`${STAT_PANE} .filter-group`)) {
    const rows = [...group.querySelectorAll('.filter-group-body > .filter')]
      .filter((row) => row.querySelector('.filter-title'))
      .map((row) => ({ ...rowTitle(row), ...rowRange(row), value: pickedValue(row) }));
    if (!rows.length) continue;
    statGroups.push({ title: rowTitle(group.querySelector('.filter-group-header')).label, rows });
  }

  return { item: searchBoxItem(pane), filters, ranges, statGroups };
}

/** 읽어 낸 것이 하나라도 있는지 — 거래소가 폼을 채우기 전인지 가리는 데 쓴다. */
function hasSummary(summary) {
  if (!summary) return false;
  return Boolean(
    summary.item || summary.filters.length || summary.ranges.length || summary.statGroups.length
  );
}

/** 요약 한 줄에 쓰는 값. 최소는 `>=`, 최대는 `<=`, 한쪽만 넣는 일이 많아 모양을 나눈다. */
function summaryValue({ min, max, value }) {
  if (min && max) return min === max ? `= ${min}` : `${min} ~ ${max}`;
  if (min) return `>= ${min}`;
  if (max) return `<= ${max}`;
  return value ?? '';
}

/** `(유사) 힘 총 #: >= 50` — 값이 없으면 이름만. */
function summaryRow(row) {
  const name = row.type ? `(${row.type}) ${row.label}` : row.label;
  const value = summaryValue(row);
  return value ? `${name}: ${value}` : name;
}

/**
 * 요약을 줄 단위로 편다. 첫 줄은 검색창의 아이템,
 * 그다음이 고른 필터와 값이 든 칸, 마지막이 능력치 그룹이다.
 *
 * 능력치는 그룹 제목(`[모두 일치]`, `[일치 없음]`)을 함께 적는다. 같은 스탯이라도
 * 찾는 조건인지 거르는 조건인지에 따라 뜻이 정반대라, 빼면 요약이 거짓말이 된다.
 */
function summaryLines(summary) {
  if (!summary) return [];

  const lines = [];
  if (summary.item) lines.push(summary.item);
  for (const filter of summary.filters) {
    lines.push(filter.label ? `${filter.label}: ${filter.value}` : filter.value);
  }
  for (const range of summary.ranges) lines.push(summaryRow(range));
  for (const group of summary.statGroups) {
    lines.push(`[${group.title || T().summaryStats}]`);
    for (const row of group.rows) lines.push(summaryRow(row));
  }
  return lines.filter(Boolean);
}

/** 툴팁에 넣을 여러 줄 문자열. 조건이 없으면 ''. */
function formatSummary(summary, max = SUMMARY_MAX_LINES) {
  const lines = summaryLines(summary);
  if (!lines.length) return '';
  if (lines.length <= max) return lines.join('\n');
  return [...lines.slice(0, max), T().summaryMore(lines.length - max)].join('\n');
}

// 브라우저에서는 <script>로 로드되고, 테스트에서는 require로 쓴다.
if (typeof module !== 'undefined') {
  module.exports = {
    summarizeSearchPane,
    hasSummary,
    summaryLines,
    formatSummary,
    SUMMARY_MAX_LINES,
  };
}
