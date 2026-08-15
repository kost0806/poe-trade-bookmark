/**
 * 인게임 정규식 엔진 테스트.
 *
 *   node --test
 *
 * 러너는 노드에 들어 있는 것을 그대로 쓴다(node:test). 받아 올 것이 없으므로
 * 이 저장소에는 package.json도 node_modules도 없다.
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  splitTerms,
  parsePattern,
  compileQuery,
  compilePattern,
  matchesQuery,
  validateQuery,
  POE_QUERY_MAX,
} = require('../poe-regex.js');

/**
 * 실제 T16 지도를 Ctrl+C 한 문구. 거래소 extended.text와 같은 꼴이다.
 * 모드 줄만이 아니라 이름·속성 줄도 매칭 대상이라는 점이 여기서 중요하다.
 */
const MAP_ITEM = [
  '아이템 종류: 지도',
  '희귀도: 희귀',
  '비탄의 관문',
  '진홍색 사원 지도',
  '--------',
  '지도 등급: 16',
  '아이템 수량: +94% (강화됨)',
  '아이템 희귀도: +42% (강화됨)',
  '--------',
  '아이템 레벨: 83',
  '--------',
  '몬스터 피해 23% 증가',
  '플레이어의 재사용 대기시간 회복 속도 40% 감폭',
  '몬스터는 흡수 대상이 되지 않음',
  '지역에 다수의 토템 존재',
  '--------',
  '타락됨',
].join('\n');

test('항목 나누기 — 공백으로 나누고 !와 따옴표를 벗긴다', () => {
  assert.deepStrictEqual(splitTerms('터는 재사'), [
    { source: '터는', pattern: '터는', negated: false },
    { source: '재사', pattern: '재사', negated: false },
  ]);

  assert.deepStrictEqual(splitTerms('!터는'), [
    { source: '!터는', pattern: '터는', negated: true },
  ]);

  // 따옴표는 공백이 든 문구를 한 항목으로 묶기만 한다.
  assert.deepStrictEqual(splitTerms('"몬스터 피해"'), [
    { source: '"몬스터 피해"', pattern: '몬스터 피해', negated: false },
  ]);

  assert.deepStrictEqual(splitTerms('!"고유 보스"'), [
    { source: '!"고유 보스"', pattern: '고유 보스', negated: true },
  ]);
});

test('항목 나누기 — 알맹이가 빈 항목은 버린다', () => {
  assert.deepStrictEqual(splitTerms('   '), []);
  assert.deepStrictEqual(splitTerms('!'), []);
  assert.deepStrictEqual(splitTerms('""'), []);
});

