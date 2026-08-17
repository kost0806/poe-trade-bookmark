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

/*
 * 대조에 쓰는 데이터는 test/fixtures에 JSON으로 있다. 어디서 받아 온 것이고 무엇을
 * 잡아내는지는 test/fixtures/README.md에 적어 두었다.
 */
const MAP_MOD_POOL = require('./fixtures/map-mod-pool.json');
const MAP_ITEM_NAMES = require('./fixtures/map-item-names.json');
const REAL_MAPS = require('./fixtures/real-maps.json');
const TRADE_STATS = require('./fixtures/trade-stats.json');
// 필터 정의는 원본이 18KB로 작아서 대조표를 따로 뽑지 않고 그대로 읽는다.
const TRADE_FILTERS = require('../data/search-filters.json');


const {
  buildRegex,
  buildSearchQuery,
  parseRegexInput,
  modMatchesPattern,
  matchModsByRegex,
  AFFIX_COUNT_ID,
  INFLUENCE_IDS,
  REGEX_MAX,
  RARITY_NON_UNIQUE,
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

test('키워드는 지도 칸의 아이템 이름에도 걸리지 않는다', () => {
  /*
   * 아이템 전문에는 기본 아이템 이름도 들어 있다. 지금 지도의 기본 이름은 대개
   * 그냥 '지도'라 위험이 작지만(실물 세 장 모두 '지도 (16등급)'이다), 지도 칸에는
   * 갑충석·조각도 같이 들어간다. '예속된'의 옛 키워드 '사로잡'이 갑충석
   * '사로잡힘의 고통'과 겹쳐서, 그 갑충석이 검색에서 사라졌다.
   */
  const collisions = [];
  for (const target of MAP_MODS) {
    for (const name of MAP_ITEM_NAMES) {
      if (modMatchesPattern(target.regex, { text: name })) {
        collisions.push(`${target.regex} (${target.affix}) → ${name}`);
      }
    }
  }
  assert.deepStrictEqual(collisions, []);
});

test('모드 문구에 빠진 줄이 없다', () => {
  /*
   * 한 모드가 여러 줄인 경우가 11개 있는데, 그중 한 줄이라도 빠지면 두 군데가
   * 조용히 망가진다. 빠진 줄에 걸리는 정규식이 그 모드를 못 찾고(역방향 선택),
   * 유일성 검사도 그 줄을 대조하지 못해 충돌을 놓친다. 실제로 '- 수렁'의
   * '플레이어가 방지하는 억제된 주문 피해 -20%'가 빠져 있어서, '억제'가 두 모드에
   * 걸린다는 사실을 목록끼리의 대조로는 잡지 못했다.
   *
   * 그래서 모드마다 짝을 지어 보지 않고, 목록이 아는 줄 전부를 어휘로 삼아 풀에서
   * 지워 본다. 지워지지 않고 남는 조각이 곧 목록이 모르는 줄이다.
   */
  const KNOWN_LINES = [...new Set(MAP_MODS.flatMap((m) => m.text.split('\n')))]
    // 긴 줄부터 지워야 짧은 줄이 긴 줄을 조각내지 않는다.
    .sort((a, b) => b.length - a.length);

  // 목록이 일부러 담지 않는 줄. 전부 지도를 좋게 만드는 타락 옵션이라 거를 이유가
  // 없다. '경험치 획득'은 poedb에 값 자리(#)가 없어 아이템에 찍히지 않는 내부 스탯.
  const EXPECTED_UNKNOWN = [
    '경험치 획득 % 증가',
    '바알 부가 지역 등장',
    '플레이어가 사용하는 바알 스킬에 영혼 획득 방지가 적용되지 않음',
    '지역에 무작위 갑충석 효과 (1—5)개 추가',
    '지역이 할당되지 않은 무작위 주요 아틀라스 패시브 스킬 추가 (5—15)개의 영향을 받음',
    '지역에 대한 아틀라스 패시브 스킬의 효과 (10—15)% 증가',
  ];

  const unknown = [];
  for (const entry of MAP_MOD_POOL) {
    let rest = entry.text;
    for (const line of KNOWN_LINES) rest = rest.split(line).join('\u0000');
    for (const piece of rest.split('\u0000').map((s) => s.trim()).filter(Boolean)) {
      if (!EXPECTED_UNKNOWN.includes(piece)) unknown.push(`[${entry.source}] ${piece}`);
    }
  }

  assert.deepStrictEqual(unknown, []);
});

test('여러 줄 모드는 풀의 문구를 그대로 담고 있다', () => {
  const multi = MAP_MODS.filter((m) => m.text.includes('\n'));
  assert.strictEqual(multi.length, 11, '여러 줄 모드 수가 바뀌었다');

  for (const mod of multi) {
    const lines = mod.text.split('\n');
    for (const line of lines) {
      const found = MAP_MOD_POOL.some((e) => e.text.includes(line));
      assert.ok(found, `${mod.affix}의 줄이 풀에 없다: ${line}`);
    }
  }
});

for (const map of REAL_MAPS) {
  test(`실제 지도 '${map.label}'에서 붙어 있는 모드만 걸린다`, () => {
    const present = MAP_MODS.filter((m) => map.affixes.includes(m.affix));
    assert.strictEqual(present.length, map.affixes.length, '붙어 있는 모드가 목록에 다 있어야 한다');

    const hits = MAP_MODS.filter((m) => modMatchesPattern(m.regex, { text: map.text }));
    assert.deepStrictEqual(
      hits.map((m) => m.affix).sort(),
      [...map.affixes].sort(),
      '붙어 있는 모드만 걸려야 한다'
    );

    // 붙어 있는 모드를 거르는 정규식이면 이 지도는 인게임에서 숨는다.
    assert.strictEqual(matchesQuery(buildRegex(present), map.text), false);

    // 붙어 있지 않은 모드만 거르는 정규식이면 그대로 보여야 한다.
    const absent = MAP_MODS.filter((m) => !map.affixes.includes(m.affix));
    assert.strictEqual(matchesQuery(buildRegex(absent), map.text), true);
  });
}

test('여러 모드를 묶은 항목은 그 변종 전부에 걸린다', () => {
  /*
   * 값만 다른 같은 계열은 한 항목으로 묶여 있는데, 키워드가 한쪽 변종에만 있는
   * 문구를 집으면 다른 변종을 놓친다. '변함없는'(생명력 25~30% 증폭 + 기절 면역)과
   * '다산의'(생명력 40~49% 증폭)가 한 항목인데 키워드가 '기절.면'이라, 다산의만
   * 붙은 지도가 필터를 그냥 통과했다.
   */
  const missed = [];
  for (const mod of MAP_MODS) {
    const lines = mod.text.split('\n');
    const variants = MAP_MOD_POOL.filter((e) => lines.some((l) => e.text.includes(l)));
    for (const variant of variants) {
      if (!modMatchesPattern(mod.regex, variant)) {
        missed.push(`${mod.regex} (${mod.affix}) ↛ [${variant.name || variant.source}] ${variant.text}`);
      }
    }
  }
  assert.deepStrictEqual(missed, []);
});

test('키워드는 고급 모드 설명 줄에도 걸리지 않는다', () => {
  /*
   * 고급 모드 설명을 켜면 모드마다 이런 줄이 앞에 붙는다:
   *   { 접미어 속성 부여 "- 독액" (등급: 1) — 카오스, 상태 이상 }
   *
   * 인게임 검색은 이 줄도 읽는다. real-maps.json의 지도를 창고에서 '변덕'으로 검색하면
   * 걸리는데, 그 지도에서 '변덕'이 있는 곳은 { 접두어 속성 부여 "변덕스러운" ... }
   * 한 줄뿐이다(모드 문구는 '지역에 염소인간 서식'이라 '변덕'이 없다).
   *
   * 그래서 이름이나 태그와 같은 키워드를 쓰면 그 모드가 없는 지도까지 숨는다.
   */
  const scaffolding = MAP_MOD_POOL.filter((e) => e.name).map((e) => {
    // 접미어는 게임에서 이름 앞에 붙임표가 붙는다: { 접미어 속성 부여 "- 혈맹" ... }
    const word = e.affix === 'prefix' ? '접두어' : '접미어';
    const shown = e.affix === 'prefix' ? e.name : `- ${e.name}`;
    const head = `{ ${word} 속성 부여 "${shown}" (등급: 1)`;
    return e.tags.length ? `${head} — ${e.tags.join(', ')} }` : `${head} }`;
  });
  scaffolding.push('— 변경이 불가능한 값');

  const collisions = [];
  for (const target of MAP_MODS) {
    for (const line of scaffolding) {
      // 자기 모드의 줄에 걸리는 것은 상관없다. map-mods의 affix가 곧 게임 표기다
      // (접미어는 '- 쇠약'처럼 붙임표까지 포함해서 적혀 있다).
      if (line.includes(`"${target.affix}"`)) continue;
      if (modMatchesPattern(target.regex, { text: line })) {
        collisions.push(`${target.regex} (${target.affix}) → ${line}`);
      }
    }
  }
  assert.deepStrictEqual(collisions, []);
});

test('stat id가 거래소의 그 스탯을 가리킨다', () => {
  /*
   * id를 잘못 적으면 거래소는 걸러 주지 않는데 인게임 필터만 숨긴다 — 사 온 지도가
   * 창고에서 사라지는 어긋남이다. 그래서 id마다 거래소가 뭐라고 부르는지 받아
   * 적어 두고(test/fixtures/trade-stats.json) 문구가 짝이 맞는지 본다.
   *
   * 거래소 문구와 아이템 문구는 원래 다른 자리가 있다. 확률이 100%면 아이템은
   * '#%의 확률로'를 안 찍고, 값이 음수면 반대말로 찍고(증가↔감소, 증폭↔감폭),
   * 거래소만 '지도 내'·'지도 보스'를 쓴다. 그 자리를 맞춘 뒤 견준다.
   */
  const value = (s) =>
    s
      .replace(/\(-?\d+[—-]-?\d+\)/g, '#')
      .replace(/[+-]?\d+(\.\d+)?/g, '#')
      .replace(/[+-]#/g, '#')
      .replace(/#+/g, '#');
  const same = (s) =>
    value(s)
      // 거래소는 '#%의 확률로', 아이템은 '#% 확률로'이거나 아예 안 찍는다.
      .replace(/#%의? 확률로 /g, '')
      .replace(/증폭|감폭/g, '폭')
      .replace(/증가|감소/g, '증감')
      .replace(/지도 보스|고유 보스/g, '보스')
      .replace(/^지도 내 /, '')
      .replace(/지도에서|지역에서/g, '에서')
      .replace(/ 수 /g, ' ')
      .replace(/타락한 아이템으로 떨어짐/g, '타락')
      .replace(/\s+/g, ' ')
      .trim();

  const problems = [];
  for (const mod of MAP_MODS) {
    assert.deepStrictEqual([...new Set(mod.ids)], mod.ids, `${mod.affix}에 중복 id가 있다`);

    const lines = mod.text.split('\n');
    for (const id of mod.ids) {
      const trade = TRADE_STATS[id];
      if (trade === undefined) {
        problems.push(`${mod.affix}: 거래소에 없는 id ${id}`);
        continue;
      }
      // 한 스탯이 두 줄을 한꺼번에 나타내기도 한다.
      for (const t of trade.split('\n')) {
        if (!lines.some((l) => same(l) === same(t))) {
          problems.push(`${mod.affix}: ${id}\n    거래소: ${t}\n    목록  : ${lines.join(' / ')}`);
        }
      }
    }
  }
  assert.deepStrictEqual(problems, []);
});

test('영향력 제외에 쓰는 id도 거래소에 있다', () => {
  for (const id of [AFFIX_COUNT_ID, ...INFLUENCE_IDS]) {
    assert.ok(TRADE_STATS[id] !== undefined, `거래소에 없는 id: ${id}`);
  }
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
  const keys = buildRegex(MAP_MODS).slice(1).split('|');
  const lengths = keys.map((k) => k.length);
  assert.deepStrictEqual(lengths, [...lengths].sort((a, b) => a - b));
});

test('키워드는 한글 3글자 이상이다', () => {
  /*
   * 희귀 지도에는 무작위로 만든 이름('운명의 도전' 같은)이 붙는데, 그 낱말 목록을
   * 구할 수 없어 검사로 막지 못한다. 2글자 키워드는 그런 이름에 걸릴 확률이 무시할
   * 수준이 아니라서 길이로 막는다. 맵모드를 열 개 넘게 거는 일이 드물어, 모드당
   * 서너 글자를 써도 인게임 한도인 250자 안에 넉넉히 들어간다.
   */
  const short = MAP_MODS.filter((m) => (m.regex.match(/[가-힣]/g) || []).length < 3);
  assert.deepStrictEqual(short.map((m) => `${m.regex} (${m.affix})`), []);
});

test('열두 개를 골라도 인게임 한도에 넉넉히 들어간다', () => {
  const twelve = MAP_MODS.slice(0, 12);
  assert.ok(buildRegex(twelve).length < REGEX_MAX / 2, '열두 개면 한도의 절반도 안 써야 한다');
  // 여든 개를 다 고르면 한도를 넘는다. 화면에서 글자 수가 붉게 바뀌어 알린다.
  assert.ok(buildRegex(MAP_MODS).length > REGEX_MAX);
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

test('검색 쿼리가 지도 분류와 비고유 희귀도로 좁힌다', () => {
  // 8모드는 희귀 지도에만 붙는다. 희귀도를 비워 두면 고유 지도까지 결과에 섞인다.
  const { filters } = buildSearchQuery({}).query.filters.type_filters;
  assert.strictEqual(filters.category.option, 'map');
  assert.strictEqual(filters.rarity.option, RARITY_NON_UNIQUE);

  /*
   * 옵션 id는 거래소가 준 필터 정의(data/search-filters.json)에 대고 확인한다.
   * 스탯 id와 같은 이유다 — 틀린 id를 적으면 거래소가 조건을 조용히 무시한다.
   */
  const typeFilters = TRADE_FILTERS.result.find((g) => g.id === 'type_filters');
  const options = typeFilters.filters.find((f) => f.id === 'rarity').option.options;
  assert.strictEqual(options.find((o) => o.text === '모든 비고유')?.id, RARITY_NON_UNIQUE);
  assert.ok(
    typeFilters.filters.find((f) => f.id === 'category').option.options.some((o) => o.id === 'map'),
    'map 분류가 있어야 한다'
  );
});
