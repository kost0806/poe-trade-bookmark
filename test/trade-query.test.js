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

const { MAP_MOD_POOL } = require('./map-mod-pool.js');

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

test('키워드는 목록 안에서 그 모드에만 걸린다', () => {
  // 모드 80개를 서로 다 대조한다. 하나라도 겹치면 인게임에서 엉뚱한 지도가 사라진다.
  const collisions = [];
  for (const target of MAP_MODS) {
    const hits = MAP_MODS.filter((m) => modMatchesPattern(target.regex, m));
    if (hits.length !== 1 || hits[0] !== target) {
      collisions.push(`${target.regex} (${target.affix}) → ${hits.map((m) => m.affix).join(', ')}`);
    }
  }
  assert.deepStrictEqual(collisions, []);
});

test('키워드는 목록 밖 모드에도 걸리지 않는다', () => {
  /*
   * 목록끼리만 대조하면 부족하다. 목록은 거를 만한 모드만 담고 있어서, T16 지도에
   * 실제로 붙는 다른 모드(타락·스컬지·탐광)에 걸리는 사고를 못 잡는다. 인게임
   * 검색은 아이템 전문을 훑으므로 그런 모드 한 줄에만 걸려도 지도가 사라진다.
   */
  const collisions = [];
  for (const target of MAP_MODS) {
    for (const entry of MAP_MOD_POOL) {
      if (!modMatchesPattern(target.regex, entry)) continue;
      // 풀 항목이 이 모드 자신이면 걸리는 것이 맞다.
      if (target.text.split('\n').some((line) => entry.text.includes(line))) continue;
      collisions.push(`${target.regex} (${target.affix}) → [${entry.source}] ${entry.text}`);
    }
  }
  assert.deepStrictEqual(collisions, []);
});

test('키워드는 모드가 아닌 줄에도 걸리지 않는다', () => {
  /*
   * 아이템 전문에는 모드 말고 이름·속성 줄도 있다. 예전에 '종류'가
   * '아이템 종류: 지도'에 걸려 멀쩡한 지도를 전부 숨긴 적이 있다.
   */
  const NON_MOD_LINES = [
    '아이템 종류: 지도',
    '희귀도: 희귀',
    '지도 등급: 16',
    '아이템 수량: +94% (강화됨)',
    '아이템 희귀도: +42% (강화됨)',
    '몬스터 무리 규모: +35% (강화됨)',
    '아이템 레벨: 83',
    '지도 장치에서 사용하거나 지도 장치의 아이템 슬롯에 넣으십시오.',
    '타락됨',
    '--------',
  ];

  const collisions = [];
  for (const target of MAP_MODS) {
    for (const line of NON_MOD_LINES) {
      if (modMatchesPattern(target.regex, { text: line })) {
        collisions.push(`${target.regex} (${target.affix}) → ${line}`);
      }
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

test('문법이 깨진 패턴은 글자 그대로 찾는다', () => {
  // 게임과 같은 동작이다. '['는 어느 모드 문구에도 없으므로 unmatched로 남는다.
  const back = matchModsByRegex('!재사|[', MAP_MODS);
  assert.deepStrictEqual(back.invalid, []);
  assert.deepStrictEqual(back.unmatched, ['[']);
  assert.deepStrictEqual(back.mods.map((m) => m.affix), ['- 피로']);
});

test('게임에서 어떻게 되는지 모르는 문법만 따로 알린다', () => {
  const back = matchModsByRegex('(?<=몬스터)피해', MAP_MODS);
  assert.strictEqual(back.mods.length, 0);
  assert.strictEqual(back.invalid.length, 1);
  assert.match(back.invalid[0].message, /후방 탐색/);
});

test('전방 탐색이 든 정규식도 그대로 읽는다', () => {
  const back = matchModsByRegex('!재사(?=용)', MAP_MODS);
  assert.deepStrictEqual(back.invalid, []);
  assert.deepStrictEqual(back.mods.map((m) => m.affix), ['- 피로']);
});

test('따옴표로 묶은 문구는 붙어 있어야 걸린다', () => {
  // 공백에서 다시 쪼개면 낱말들의 AND가 되어 엉뚱한 모드까지 걸린다.
  const 야만적인 = mod('야만적인');
  assert.strictEqual(야만적인.text, '몬스터 피해 (22—25)% 증가');
  assert.strictEqual(modMatchesPattern('몬스터 피해', 야만적인), true);
  assert.strictEqual(modMatchesPattern('몬스터 증가', 야만적인), false);
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
