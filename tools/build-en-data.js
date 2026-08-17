/*
 * 영문판 데이터를 만든다.
 *
 * 왜 이 스크립트가 필요한가
 * -------------------------
 * 지금 확장은 한글 전용이다. 맵모드 목록(`map-mods.js`)이 한글 문구를 그대로 들고
 * 있고, 인게임 정규식도 그 문구에서 잘라 낸 것이라 영문 클라이언트에서는 하나도
 * 걸리지 않는다. 영문판을 만들려면 같은 모드의 영문 문구가 필요하다.
 *
 * 사전을 지어내면 안 된다 — GGG가 쓰는 문구와 한 글자라도 다르면 인게임 검색이
 * 조용히 빗나간다. 그래서 두 언어를 함께 내놓는 출처만 쓰고, 서로 대조한다.
 *
 * 출처
 * ----
 * | 출처 | 무엇을 주는가 |
 * | --- | --- |
 * | poedb `Maps_top_tier` (kr/us) | 상위 등급 지도 모드 풀 — 접두어/접미어 이름, 태그, 모드 문구 |
 * | awakened-poe-trade `stats.ndjson` (ko/en) | 거래소 stat id ↔ 언어별 아이템 문구 |
 * | awakened-poe-trade `items.ndjson` (ko/en) | 아이템 이름의 한글 ↔ 영문 짝 |
 * | RePoE `base_items.json` | 지도 칸에 들어가는 아이템의 영문 이름 |
 *
 * poedb의 두 판은 같은 표를 언어만 바꿔 그린 것이라 항목 순서가 같다. 이 스크립트는
 * 한글판을 뽑아 committed 픽스처(`test/fixtures/map-mod-pool.json`)와 견주는 것으로
 * 그 가정을 매번 확인한다. 한 글자라도 어긋나면 영문판도 믿을 수 없다는 뜻이다.
 *
 * 왜 거래소 API를 직접 안 받는가
 * ------------------------------
 * 한글 데이터(`data/*.json`)는 거래소 API에서 직접 받은 것이다. 영문도 그게 제일
 * 좋지만 `https://www.pathofexile.com/api/trade/data/*`는 데이터센터 IP를 막는다
 * (HTTP 403, `{"error":{"code":6}}`). 직접 쓰는 컴퓨터에서 받아 두면 이 스크립트의
 * 결과와 대조할 수 있다 — `data/en/README.md`에 받는 법을 적어 두었다.
 *
 * 실행: node tools/build-en-data.js
 * 받은 원본은 tools/.cache/에 두고 다시 실행할 때 재사용한다(추적하지 않음).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, '.cache');

const APT = 'https://raw.githubusercontent.com/SnosMe/awakened-poe-trade/master/renderer/public/data';
const REPOE = 'https://raw.githubusercontent.com/lvlvllvlvllvlvl/RePoE/master/RePoE/data';

const SOURCES = {
  'poedb-kr.html': 'https://poedb.tw/kr/Maps_top_tier',
  'poedb-us.html': 'https://poedb.tw/us/Maps_top_tier',
  'apt-ko-stats.ndjson': `${APT}/ko/stats.ndjson`,
  'apt-en-stats.ndjson': `${APT}/en/stats.ndjson`,
  'apt-ko-items.ndjson': `${APT}/ko/items.ndjson`,
  'repoe-base-items.json': `${REPOE}/base_items.json`,
};

async function download() {
  fs.mkdirSync(CACHE, { recursive: true });
  for (const [file, url] of Object.entries(SOURCES)) {
    const target = path.join(CACHE, file);
    if (fs.existsSync(target)) continue;
    process.stdout.write(`받는 중 ${file} … `);
    const res = await fetch(url, { headers: { 'User-Agent': 'poe-trade-bookmark/en-data' } });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    console.log(`${fs.statSync(target).size.toLocaleString()} 바이트`);
  }
}

const readCache = (file) => fs.readFileSync(path.join(CACHE, file), 'utf8');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/* ---------------- poedb 모드 풀 ---------------- */

/** 페이지에 박혀 있는 `new ModsView({...})`의 인자를 잘라 낸다. */
function extractModsView(html) {
  const start = html.indexOf('new ModsView(') + 'new ModsView('.length;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  throw new Error('poedb 페이지에서 ModsView 데이터를 찾지 못했습니다');
}

