/**
 * 영문 맵모드 목록 검사.
 *
 *   node --test
 *
 * 한글판 검사(`trade-query.test.js`)와 같은 것을 영문 데이터에 대고 다시 한다.
 * 목록을 만든 스크립트(`tools/build-map-mods-en.js`)와 여기가 같은 규칙을 두 번
 * 적는 셈인데, 그래야 한다 — 스크립트는 다시 돌릴 때만 도는 반면 이 검사는 데이터가
 * 바뀔 때마다 돌고, 손으로 고친 키워드도 여기서 걸린다.
 *
 * 다른 점 하나: 실제 영문 지도의 전문(`fixtures/en/map-item-lines.json`)은 게임에서
 * 직접 뜬 것이 아니라 공개된 이슈에서 옮겨 온 것이라, '걸리면 안 되는 줄'로만 쓴다.
 * 한글판의 real-maps.json처럼 '이 모드들만 걸려야 한다'를 확인하는 데는 쓰지 않는다.
 */

const test = require('node:test');
const assert = require('node:assert');

Object.assign(globalThis, require('../poe-regex.js'));
const { MAP_MODS_KO } = require('../map-mods.js');
const { MAP_MODS_EN, MOD_GROUPS_EN } = require('../map-mods-en.js');

const MAP_MOD_POOL = require('./fixtures/en/map-mod-pool.json');
const MAP_ITEM_NAMES = require('./fixtures/en/map-item-names.json');
const MAP_ITEM = require('./fixtures/en/map-item-lines.json');
const TRADE_STATS = require('./fixtures/en/trade-stats.json');

const {
  buildRegex,
  modMatchesPattern,
  matchModsByRegex,
  AFFIX_COUNT_ID,
  INFLUENCE_IDS,
  REGEX_MAX,
} = require('../trade-query.js');

const modKey = (mod) => mod.ids.join(',');

