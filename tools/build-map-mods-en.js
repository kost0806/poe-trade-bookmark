/*
 * 영문 맵모드 목록(`map-mods-en.js`)을 만든다.
 *
 * 문구·이름은 `tools/build-en-data.js`가 뽑아 둔 `data/en/map-mods.json`에서 오고,
 * 여기서 새로 정하는 것은 **인게임 정규식 키워드**뿐이다. 키워드는 언어마다 다시
 * 골라야 한다 — 한글 키워드는 영문 클라이언트의 아이템 전문에 하나도 걸리지 않는다.
 *
 * 좋은 키워드의 조건은 하나다: **그 모드에만 걸릴 것.** 인게임 검색은 아이템 전문을
 * 통째로 훑기 때문에, 모드 문구만 놓고 고르면 다음 것들에 걸려 엉뚱한 지도가 사라진다.
 *
 *   - 목록 안의 다른 모드
 *   - 목록 밖 모드 (타락·탐광 등 T16 지도에 붙는 나머지)
 *   - 지도 칸의 아이템 이름 (갑충석·조각 …)
 *   - 고급 모드 설명 줄 — `{ Prefix Modifier "Burning" (Tier: 1) — Fire, Elemental }`
 *   - 속성 줄과 안내 줄 — `Map Tier: 16`, `Travel to this Map by using it in a …`
 *   - 괄호로 붙는 설명 줄 — `(Maimed enemies have 30% reduced Movement Speed)`
 *
 * 그래서 후보를 만들어 위 전부에 대고 떨어뜨린 뒤, 살아남은 것 중 가장 짧은 것을
 * 고른다. 맞춰 보는 일은 `poe-regex.js`가 한다 — 자바스크립트 RegExp로 맞추면
 * 게임에 없는 문법까지 통과시켜, 확장에서만 걸리는 키워드를 멀쩡한 것처럼 받아 준다.
 *
 * 실행: node tools/build-map-mods-en.js
 * 결과는 `test/map-mods-en.test.js`가 처음부터 다시 검사한다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

Object.assign(globalThis, require(path.join(ROOT, 'poe-regex.js')));
const { modMatchesPattern } = require(path.join(ROOT, 'trade-query.js'));

const { MAP_MODS_KO } = require(path.join(ROOT, 'map-mods.js'));
const EN = require(path.join(ROOT, 'data/en/map-mods.json'));
const POOL = require(path.join(ROOT, 'test/fixtures/en/map-mod-pool.json'));
const ITEM_NAMES = require(path.join(ROOT, 'test/fixtures/en/map-item-names.json'));
const ITEM = require(path.join(ROOT, 'test/fixtures/en/map-item-lines.json'));

/*
 * 키워드 길이의 최소값.
 *
 * 희귀 지도에는 무작위로 지은 이름이 붙는데('Forsaken Bank'), 그 낱말 목록을 구할 수
 * 없어 검사로 막지 못한다. 짧을수록 그런 이름에 걸릴 확률이 오르므로 길이로 막는다.
 * 한글판이 3글자를 쓰는 것과 같은 이유다(한글 3글자는 정보량이 영문 여섯 자에 가깝다).
 */
const MIN_LETTERS = 6;

/** 고급 모드 설명 줄. 등급이 없는 모드는 `(Tier: 1)` 없이 태그만 붙는다. */
function scaffolding() {
  const lines = ['— Unscalable Value', '{ Implicit Modifier }'];
  for (const entry of POOL) {
    if (!entry.name) continue;
    const word = entry.affix === 'prefix' ? 'Prefix' : 'Suffix';
    const head = `{ ${word} Modifier "${entry.name}"`;
    const tail = entry.tags.length ? ` — ${entry.tags.join(', ')} }` : ' }';
    lines.push(`${head} (Tier: 1)${tail}`, `${head}${tail}`);
  }
  return lines;
}

/** 값 자리를 지운 모양. 굴림 값이 달라도 같은 줄인지 알아보려고 쓴다. */
const shapeOf = (line) =>
  line
    .replace(/\(-?\d+[—-]-?\d+\)/g, '#')
    .replace(/[+-]?\d+(?:\.\d+)?/g, '#')
    .replace(/#+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * 지도 한 장의 전문에서 '걸리면 안 되는 줄'을 고른다.
 * 우리 목록이 아는 모드 줄은 걸려도 되는 줄이므로 뺀다.
 */
function itemNegatives(knownShapes) {
  return ITEM.text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== '--------')
    .filter((line) => !knownShapes.has(shapeOf(line.replace(/ — Unscalable Value.*$/, ''))));
}

/* ---------------- 후보 만들기 ---------------- */