// 지도마다 늘 붙는 수량·희귀도·무리 규모는 아이템에서 모드 줄이 아니라 속성 줄로
// 찍힌다. 모드 풀에 두면 키워드 검사가 엉뚱한 줄에 걸린다.
const ATTRIBUTE_LINE =
  /Quantity of Items|Rarity of Items|increased Pack size|아이템 수량|아이템 희귀도|무리 규모/;

/** 모드 한 칸의 HTML → 줄 목록. `secondary`(내부 스탯 이름)는 버린다. */
function modLines(str) {
  return str
    .split('<br>')
    .filter((line) => !line.includes('class="secondary"'))
    .map((line) =>
      line
        .replace(/<span class="ndash">—<\/span>/g, '—')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
    )
    .filter((line) => line && !ATTRIBUTE_LINE.test(line));
}

const AFFIX = { 1: 'prefix', 2: 'suffix' };

function pool(html, sources) {
  const data = extractModsView(html);
  const out = [];
  for (const [key, label] of Object.entries(sources)) {
    for (const mod of data[key] ?? []) {
      const lines = modLines(mod.str);
      if (!lines.length) continue;
      out.push({
        source: label,
        affix: AFFIX[mod.ModGenerationTypeID] ?? 'other',
        // 타락 모드에는 접두어/접미어 이름이 없다(내부 이름만 있다).
        name: AFFIX[mod.ModGenerationTypeID] ? mod.Name : '',
        // 고급 모드 설명 줄 끝에 붙는 태그. 뱃지 HTML로 들어 있다.
        tags: (mod.mod_no ?? []).map((badge) => badge.replace(/<[^>]+>/g, '').trim()),
        family: mod.ModFamilyList?.[0] ?? '',
        text: lines.join('\n'),
      });
    }
  }
  return out;
}

/* ---------------- APT stats ---------------- */

/** 거래소 stat id → { ref, matchers } */
function statsById(ndjson) {
  const byId = new Map();
  for (const line of ndjson.split('\n')) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    for (const list of Object.values(entry.trade?.ids ?? {})) {
      for (const id of list) if (!byId.has(id)) byId.set(id, entry);
    }
  }
  return byId;
}

// 아이템에 찍히는 값 자리: 맵모드 표기 "(22—25)"와 굴린 값 "40", 부호 포함.
const VALUE_RE = /[+-]?\((?:-?\d+)(?:—|-)(?:-?\d+)\)|[+-]?\d+(?:\.\d+)?/g;

/** 값 자리를 #로 바꾼 모양. APT의 matchers가 이 모양으로 적혀 있다. */
const shapeOf = (text) => text.replace(VALUE_RE, '#');

/* ---------------- 만들기 ---------------- */