/** 값 자리를 지운 모양. 굴림 값이 달라도 같은 줄인지 알아보는 데 쓴다. */
const shapeOf = (line) =>
  line
    .replace(/\(-?\d+[—-]-?\d+\)/g, '#')
    .replace(/[+-]?\d+(?:\.\d+)?/g, '#')
    .replace(/#+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();

test('영문 목록은 한글 목록과 같은 모드를 같은 순서로 담는다', () => {
  /*
   * 두 목록은 같은 프리셋(모드 id로 저장된다)과 같은 검색 쿼리를 쓴다. 순서까지
   * 같아야 패널에서 언어를 바꿔도 목록이 그대로 보이고, 프리셋이 어긋나지 않는다.
   */
  assert.deepStrictEqual(
    MAP_MODS_EN.map(modKey),
    MAP_MODS_KO.map(modKey),
    '모드 id 목록이 어긋난다'
  );
  assert.deepStrictEqual(
    MAP_MODS_EN.map((m) => Boolean(m.rec)),
    MAP_MODS_KO.map((m) => Boolean(m.rec)),
    '흔히 거르는 모드(rec) 표시가 어긋난다'
  );

  // 분류도 같은 자리에서 갈려야 한다 — 이름만 영문이고 묶음은 같은 묶음이다.
  const groupIndex = (mods, groups) => mods.map((m) => groups.indexOf(m.group));
  const { MOD_GROUPS_KO } = require('../map-mods.js');
  assert.deepStrictEqual(
    groupIndex(MAP_MODS_EN, MOD_GROUPS_EN),
    groupIndex(MAP_MODS_KO, MOD_GROUPS_KO)
  );
  assert.ok(
    MOD_GROUPS_EN.every((g) => /^[\x20-\x7e]+$/.test(g)),
    '분류 이름이 영문이어야 한다'
  );
});

test('영문 문구는 모드 풀에 그대로 있다', () => {
  // 문구가 한 글자라도 다르면 그 모드는 인게임에서 영영 안 걸린다.
  const missing = [];
  for (const mod of MAP_MODS_EN) {
    for (const line of mod.text.split('\n')) {
      if (!MAP_MOD_POOL.some((entry) => entry.text.includes(line))) {
        missing.push(`${mod.affix}: ${line}`);
      }
    }
  }
  assert.deepStrictEqual(missing, []);
});

test('키워드는 목록 안에서 그 모드에만 걸린다', () => {
  const collisions = [];
  for (const target of MAP_MODS_EN) {
    const hits = MAP_MODS_EN.filter((m) => modMatchesPattern(target.regex, m));
    if (hits.length !== 1 || hits[0] !== target) {
      collisions.push(`${target.regex} (${target.affix}) → ${hits.map((m) => m.affix).join(', ')}`);
    }
  }
  assert.deepStrictEqual(collisions, []);
});

test('키워드는 목록 밖 모드에도 걸리지 않는다', () => {
  // 목록은 거를 만한 모드만 담는다. T16 지도에 붙는 나머지(타락·탐광)에 걸리면
  // 그 모드가 있는 지도까지 인게임에서 사라진다.
  const collisions = [];
  for (const target of MAP_MODS_EN) {
    for (const entry of MAP_MOD_POOL) {
      if (!modMatchesPattern(target.regex, entry)) continue;
      if (target.text.split('\n').some((line) => entry.text.includes(line))) continue;
      collisions.push(`${target.regex} (${target.affix}) → [${entry.source}] ${entry.text}`);
    }
  }
  assert.deepStrictEqual(collisions, []);
});

test('키워드는 지도 칸의 아이템 이름에도 걸리지 않는다', () => {
  const collisions = [];
  for (const target of MAP_MODS_EN) {
    for (const name of MAP_ITEM_NAMES) {
      if (modMatchesPattern(target.regex, { text: name })) {
        collisions.push(`${target.regex} (${target.affix}) → ${name}`);
      }
    }
  }
  assert.deepStrictEqual(collisions, []);
});

test('키워드는 고급 모드 설명 줄에도 걸리지 않는다', () => {
  /*
   * 고급 모드 설명을 켜면 모드마다 이런 줄이 앞에 붙고, 인게임 검색은 이 줄도 읽는다:
   *   { Suffix Modifier "of Venom" (Tier: 1) — Chaos, Ailment }
   * 등급이 없는 모드는 `(Tier: 1)` 없이 태그만 붙는다.
   */
  const scaffolding = ['— Unscalable Value', '{ Implicit Modifier }'];
  for (const entry of MAP_MOD_POOL) {
    if (!entry.name) continue;
    const word = entry.affix === 'prefix' ? 'Prefix' : 'Suffix';
    const head = `{ ${word} Modifier "${entry.name}"`;
    const tail = entry.tags.length ? ` — ${entry.tags.join(', ')} }` : ' }';
    scaffolding.push(`${head} (Tier: 1)${tail}`, `${head}${tail}`);
  }

  const collisions = [];
  for (const target of MAP_MODS_EN) {
    for (const line of scaffolding) {
      // 자기 이름이 든 줄에 걸리는 것은 상관없다.
      if (line.includes(`"${target.affix}"`)) continue;
      if (modMatchesPattern(target.regex, { text: line })) {
        collisions.push(`${target.regex} (${target.affix}) → ${line}`);
      }
    }
  }
  assert.deepStrictEqual(collisions, []);
});

test('키워드는 실제 지도의 모드 아닌 줄에 걸리지 않는다', () => {
  /*
   * 속성 줄(`Map Tier: 16`), 안내 줄(`Travel to this Map by using it in a personal
   * Map Device…`), 괄호 설명 줄(`(Maimed enemies have 30% reduced Movement Speed)`)
   * 까지 인게임 검색은 전부 읽는다. 한글판은 '상태'가 괄호 설명 줄에 걸려 엉뚱한
   * 지도가 사라진 적이 있다.
   *
   * 목록이 아는 모드 줄은 걸려도 되는 줄이므로 뺀다. 픽스처의 지도는 우리 데이터와
   * 다른 패치의 것이라 목록에 없는 모드 줄도 있는데, 그런 줄에 걸리는 것도 사고다
   * (그 모드가 붙은 지도까지 숨는다).
   */
  const known = new Set(MAP_MODS_EN.flatMap((m) => m.text.split('\n')).map(shapeOf));
  const lines = MAP_ITEM.text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== '--------')
    .filter((line) => !known.has(shapeOf(line.replace(/ — Unscalable Value.*$/, ''))));

  // 픽스처가 통째로 비어 버리면 이 검사는 아무것도 안 하게 된다.
  assert.ok(lines.length > 20, '검사할 줄이 남아 있어야 한다');

  const collisions = [];
  for (const target of MAP_MODS_EN) {
    for (const line of lines) {
      if (line.includes(`"${target.affix}"`)) continue;
      if (modMatchesPattern(target.regex, { text: line })) {
        collisions.push(`${target.regex} (${target.affix}) → ${line}`);
      }
    }
  }
  assert.deepStrictEqual(collisions, []);
});