test('항목은 모두 만족해야 한다 (AND)', () => {
  assert.strictEqual(matchesQuery('몬스터 플레이어', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('몬스터 없는말', MAP_ITEM), false);
});

test('! 는 그 항목만 뒤집는다', () => {
  assert.strictEqual(matchesQuery('!재사', MAP_ITEM), false);
  assert.strictEqual(matchesQuery('!원소', MAP_ITEM), true);
  // 하나는 있어야 하고 하나는 없어야 하는 섞인 검색
  assert.strictEqual(matchesQuery('몬스터 !원소', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('몬스터 !재사', MAP_ITEM), false);
});

test('부분 일치다 — 어디에 있든 걸린다', () => {
  assert.strictEqual(matchesQuery('재사', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('회복 속도', MAP_ITEM), true);
});

test('. 은 아무 글자 하나이되 줄바꿈은 넘지 않는다', () => {
  assert.strictEqual(matchesQuery('터.피해', MAP_ITEM), true);
  // '타락됨' 바로 앞 줄은 '지역에 다수의 토템 존재'다. 줄을 넘어 걸리면 안 된다.
  assert.strictEqual(matchesQuery('존재.타락', MAP_ITEM), false);
});

test('^ 와 $ 는 줄 단위로 걸린다', () => {
  assert.strictEqual(matchesQuery('^몬스터', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('^타락됨$', MAP_ITEM), true);
  // '지도'로 끝나는 줄은 '진홍색 사원 지도'가 있다.
  assert.strictEqual(matchesQuery('지도$', MAP_ITEM), true);
  // 첫 줄이 아닌 자리에 ^를 두면 안 걸린다.
  assert.strictEqual(matchesQuery('^흡수', MAP_ITEM), false);
});

test('| 는 나열, () 는 묶음', () => {
  assert.strictEqual(matchesQuery('없는말|재사', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('없는말|또없는말', MAP_ITEM), false);
  assert.strictEqual(matchesQuery('(재사|흡수)', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('몬스터(는|가) ', MAP_ITEM), true);
});

test('문자 클래스', () => {
  assert.strictEqual(matchesQuery('[0-9]+%', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('등급: 1[0-9]', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('등급: 1[0-5]', MAP_ITEM), false);
  assert.strictEqual(matchesQuery('[^0-9]수량', MAP_ITEM), true);
  // 대괄호 바로 뒤의 ']'는 닫는 괄호가 아니라 글자다.
  assert.strictEqual(parsePattern('[]]').type, 'class');
});

test('수량자 ? * + {n,m}', () => {
  assert.strictEqual(matchesQuery('피해 2?3%', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('등급.*16', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('몬스터.{1,3}피해', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('몬스터.{4,6}피해', MAP_ITEM), false);
  assert.strictEqual(matchesQuery('수량: \\+9+4', MAP_ITEM), true);
});

test('대소문자를 가리지 않는다', () => {
  const text = 'Crimson Temple Map\nItem Class: Maps';
  assert.strictEqual(matchesQuery('crimson', text), true);
  assert.strictEqual(matchesQuery('CRIMSON', text), true);
  assert.strictEqual(matchesQuery('[a-z]aps', text), true);
});

test('역슬래시는 메타문자를 글자로 만든다', () => {
  assert.strictEqual(matchesQuery('피해\\.', '피해.'), true);
  assert.strictEqual(matchesQuery('피해\\.', '피해가'), false);
  assert.strictEqual(matchesQuery('a\\|b', 'a|b'), true);
  assert.strictEqual(matchesQuery('a\\|b', 'ab'), false);
});

test('전방 탐색은 게임에서 되므로 그대로 받는다', () => {
  // poe.re가 '(?=(\S*r){2})' 꼴을 만들어 인게임에 그대로 붙여 넣게 한다.
  assert.strictEqual(validateQuery('(?=재사)').ok, true);
  assert.strictEqual(matchesQuery('몬스터(?=는)', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('몬스터(?=피해)', MAP_ITEM), false);
  // 부정 전방 탐색 — 지도 정규식에 흔한 '...rar..(?!ch)' 꼴이다.
  assert.strictEqual(matchesQuery('몬스터(?!는)', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('타락(?!됨)', MAP_ITEM), false);
  // 앞의 것을 먹지 않으므로 뒤에 다른 것이 이어붙는다.
  assert.strictEqual(matchesQuery('(?=.*피해)몬스터', MAP_ITEM), true);
});

test('축약 클래스는 게임에서 되므로 그대로 받는다', () => {
  // poe.re가 만드는 인게임 문자열에 '\d'가 쓰인다.
  assert.strictEqual(matchesQuery('등급: \\d\\d', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('피해 \\d+%', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('\\D등급', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('83\\s', MAP_ITEM), false);
  assert.strictEqual(matchesQuery('Map\\sTier', 'Map Tier: 16'), true);
  assert.strictEqual(matchesQuery('[\\d]6', MAP_ITEM), true);
});

test('(?:...)는 묶기만 하므로 그대로 받는다', () => {
  assert.strictEqual(validateQuery('(?:재사|흡수)').ok, true);
  assert.strictEqual(matchesQuery('(?:재사|흡수)', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('(?:없는말|또없는말)', MAP_ITEM), false);
  // 묶음이므로 수량자도 붙는다.
  assert.strictEqual(matchesQuery('몬스터(?:는|가)', MAP_ITEM), true);
});

test('게임에서 어떻게 되는지 모르는 문법은 빼 둔다', () => {
  // MSVC의 std::regex에는 후방 탐색 구현이 아예 없다.
  const behind = validateQuery('(?<=몬스터)피해');
  assert.strictEqual(behind.ok, false);
  assert.strictEqual(behind.unsupported.length, 1);
  // 역참조와 단어 경계는 통했다는 보고를 찾지 못했다.
  assert.strictEqual(validateQuery('(가)\\1').unsupported.length, 1);
  assert.strictEqual(validateQuery('\\b몬스터').unsupported.length, 1);
  // 뺀 항목은 매칭에 끼지 않는다 — 찍어서 맞추지 않는다.
  assert.strictEqual(matchesQuery('(?<=몬스터)없는말', MAP_ITEM), true);
});

test('깨진 문법은 자리와 함께 알려 준다', () => {
  for (const bad of ['[', '(재사', '재사)', 'a**', '*재사', '[z-a]', 'a{2,1}', '^*', '끝\\']) {
    const result = validateQuery(bad);
    assert.strictEqual(result.ok, false, `${bad} 는 오류여야 한다`);
    assert.strictEqual(typeof result.errors[0].message, 'string');
    assert.strictEqual(typeof result.errors[0].index, 'number');
  }
});

test('문법이 깨진 항목은 글자 그대로 찾는다', () => {
  // 게임은 정규식으로 읽기 전에 글자 그대로 먼저 찾아본다. '+16%'처럼 정규식으로는
  // 깨진 검색어가 게임에서 멀쩡히 걸리는 이유다.
  assert.strictEqual(matchesQuery('+94%', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('+없는값%', MAP_ITEM), false);

  const compiled = compileQuery('재사 [');
  assert.strictEqual(compiled.errors.length, 1);
  assert.strictEqual(compiled.errors[0].kind, 'syntax');
  // '['는 글자 그대로 찾으므로 이 아이템에는 없다 → 항목 AND가 깨진다.
  assert.strictEqual(compiled.test(MAP_ITEM), false);
  assert.strictEqual(compiled.test('재사 [대괄호]'), true);
});

test('글자 그대로 먼저 찾기가 정규식 매칭을 가리지 않는다', () => {
  // 둘 중 하나만 걸려도 된다. '터.피해'는 글자 그대로는 없지만 정규식으로는 걸린다.
  assert.strictEqual(matchesQuery('터.피해', MAP_ITEM), true);
});

test('빈 검색어는 모두 통과시킨다', () => {
  assert.strictEqual(matchesQuery('', MAP_ITEM), true);
  assert.strictEqual(matchesQuery('   ', MAP_ITEM), true);
});

test('길이 한도를 알려 준다', () => {
  const long = 'ㄱ'.repeat(POE_QUERY_MAX + 1);
  assert.strictEqual(validateQuery(long).tooLong, true);
  assert.strictEqual(validateQuery('재사').tooLong, false);
  assert.strictEqual(validateQuery('재사').length, 2);
});

test('한 줄짜리 문구에서는 자바스크립트 RegExp와 결과가 같다', () => {
  /*
   * 게임 엔진은 ECMAScript 문법이므로, 두 엔진이 갈리는 자리(여러 줄, 글자 그대로
   * 먼저 찾기)를 뺀 나머지는 RegExp와 답이 같아야 한다. 줄바꿈 없는 문구로 맞춰
   * 보면 그 자리를 피할 수 있다.
   */
  const texts = [
    '몬스터 피해 23% 증가',
    '아이템 수량: +94% (강화됨)',
    'Crimson Temple Map',
    'Sockets: R-G-B-R',
    '',
    '지도 등급: 16',
  ];
  const patterns = [
    '몬스터', '터.피해', '피해 \\d+%', '\\d\\d', '[0-9]+%', '[^0-9]수량',
    '^몬스터', '증가$', '(불|물)리', '몬스터(?:는|가)', '수량|등급',
    '가+', '가*나', '몬.{1,3}피해', '(?=.*피해)몬스터', '몬스터(?!피해)',
    '([rgb]-){2}', '(\\S*R){2}', 'map', 'MAP', '[a-z]+', '\\s+', '\\w+:',
    '지도 등급: 1[0-9]', 'x?y?z?', '(가|나|다){0,2}피해',
  ];

  const mismatches = [];
  for (const pattern of patterns) {
    const mine = compilePattern(pattern);
    const theirs = new RegExp(pattern, 'i');
    for (const text of texts) {
      // 글자 그대로 먼저 찾기는 RegExp에 없는 규칙이라 갈리는 경우를 뺀다.
      if (text.toLowerCase().includes(pattern.toLowerCase())) continue;
      if (mine.test(text) !== theirs.test(text)) {
        mismatches.push(`${pattern} vs ${JSON.stringify(text)}`);
      }
    }
  }
  assert.deepStrictEqual(mismatches, []);
});

test('되추적이 폭발하지 않는다', () => {
  // 겹치는 수량자는 되추적을 크게 늘린다. 인게임 한도(250자) 안의 패턴이라면
  // 눈에 띄는 멈춤 없이 끝나야 한다.
  const started = process.hrtime.bigint();
  assert.strictEqual(matchesQuery('(가+)+나', '가'.repeat(24)), false);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(ms < 1000, `너무 오래 걸렸다: ${ms}ms`);
});