const LETTERS = /^[A-Za-z][A-Za-z'’]*$/;

/**
 * 줄을 낱말과 '값 자리'로 나눈다.
 *
 * 굴림 값과 정규식 특수문자는 키워드에 넣을 수 없으므로 낱말이 아니라 빈자리(null)로
 * 남긴다. 빈자리를 사이에 두고 이어 붙이면 `have.*increased`가 된다.
 */
function tokens(line) {
  const out = [];
  for (const raw of line.split(/\s+/)) {
    const word = raw.replace(/^[^A-Za-z]+|[^A-Za-z'’]+$/g, '');
    out.push(word && LETTERS.test(word) ? word : null);
  }
  return out;
}

/** 이어진 낱말 묶음만 뽑는다(빈자리에서 끊는다). */
function words(line) {
  const runs = [];
  let run = [];
  for (const token of tokens(line)) {
    if (token) run.push(token);
    else {
      if (run.length) runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

const letterCount = (candidate) => candidate.replace(/[.*]/g, '').length;

/*
 * 기능어만으로 된 후보는 버린다.
 *
 * 'gain.an'은 검사를 통과하지만(지금 목록에 그런 줄이 하나뿐이라) 뜻을 담고 있지
 * 않아서, 모드가 하나 늘거나 문구가 조금 바뀌면 곧바로 남의 줄에 걸린다. 패널에
 * 그대로 보이는 값이기도 해서 읽어서 무슨 모드인지 알 수 있어야 한다.
 */
const STOP_WORDS = new Set(
  `a an the of to in on by as at for from with and or not no all any this that their they them
   have has had are is be been can cannot gain gains gained take takes taken deal deals
   more less increased reduced additional other than when while per`.split(/\s+/)
);

const meaningful = (candidate) =>
  candidate
    .split(/[.*]+/)
    .some((word) => word.length >= 4 && !STOP_WORDS.has(word.toLowerCase()));

/**
 * 후보를 짧은 것부터 내놓는다.
 *
 * 낱말 경계에 맞는 것을 먼저 쓴다 — 패널에 그대로 보이는 값이라 `Hexproof`가
 * `exproo`보다 읽기 좋다. 낱말로 안 되면 낱말 가운데를 잘라 쓴다(한글판도 그렇게 한다).
 */
function candidates(text) {
  const aligned = new Set();
  const bridged = new Set();
  const partial = new Set();

  for (const line of text.split('\n')) {
    /*
     * 값 자리를 건너뛰는 후보. 'Monsters have 100% increased Area of Effect'처럼
     * 구분되는 부분이 값 양쪽에 흩어져 있으면 이것 말고는 방법이 없다.
     * `.*`는 게임 엔진에서도 줄을 넘지 않으므로 두 모드에 걸쳐 걸릴 일은 없다.
     */
    const line_tokens = tokens(line);
    for (let i = 0; i < line_tokens.length; i++) {
      if (!line_tokens[i]) continue;
      let value = line_tokens[i];
      let gap = false;
      let bridgedAny = false;
      for (let j = i + 1; j < line_tokens.length && j < i + 5; j++) {
        const token = line_tokens[j];
        if (!token) {
          gap = true;
          continue;
        }
        value += gap ? `.*${token}` : `.${token}`;
        bridgedAny ||= gap;
        gap = false;
        // 값 자리를 한 번이라도 건너뛴 것만 여기 담는다(나머지는 aligned에 있다).
        if (bridgedAny && letterCount(value) >= MIN_LETTERS && meaningful(value)) bridged.add(value);
      }
    }

    for (const run of words(line)) {
      for (let i = 0; i < run.length; i++) {
        for (let n = 1; n <= 4 && i + n <= run.length; n++) {
          const value = run.slice(i, i + n).join('.');
          if (letterCount(value) >= MIN_LETTERS && meaningful(value)) aligned.add(value);
        }
      }

      // 낱말 가운데를 자른 것. 점(공백)으로 시작하거나 끝나지 않게 한다.
      const joined = run.join('.');
      for (let i = 0; i < joined.length; i++) {
        for (let n = MIN_LETTERS; i + n <= joined.length; n++) {
          const value = joined.slice(i, i + n);
          if (value.startsWith('.') || value.endsWith('.')) continue;
          if (letterCount(value) >= MIN_LETTERS && !aligned.has(value)) partial.add(value);
        }
      }
    }
  }

  const byLength = (a, b) => a.length - b.length || a.localeCompare(b);
  return [
    ...[...aligned].sort(byLength),
    ...[...bridged].sort(byLength),
    ...[...partial].sort(byLength),
  ];
}

/* ---------------- 고르기 ---------------- */

function main() {
  // 영문 모드 목록의 뼈대 — 한글 목록과 같은 순서·같은 id를 그대로 쓴다.
  const byIds = new Map(EN.mods.map((m) => [m.ids.join(','), m]));
  const groupEn = new Map(EN.groups.map((g) => [g.ko, g.en]));

  const mods = MAP_MODS_KO.map((ko) => {
    const en = byIds.get(ko.ids.join(','));
    if (!en) throw new Error(`영문 데이터에 없는 모드: ${ko.affix}`);
    return {
      ids: ko.ids,
      regex: '',
      group: groupEn.get(ko.group) ?? ko.group,
      affix: en.affix,
      ...(ko.rec ? { rec: true } : {}),
      text: en.text,
    };
  });

  const knownShapes = new Set(mods.flatMap((m) => m.text.split('\n')).map(shapeOf));
  const negatives = [...scaffolding(), ...ITEM_NAMES, ...itemNegatives(knownShapes)];

  // 한 모드를 여러 pool 항목이 나눠 갖기도 한다(값만 다른 같은 계열). 키워드는 그
  // 변종 전부에 걸려야 한다 — 하나만 보고 고르면 나머지가 필터를 그냥 통과한다.
  const variantsOf = (mod) => {
    const lines = mod.text.split('\n');
    return POOL.filter((entry) => lines.some((line) => entry.text.includes(line)));
  };

  const problems = [];
  for (const mod of mods) {
    const variants = variantsOf(mod);
    const others = mods.filter((m) => m !== mod);
    const poolOthers = POOL.filter((entry) => !variants.includes(entry));

    const ok = (value) =>
      modMatchesPattern(value, mod) &&
      variants.every((variant) => modMatchesPattern(value, variant)) &&
      !others.some((other) => modMatchesPattern(value, other)) &&
      !poolOthers.some((entry) => modMatchesPattern(value, entry)) &&
      !negatives.some((line) => modMatchesPattern(value, { text: line }));

    const pick = candidates(mod.text).find(ok);
    if (pick) mod.regex = pick;
    else problems.push(`키워드를 못 고른 모드: ${mod.affix} — ${mod.text.split('\n')[0]}`);
  }

  /* ---------------- 쓰기 ---------------- */

  const header = `/**
 * T16(top tier) 지도 모드 목록 — 영문 전용. 한글판은 \`map-mods.js\`.
 *
 * 두 목록은 같은 모드를 같은 순서로 담고, ids도 같다(\`test/map-mods-en.test.js\`가
 * 대조한다). 다른 것은 문구·접두어 이름·키워드뿐이다.
 *
 * 만든 방법:
 *  - 문구/이름: \`tools/build-en-data.js\` (poedb 영문 표 + awakened-poe-trade 대조)
 *  - 키워드:    \`tools/build-map-mods-en.js\` (그 모드에만 걸리는 최단 문자열)
 *
 * 손으로 고치지 말고 스크립트를 고쳐 다시 만든다. 키워드 하나를 바꾸면 다른 모드와
 * 겹치는지 전부 다시 봐야 하는데, 그 검사는 \`test/map-mods-en.test.js\`에 있다.
 *
 * regex 값은 '이 모드에만 매칭되는 부분문자열'이다. 공백은 .으로 쓰고(인게임에서
 * 공백은 항목을 나눈다), 굴림마다 바뀌는 숫자는 넣지 않는다.
 */
const MAP_MODS_EN = [
`;

  const body = mods
    .map((mod) => {
      const fields = [
        `ids: ${JSON.stringify(mod.ids)}`,
        `regex: ${JSON.stringify(mod.regex)}`,
        `group: ${JSON.stringify(mod.group)}`,
        `affix: ${JSON.stringify(mod.affix)}`,
        ...(mod.rec ? ['rec: true'] : []),
        `text: ${JSON.stringify(mod.text)}`,
      ];
      return `  { ${fields.join(', ')} },`;
    })
    .join('\n');

  const groups = [...new Set(mods.map((m) => m.group))];
  const footer = `
];

const MOD_GROUPS_EN = ${JSON.stringify(groups)};

// 브라우저에서는 <script>로 로드되고, 테스트에서는 require로 쓴다.
if (typeof module !== 'undefined') {
  module.exports = { MAP_MODS_EN, MOD_GROUPS_EN };
}
`;

  fs.writeFileSync(path.join(ROOT, 'map-mods-en.js'), header + body + footer);

  const lengths = mods.map((m) => m.regex.length);
  const twelve = mods.slice(0, 12).reduce((n, m) => n + m.regex.length + 1, 0);
  console.log(`모드 ${mods.length}개 — 키워드 평균 ${(lengths.reduce((a, b) => a + b, 0) / mods.length).toFixed(1)}자, 가장 긴 것 ${Math.max(...lengths)}자`);
  console.log(`열두 개를 고르면 정규식 ${twelve}자 (인게임 한도 ${POE_QUERY_MAX}자)`);
  if (problems.length) {
    console.log(`\n못 고른 것 ${problems.length}개:`);
    for (const p of problems) console.log('  -', p);
  }
}

main();