function main() {
  const krPool = pool(readCache('poedb-kr.html'), { normal: 'Base', corrupted: '타락', delve: '탐광' });
  const enPool = pool(readCache('poedb-us.html'), {
    normal: 'Base',
    corrupted: 'Corrupted',
    delve: 'Delve',
  });

  const problems = [];
  const check = (ok, message) => {
    if (!ok) problems.push(message);
  };

  /* 1. 한글판이 committed 픽스처와 같은지 — 뽑는 방식이 그대로인지 본다. */
  const fixture = readJson(path.join(ROOT, 'test/fixtures/map-mod-pool.json'));
  const stripDash = (name) => name.replace(/^-\s*/, '');
  const krByText = new Map(krPool.map((m) => [m.text.replace(/\n/g, ''), m]));
  let sameAsFixture = 0;
  for (const f of fixture) {
    const mine = krByText.get(f.text);
    const same =
      mine &&
      mine.source === f.source &&
      mine.affix === f.affix &&
      stripDash(mine.name) === f.name &&
      JSON.stringify(mine.tags) === JSON.stringify(f.tags);
    if (same) sameAsFixture++;
    else problems.push(`픽스처와 다른 모드: ${f.name || '(이름 없음)'} — ${f.text}`);
  }
  console.log(`모드 풀: poedb kr ${krPool.length}개 / us ${enPool.length}개, 픽스처와 일치 ${sameAsFixture}/${fixture.length}`);

  /* 2. 두 판의 항목이 같은 순서인지 — 모드 계열(family)로 확인한다. */
  check(krPool.length === enPool.length, `두 판의 모드 수가 다릅니다 (${krPool.length}/${enPool.length})`);
  for (let i = 0; i < Math.min(krPool.length, enPool.length); i++) {
    check(
      krPool[i].family === enPool[i].family,
      `${i}번째 모드가 어긋납니다: ${krPool[i].family} vs ${enPool[i].family}`
    );
  }

  /* 3. 한글 문구 한 줄 → 영문 한 줄 */
  const lineKrToEn = new Map();
  const nameKrToEn = new Map();
  for (let i = 0; i < krPool.length; i++) {
    const kr = krPool[i].text.split('\n');
    const en = enPool[i].text.split('\n');
    if (kr.length !== en.length) {
      problems.push(`줄 수가 다른 모드: ${krPool[i].family}`);
      continue;
    }
    for (let j = 0; j < kr.length; j++) lineKrToEn.set(kr[j], en[j]);
    if (krPool[i].name) nameKrToEn.set(stripDash(krPool[i].name), enPool[i].name);
  }

  /*
   * poedb는 한 스탯이 두 줄짜리일 때 두 줄을 붙여 놓는다(줄 사이에 <br>이 없다).
   * 그런 줄은 APT에서 가져온다 — 변형이 하나뿐인 스탯만 쓰므로 짝이 어긋날 수 없다.
   */
  const koStats = statsById(readCache('apt-ko-stats.ndjson'));
  const enStats = statsById(readCache('apt-en-stats.ndjson'));
  for (const [id, ko] of koStats) {
    const en = enStats.get(id);
    if (!en || ko.matchers.length !== 1 || en.matchers.length !== 1) continue;
    const koLines = ko.matchers[0].string.split('\n');
    const enLines = en.matchers[0].string.split('\n');
    if (koLines.length !== enLines.length || koLines.length === 1) continue;
    for (let i = 0; i < koLines.length; i++) {
      if (!lineKrToEn.has(koLines[i])) lineKrToEn.set(koLines[i], enLines[i]);
    }
  }

  /* 4. map-mods.js를 영문으로 옮긴다. */
  const { MAP_MODS, MOD_GROUPS } = require(path.join(ROOT, 'map-mods.js'));
  const mods = [];
  for (const mod of MAP_MODS) {
    const lines = [];
    for (const line of mod.text.split('\n')) {
      // 굴림 값이 든 줄은 값 자리를 지운 모양으로도 찾아본다.
      const en = lineKrToEn.get(line) ?? lineKrToEn.get(shapeOf(line));
      if (!en) problems.push(`영문 문구를 못 찾은 줄 [${mod.affix}] ${line}`);
      lines.push(en ?? line);
    }

    // 접두어/접미어 이름. 타락 모드는 이름이 없어 한글 파일도 내부 이름을 쓰고 있고,
    // 내부 이름은 언어와 무관하므로 그대로 둔다.
    const krName = stripDash(mod.affix);
    const enName = nameKrToEn.get(krName) ?? mod.affix;
    if (enName === mod.affix && !/^Map[A-Z]/.test(mod.affix)) {
      problems.push(`영문 이름을 못 찾은 모드: ${mod.affix}`);
    }

    /*
     * 대조: 뽑아낸 영문 줄이 정말 그 stat id의 문구인지 APT로 확인한다.
     * matchers의 자리(index)는 언어마다 순서가 달라 믿을 수 없다
     * (예: 'of Transience'는 ko가 [느리게, 빠르게], en이 [faster, slower] 순이다).
     * 그래서 '그 id의 변형들 중 하나와 모양이 같은가'만 본다.
     */
    const shapes = new Set();
    for (const id of mod.ids) {
      for (const m of enStats.get(id)?.matchers ?? []) {
        for (const line of m.string.split('\n')) shapes.add(shapeOf(line));
      }
    }
    const checked = [];
    for (const line of lines) {
      if (!shapes.size) continue; // APT에 없는 id (아래 미확인 목록에 남는다)
      if (shapes.has(shapeOf(line))) checked.push(line);
      else problems.push(`APT의 어느 변형과도 안 맞는 줄 [${mod.affix}] ${line}`);
    }

    mods.push({
      ids: mod.ids,
      group: mod.group,
      affix: enName,
      affixKo: mod.affix,
      text: lines.join('\n'),
      textKo: mod.text,
      verified: checked.length === lines.length,
    });
  }
  const verified = mods.filter((m) => m.verified).length;
  console.log(`맵모드: ${mods.length}개 옮김, 그중 APT로도 확인된 것 ${verified}개`);

  /* 5. stat id → 영문 문구 대조표 (한글 test/fixtures/trade-stats.json의 짝) */
  const { INFLUENCE_IDS, AFFIX_COUNT_ID } = (() => {
    global.POE_QUERY_MAX = 250;
    Object.assign(global, require(path.join(ROOT, 'poe-regex.js')));
    return require(path.join(ROOT, 'trade-query.js'));
  })();
  const ids = new Set([...MAP_MODS.flatMap((m) => m.ids), ...INFLUENCE_IDS, AFFIX_COUNT_ID]);
  const statText = {};
  const missingIds = [];
  for (const id of [...ids].sort()) {
    const entry = enStats.get(id);
    if (entry) statText[id] = entry.ref;
    else missingIds.push(id);
  }
  console.log(`stat 대조표: ${Object.keys(statText).length}개, APT에 없는 id ${missingIds.length}개 ${missingIds.join(', ')}`);

  /* 6. 지도 칸 아이템의 영문 이름 */
  const baseItems = readJson(path.join(CACHE, 'repoe-base-items.json'));
  // 거래소가 '지도'로 묶는 것들: 지도·조각·갑충석(MapFragment)·아틀라스 상급 아이템·보관실 열쇠
  const MAP_CLASSES = new Set(['Map', 'MapFragment', 'AtlasUpgradeItem', 'VaultKey']);
  const itemNames = new Set();
  for (const item of Object.values(baseItems)) {
    if (MAP_CLASSES.has(item.item_class) && item.name) itemNames.add(item.name);
  }
  // 한국 거래소의 '지도' 분류에 있는 이름도 영문으로 옮겨 보탠다(RePoE가 놓친 신규 아이템).
  const koItems = new Map();
  for (const line of readCache('apt-ko-items.ndjson').split('\n')) {
    if (!line.trim()) continue;
    const item = JSON.parse(line);
    if (!koItems.has(item.name)) koItems.set(item.name, item.refName);
  }
  const krItems = readJson(path.join(ROOT, 'data/search-items.json')).result;
  const krMapGroup = krItems.find((group) => group.label === '지도');
  let fromTrade = 0;
  for (const entry of krMapGroup?.entries ?? []) {
    const en = entry.type && koItems.get(entry.type);
    if (en && !itemNames.has(en)) {
      itemNames.add(en);
      fromTrade++;
    }
  }
  console.log(`지도 칸 아이템 이름: ${itemNames.size}개 (RePoE ${itemNames.size - fromTrade} + 거래소 목록에서 ${fromTrade})`);

  /* 7. 쓰기 */
  const write = (rel, value) => {
    const file = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
    console.log(`  썼음 ${rel}`);
  };

  write('data/en/map-mods.json', {
    // 분류 이름은 GGG 데이터가 아니라 이 확장이 붙인 것이다.
    groups: MOD_GROUPS.map((ko) => ({ ko, en: GROUP_EN[ko] ?? ko })),
    mods,
  });
  write('test/fixtures/en/map-mod-pool.json', enPool.map(({ family, ...rest }) => rest));
  write('test/fixtures/en/trade-stats.json', statText);
  write('test/fixtures/en/map-item-names.json', [...itemNames].sort());

  if (problems.length) {
    console.log(`\n확인이 필요한 것 ${problems.length}건:`);
    for (const p of problems) console.log('  -', p);
  } else {
    console.log('\n어긋난 곳 없음.');
  }
}

// 패널 분류의 영문 라벨. GGG 문구가 아니라 이 확장이 모드를 묶어 부르는 이름이다.
const GROUP_EN = {
  기타: 'Misc',
  '몬스터 강화': 'Monster buffs',
  '방어 약화': 'Defence debuffs',
  '보스 강화': 'Boss buffs',
  '지역 구성': 'Area composition',
  '피해 반사': 'Damage reflection',
  '회복 방해': 'Recovery denial',
};

download().then(main);
