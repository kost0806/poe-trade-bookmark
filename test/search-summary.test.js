/**
 * 검색 조건 요약 → 툴팁 문구·북마크 이름 테스트.
 *
 *   node --test
 *
 * 폼(DOM)을 읽는 부분은 브라우저가 필요해 여기서 다루지 않는다. 대신 읽어 낸
 * 구조에서 문구를 만드는 자리를 잡아 둔다 — 규칙이 있는 곳은 여기다.
 *
 * 콘텐츠 스크립트는 서로를 require하지 않는다(manifest.json이 정한 순서대로
 * <script>가 로드되고 전역을 나눠 쓴다). 그래서 여기서 그 순서를 대신 깔아 준다.
 */

const test = require('node:test');
const assert = require('node:assert');

// 문구는 화면 언어를 따라간다(lang.js). 기본은 한글이다.
Object.assign(globalThis, require('../lang.js'));
Object.assign(globalThis, require('../search-summary.js'));
const { formatSummary, summaryLines, hasSummary, SUMMARY_MAX_LINES } = globalThis;
const { titleFromSummary, NAME_MAX } = require('../search-name.js');

/** 요청 예시 그대로의 검색 — 괴사의 방어구, 타락 안 됨, 생명력·힘 하한. */
const NECRO = {
  item: '괴사의 방어구',
  filters: [{ label: '타락함', value: '아니오' }],
  ranges: [],
  statGroups: [
    {
      title: '모두 일치',
      rows: [
        { label: '생명력 최대치 +#', type: '', min: '100', max: '', value: '' },
        { label: '힘 총 #', type: '유사', min: '50', max: '', value: '' },
      ],
    },
  ],
};

/** 16T 8모드 지도 — 조건만으로 검색하고 능력치를 여럿 거는 쪽. */
const MAP_SEARCH = {
  item: '',
  filters: [{ label: '아이템 분류', value: '지도' }],
  ranges: [{ label: '지도 등급', type: '', min: '16', max: '16' }],
  statGroups: [
    {
      title: '모두 일치',
      rows: [{ label: '# 속성 부여', type: '유사', min: '8', max: '', value: '' }],
    },
    {
      title: '일치 없음',
      rows: Array.from({ length: 12 }, (_, i) => ({
        label: `거를 모드 ${i + 1}`,
        type: '',
        min: '',
        max: '',
        value: '',
      })),
    },
  ],
};

test('요약은 아이템 · 필터 · 능력치 순으로 한 줄씩 쌓인다', () => {
  assert.strictEqual(
    formatSummary(NECRO),
    ['괴사의 방어구', '타락함: 아니오', '[모두 일치]', '생명력 최대치 +#: >= 100', '(유사) 힘 총 #: >= 50'].join(
      '\n'
    )
  );
});

test('최소는 >=, 최대는 <=, 둘 다면 구간으로 적는다', () => {
  const row = (min, max) => ({
    item: '',
    filters: [],
    ranges: [{ label: '생명력', type: '', min, max }],
    statGroups: [],
  });

  assert.strictEqual(formatSummary(row('100', '')), '생명력: >= 100');
  assert.strictEqual(formatSummary(row('', '5')), '생명력: <= 5');
  assert.strictEqual(formatSummary(row('100', '200')), '생명력: 100 ~ 200');
  // 같은 값을 양쪽에 넣는 것은 '딱 이 값'이라는 뜻이다.
  assert.strictEqual(formatSummary(row('16', '16')), '생명력: = 16');
});

test('능력치는 그룹 제목을 함께 적는다', () => {
  // 같은 스탯이라도 찾는 조건인지 거르는 조건인지에 따라 뜻이 정반대다.
  const lines = summaryLines(MAP_SEARCH);
  assert.ok(lines.includes('[모두 일치]'));
  assert.ok(lines.includes('[일치 없음]'));
  assert.ok(lines.indexOf('[일치 없음]') < lines.indexOf('거를 모드 1'));
});

test('값이 없는 능력치는 이름만 적는다', () => {
  assert.strictEqual(
    formatSummary({
      item: '',
      filters: [],
      ranges: [],
      statGroups: [{ title: '일치 없음', rows: [{ label: '원소 피해 반사', type: '', min: '', max: '', value: '' }] }],
    }),
    '[일치 없음]\n원소 피해 반사'
  );
});

test('너무 길면 잘라내고 남은 줄 수를 알린다', () => {
  const lines = summaryLines(MAP_SEARCH);
  assert.ok(lines.length > SUMMARY_MAX_LINES, '이 표본은 한도를 넘겨야 뜻이 있다');

  const shown = formatSummary(MAP_SEARCH).split('\n');
  assert.strictEqual(shown.length, SUMMARY_MAX_LINES + 1);
  assert.strictEqual(shown.at(-1), `…외 ${lines.length - SUMMARY_MAX_LINES}줄`);
});

test('조건이 하나도 없으면 빈 문자열', () => {
  const empty = { item: '', filters: [], ranges: [], statGroups: [] };
  assert.strictEqual(hasSummary(empty), false);
  assert.strictEqual(hasSummary(null), false);
  assert.strictEqual(formatSummary(empty), '');
  assert.strictEqual(formatSummary(null), '');
});

test('이름은 검색창에 넣은 아이템을 그대로 쓴다', () => {
  assert.strictEqual(titleFromSummary(NECRO), '괴사의 방어구');
});

test('아이템이 없으면 조건을 이어 붙이고, 능력치가 여럿이면 개수로 접는다', () => {
  assert.strictEqual(titleFromSummary(MAP_SEARCH), '지도 · 지도 등급 16 · # 속성 부여 8+ · 일치 없음 12개');
});

test('이름은 한도를 넘지 않는다', () => {
  const long = {
    item: '',
    filters: Array.from({ length: 20 }, (_, i) => ({ label: '분류', value: `아주 긴 조건 이름 ${i}` })),
    ranges: [],
    statGroups: [],
  };
  assert.ok(titleFromSummary(long).length <= NAME_MAX);
  assert.strictEqual(titleFromSummary(null), '');
});
