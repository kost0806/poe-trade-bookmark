/**
 * 거래소 검색 조건으로 북마크 기본 이름을 짓는다.
 *
 * 폼을 읽는 일은 `search-summary.js`가 한다. 여기서는 그 구조를 한 줄 이름으로
 * 줄인다 — 툴팁 요약과 달리 이름은 80자 안에 들어가야 해서, 능력치가 여럿이면
 * 낱낱이 적지 않고 `제외 12개`처럼 개수로 접는다.
 *
 * 아무것도 못 읽으면 ''을 돌려주고, 부르는 쪽이 검색 ID로 만든 이름을 쓴다.
 */

const NAME_MAX = 80; // 이름 칸(input maxlength)과 같은 한도
const SEP = ' · ';

/** 이름에 쓰는 최소/최대 표기 — `16`, `8+`, `~5`, `1-3`. */
function nameRange({ min, max }) {
  if (min && max) return min === max ? min : `${min}-${max}`;
  if (min) return `${min}+`;
  if (max) return `~${max}`;
  return '';
}

function nameRow(row) {
  if (!row.label) return '';
  const range = nameRange(row);
  return range ? `${row.label} ${range}` : row.label;
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
 * 검색 조건 요약에서 이름을 뽑는다. 검색창에 넣은 아이템이 있으면 그것,
 * 없으면 사용자가 고르거나 입력한 조건들을 이어 붙인다.
 * (예: `지도 · 지도 등급 16 · # 속성 부여 8+ · 제외 12개`)
 */
function titleFromSummary(summary) {
  if (!summary) return '';
  if (summary.item) return summary.item.slice(0, NAME_MAX);

  const parts = [];

  // 고른 드롭다운 필터 — 아이템 유형(지도, 활 …), 희귀도, 판매 형식 …
  for (const filter of summary.filters) parts.push(filter.value);

  // 값이 든 최소/최대 행 — 지도 등급, 아이템 레벨, 즉시 구입 가격 …
  for (const range of summary.ranges) parts.push(nameRow(range));

  // 능력치 그룹 — 행이 하나면 그 스탯을, 여럿이면 그룹 제목과 개수를 쓴다.
  for (const group of summary.statGroups) {
    if (group.rows.length === 1) {
      parts.push(nameRow(group.rows[0]));
      continue;
    }
    parts.push(T().summaryGroupCount(group.title || T().summaryStats, group.rows.length));
  }

  return joinParts(parts);
}

// 브라우저에서는 <script>로 로드되고, 테스트에서는 require로 쓴다.
if (typeof module !== 'undefined') {
  module.exports = { titleFromSummary, NAME_MAX };
}