test('여러 모드를 묶은 항목은 그 변종 전부에 걸린다', () => {
  // 값만 다른 같은 계열은 한 항목으로 묶여 있다. 키워드가 한쪽 변종의 문구만 집으면
  // 다른 변종이 붙은 지도가 필터를 그냥 통과한다.
  const missed = [];
  for (const mod of MAP_MODS_EN) {
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

test('모드 문구에 빠진 줄이 없다', () => {
  /*
   * 여러 줄짜리 모드에서 한 줄이 빠지면 두 군데가 조용히 망가진다 — 빠진 줄에
   * 걸리는 정규식이 그 모드를 못 찾고, 유일성 검사도 그 줄을 대조하지 못한다.
   * 그래서 목록이 아는 줄을 풀에서 지워 보고, 남는 조각을 센다.
   */
  const KNOWN_LINES = [...new Set(MAP_MODS_EN.flatMap((m) => m.text.split('\n')))].sort(
    (a, b) => b.length - a.length
  );

  // 목록이 일부러 담지 않는 줄. 전부 지도를 좋게 만드는 타락 옵션이라 거를 이유가 없다.
  const EXPECTED_UNKNOWN = [
    '% increased Experience gain',
    'Contains a Vaal Side Area',
    "Players' Vaal Skills do not apply Soul Gain Prevention",
    'Area has (1—5) additional random Scarab effects',
    'Area is affected by (5—15) additional random Unallocated Notable Atlas Passives',
    'Atlas Passives have (10—15)% increased Effect on Area',
  ];

  const unknown = [];
  for (const entry of MAP_MOD_POOL) {
    let rest = entry.text;
    for (const line of KNOWN_LINES) rest = rest.split(line).join(' ');
    for (const piece of rest.split(' ').map((s) => s.trim()).filter(Boolean)) {
      if (!EXPECTED_UNKNOWN.includes(piece)) unknown.push(`[${entry.source}] ${piece}`);
    }
  }
  assert.deepStrictEqual(unknown, []);
});

test('stat id가 거래소의 그 스탯을 가리킨다', () => {
  /*
   * id를 잘못 적으면 거래소는 걸러 주지 않는데 인게임 필터만 숨긴다. 그래서 id마다
   * 영문 문구를 적어 두고(fixtures/en/trade-stats.json) 짝이 맞는지 본다.
   *
   * 대조표는 거래소 문구(`#`가 든 틀)이고 목록은 아이템에 찍히는 문구라 다른 자리가
   * 있다. 확률이 100%면 아이템은 'have #% chance to'를 안 찍고, 값이 음수면 반대말로
   * 찍는다(increased↔reduced, more↔less). 그 자리를 맞춘 뒤 견준다.
   */
  const same = (s) =>
    shapeOf(s)
      .toLowerCase()
      // 거래소는 '+#%', 아이템은 굴린 값이라 '+40%' — 부호는 값의 일부로 본다.
      .replace(/[+-]#/g, '#')
      .replace(/ ?have (a )?#% chance to /, ' ')
      // 'an additional guarded … Vessel' ↔ '# additional guarded … Vessels'
      .replace(/\b(an|a)\b/g, '#')
      .replace(/increased|reduced/g, 'inc')
      .replace(/\bmore\b|\bless\b/g, 'mor')
      .replace(/s$/, '')
      .replace(/\s+/g, ' ')
      .trim();

  const problems = [];
  for (const mod of MAP_MODS_EN) {
    assert.deepStrictEqual([...new Set(mod.ids)], mod.ids, `${mod.affix}에 중복 id가 있다`);

    const lines = mod.text.split('\n');
    for (const id of mod.ids) {
      const trade = TRADE_STATS[id];
      if (trade === undefined) {
        // 대조표에 없는 id는 따로 적어 둔다(아래 검사에서 목록으로 확인한다).
        continue;
      }
      for (const t of trade.split('\n')) {
        if (!lines.some((l) => same(l) === same(t))) {
          problems.push(`${mod.affix}: ${id}\n    거래소: ${t}\n    목록  : ${lines.join(' / ')}`);
        }
      }
    }
  }
  assert.deepStrictEqual(problems, []);
});

test('대조표에 없는 id는 하나뿐이고 그 까닭이 적혀 있다', () => {
  /*
   * `explicit.stat_2609768284`(Area is inhabited by the Vaal)은 대조표를 뽑은
   * awakened-poe-trade 데이터에 없다. 문구는 poedb 영문 모드 풀에서 확인했다.
   * (data/en/README.md 참고) 이 검사는 '없는 id'가 더 늘지 않았는지만 본다.
   */
  const missing = MAP_MODS_EN.flatMap((m) => m.ids).filter((id) => TRADE_STATS[id] === undefined);
  assert.deepStrictEqual([...new Set(missing)], ['explicit.stat_2609768284']);
});

test('영향력 제외에 쓰는 id도 대조표에 있다', () => {
  for (const id of [AFFIX_COUNT_ID, ...INFLUENCE_IDS]) {
    assert.ok(TRADE_STATS[id] !== undefined, `대조표에 없는 id: ${id}`);
  }
});

test('모든 키워드가 인게임 문법으로 성하다', () => {
  for (const mod of MAP_MODS_EN) {
    const compiled = compileQuery(mod.regex);
    assert.deepStrictEqual(compiled.errors, [], `${mod.affix}의 키워드가 깨졌다: ${mod.regex}`);
  }
});

test('키워드에 굴림 값이 없고 여섯 자 이상이다', () => {
  /*
   * 숫자는 굴릴 때마다 바뀌므로 넣으면 그 값일 때만 걸린다. 길이는 희귀 지도의
   * 무작위 이름('Forsaken Bank') 때문이다 — 그 낱말 목록을 구할 수 없어 검사로
   * 막지 못하고, 짧을수록 걸릴 확률이 오른다.
   */
  const bad = MAP_MODS_EN.filter(
    (m) => /\d/.test(m.regex) || m.regex.replace(/[.*]/g, '').length < 6
  );
  assert.deepStrictEqual(bad.map((m) => `${m.regex} (${m.affix})`), []);
});

test('열두 개를 골라도 인게임 한도에 들어간다', () => {
  const twelve = MAP_MODS_EN.slice(0, 12);
  assert.ok(
    buildRegex(twelve).length < REGEX_MAX,
    `열두 개면 한도 안에 들어와야 한다 (${buildRegex(twelve).length}자)`
  );
});

test('만든 정규식을 되짚으면 고른 모드가 그대로 나온다', () => {
  const picked = MAP_MODS_EN.filter((m) => m.rec);
  const regex = buildRegex(picked);
  assert.ok(regex.startsWith('!'), '부정으로 시작해야 한다');

  const back = matchModsByRegex(regex, MAP_MODS_EN);
  assert.deepStrictEqual(back.unmatched, []);
  assert.deepStrictEqual(back.invalid, []);
  assert.deepStrictEqual(
    back.mods.map((m) => m.affix).sort(),
    picked.map((m) => m.affix).sort()
  );
});

test('모드를 모두 골라도 왕복이 어긋나지 않는다', () => {
  const back = matchModsByRegex(buildRegex(MAP_MODS_EN), MAP_MODS_EN);
  assert.deepStrictEqual(back.unmatched, []);
  assert.strictEqual(back.mods.length, MAP_MODS_EN.length);
});
