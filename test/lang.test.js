/**
 * 언어 고르기와 문구 테스트.
 *
 *   node --test
 *
 * 문구 표는 손으로 적는 것이라 한쪽에만 넣고 다른 쪽을 빠뜨리기 쉽다. 빠지면
 * 그 자리만 undefined로 뜨는데, 화면을 그 언어로 열어 보기 전에는 모른다.
 * 그래서 두 표의 열쇠와 모양이 같은지부터 본다.
 */

const test = require('node:test');
const assert = require('node:assert');

Object.assign(globalThis, require('../poe-regex.js'));
const lang = require('../lang.js');
Object.assign(globalThis, lang);

const { langForHost, resolveLang, TEXT, T, setLang, LANG_OPTIONS } = lang;

test('자동은 호스트로 언어를 정한다', () => {
  // 한국 서버
  assert.strictEqual(langForHost('poe.kakaogames.com'), 'ko');
  assert.strictEqual(langForHost('poe.game.daum.net'), 'ko');
  assert.strictEqual(langForHost('kr.pathofexile.com'), 'ko');

  // 나머지는 전부 영문 거래소다.
  assert.strictEqual(langForHost('www.pathofexile.com'), 'en');
  assert.strictEqual(langForHost('pathofexile.com'), 'en');
  assert.strictEqual(langForHost('jp.pathofexile.com'), 'en');
});

test('직접 고른 언어는 호스트를 이긴다', () => {
  assert.strictEqual(resolveLang('ko', 'www.pathofexile.com'), 'ko');
  assert.strictEqual(resolveLang('en', 'poe.kakaogames.com'), 'en');
  assert.strictEqual(resolveLang('auto', 'poe.kakaogames.com'), 'ko');
  // 모르는 값(옛 설정이 남았을 때)은 자동으로 본다.
  assert.strictEqual(resolveLang(undefined, 'www.pathofexile.com'), 'en');
  assert.strictEqual(resolveLang('zz', 'poe.kakaogames.com'), 'ko');
});

test('설정값은 세 가지뿐이다', () => {
  assert.deepStrictEqual(LANG_OPTIONS, ['auto', 'ko', 'en']);
});

test('두 문구 표는 같은 열쇠를 같은 모양으로 담는다', () => {
  const ko = Object.keys(TEXT.ko).sort();
  const en = Object.keys(TEXT.en).sort();
  assert.deepStrictEqual(en, ko, '한쪽에만 있는 문구가 있다');

  // 값이 드는 문구는 양쪽 다 함수여야 한다 — 한쪽만 함수면 부르는 자리가 깨진다.
  const shapes = [];
  for (const key of ko) {
    if (typeof TEXT.ko[key] !== typeof TEXT.en[key]) shapes.push(key);
    else if (typeof TEXT.ko[key] === 'function' && TEXT.ko[key].length !== TEXT.en[key].length) {
      shapes.push(`${key} (인자 수)`);
    }
  }
  assert.deepStrictEqual(shapes, []);
});

test('영문 문구에 한글이 섞이지 않는다', () => {
  const hangul = Object.entries(TEXT.en)
    // 값이 드는 문구는 자리를 채워 보고 확인한다.
    .map(([key, value]) => [key, typeof value === 'function' ? value(1, 2, 3) : value])
    .filter(([, value]) => /[가-힣]/.test(value))
    .map(([key]) => key);
  assert.deepStrictEqual(hangul, []);
});

test('언어를 바꾸면 문구가 함께 바뀐다', (t) => {
  t.after(() => setLang('ko'));

  setLang('ko');
  assert.strictEqual(T().done, '완료');

  setLang('en');
  assert.strictEqual(T().done, 'Done');

  // 모르는 값은 한글로 둔다.
  setLang('zz');
  assert.strictEqual(T().done, '완료');
});

test('정규식 오류 문구도 화면 언어를 따라간다', (t) => {
  t.after(() => setLang('ko'));

  // 후방 탐색은 게임이 받지 않는 문법이라 패널이 그대로 사용자에게 보여 준다.
  setLang('ko');
  assert.match(compileQuery('(?<=a)b').errors[0].message, /후방 탐색/);

  setLang('en');
  assert.match(compileQuery('(?<=a)b').errors[0].message, /lookbehind/);
});

test('요약 문구도 언어를 따라간다', (t) => {
  t.after(() => setLang('ko'));

  const { titleFromSummary } = require('../search-name.js');
  const summary = {
    item: '',
    filters: [],
    ranges: [],
    statGroups: [{ title: 'Not matching', rows: [{ label: 'a' }, { label: 'b' }] }],
  };

  setLang('ko');
  assert.strictEqual(titleFromSummary(summary), 'Not matching 2개');

  setLang('en');
  assert.strictEqual(titleFromSummary(summary), 'Not matching ×2');
});
