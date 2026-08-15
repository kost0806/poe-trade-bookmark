/**
 * 정규식 ↔ 맵모드 왕복 테스트.
 *
 *   node --test
 *
 * 콘텐츠 스크립트는 서로를 require하지 않는다. 브라우저에서는 manifest.json이
 * 정한 순서대로 <script>가 로드되고 전역을 그대로 나눠 쓰기 때문이다. 그래서
 * 여기서 manifest.json이 하던 일을 대신 해 준다 — 먼저 로드되는 파일의 전역을
 * 깔아 두고 그다음 파일을 부른다.
 */

const test = require('node:test');
const assert = require('node:assert');

Object.assign(globalThis, require('../poe-regex.js'));
const { MAP_MODS } = require('../map-mods.js');
Object.assign(globalThis, { MAP_MODS });

const {
  buildRegex,
  buildSearchQuery,
  parseRegexInput,
  modMatchesPattern,
  matchModsByRegex,
  REGEX_MAX,
} = require('../trade-query.js');

/** affix로 모드 하나를 집는다. */
function mod(affix) {
  const found = MAP_MODS.find((m) => m.affix === affix);
  assert.ok(found, `${affix} 모드가 없다`);
  return found;
}

test('키워드는 그 모드에만 걸린다', () => {
  // 목록 전체를 훑어 키워드가 유일한지 본다. 하나라도 겹치면 인게임에서
  // 엉뚱한 지도가 사라진다.
  const collisions = [];
  for (const target of MAP_MODS) {
    const hits = MAP_MODS.filter((m) => modMatchesPattern(target.regex, m));
    if (hits.length !== 1) {
      collisions.push(`${target.regex} → ${hits.map((m) => m.affix).join(', ')}`);
    }
  }
  assert.deepStrictEqual(collisions, []);
});

test('모든 키워드가 인게임 문법으로 성하다', () => {
  for (const m of MAP_MODS) {
    const compiled = compileQuery(m.regex);
    assert.deepStrictEqual(compiled.errors, [], `${m.affix}의 키워드가 깨졌다: ${m.regex}`);
  }
});

test('만든 정규식을 되짚으면 고른 모드가 그대로 나온다', () => {
  const picked = [mod('- 피로'), mod('- 응고'), mod('억제하는')];
  const regex = buildRegex(picked);

  assert.ok(regex.startsWith('!'), '부정으로 시작해야 한다');

  const back = matchModsByRegex(regex, MAP_MODS);
  assert.deepStrictEqual(back.unmatched, []);
  assert.deepStrictEqual(back.invalid, []);
  assert.deepStrictEqual(
    back.mods.map((m) => m.affix).sort(),
    picked.map((m) => m.affix).sort()
  );
});

test('모드를 모두 골라도 왕복이 어긋나지 않는다', () => {
  const regex = buildRegex(MAP_MODS);
  const back = matchModsByRegex(regex, MAP_MODS);
  assert.deepStrictEqual(back.unmatched, []);
  assert.strictEqual(back.mods.length, MAP_MODS.length);
});

test('정규식을 항목·대안으로 편다', () => {
  assert.deepStrictEqual(parseRegexInput('!터는|재사'), ['터는', '재사']);
  assert.deepStrictEqual(parseRegexInput('터는 재사'), ['터는', '재사']);
  // 그룹 안의 '|'는 대안 구분자가 아니다.
  assert.deepStrictEqual(parseRegexInput('!대치.-(9|1[0-2])%'), ['대치.-(9|1[0-2])%']);
});

test('수치 구간은 값이 채워진 실제 문구로도 맞춰 본다', () => {
  // 목록에는 '몬스터 피해 (22—25)% 증가'로 적혀 있지만 실제 아이템은 '23%'다.
  assert.strictEqual(modMatchesPattern('터.피해...%', mod('야만적인')), true);
});

test('어디에도 안 걸리는 패턴은 unmatched로 알린다', () => {
  const back = matchModsByRegex('!재사|없는말', MAP_MODS);
  assert.deepStrictEqual(back.unmatched, ['없는말']);
  assert.deepStrictEqual(back.mods.map((m) => m.affix), ['- 피로']);
});

test('문법이 깨진 패턴은 왜 깨졌는지와 함께 알린다', () => {
  const back = matchModsByRegex('!재사|[', MAP_MODS);
  assert.strictEqual(back.invalid.length, 1);
  assert.strictEqual(back.invalid[0].pattern, '[');
  assert.match(back.invalid[0].message, /대괄호/);
  // 성한 항목은 그대로 살린다.
  assert.deepStrictEqual(back.mods.map((m) => m.affix), ['- 피로']);
});

test('인게임에 없는 문법은 받지 않는다', () => {
  const back = matchModsByRegex('(?=재사)', MAP_MODS);
  assert.strictEqual(back.mods.length, 0);
  assert.strictEqual(back.invalid.length, 1);
});

test('짧은 키워드가 앞에 온다 — 잘려도 더 많이 살아남게', () => {
  const regex = buildRegex([mod('- 피로'), mod('- 인내')]);
  const keys = regex.slice(1).split('|');
  assert.deepStrictEqual(keys, ['재사', '중.시.인']);
});

test('한도는 엔진과 같은 값을 쓴다', () => {
  assert.strictEqual(REGEX_MAX, POE_QUERY_MAX);
});

test('검색 쿼리에 영향력 제외와 즉시 구입이 들어간다', () => {
  const query = buildSearchQuery({ modIds: ['explicit.stat_941368244'] });
  assert.strictEqual(query.query.status.option, 'securable');

  const notGroups = query.query.stats.filter((s) => s.type === 'not');
  assert.strictEqual(notGroups.length, 2, '영향력 제외 + 거를 모드');
  assert.ok(notGroups[0].filters.every((f) => f.id.startsWith('implicit.')));
});
