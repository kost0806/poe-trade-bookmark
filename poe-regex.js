/**
 * 인게임 검색창의 정규식 엔진.
 *
 * 자바스크립트의 RegExp를 쓰지 않고 패턴을 직접 해석한다. 게임의 엔진과 규칙이
 * 다른 자리가 있어서, RegExp로 맞추면 확장이 "걸린다"고 표시한 지도가 정작
 * 인게임 필터에서는 안 걸리는 어긋남이 생기기 때문이다. 다른 자리는 세 곳이다 —
 * 줄 단위 매칭, 글자 그대로 먼저 찾기, 그리고 받지 않는 문법.
 *
 * 대상은 창고·소지품·판매상·지도 장치의 검색칸이다. 매칭 대상 문구는 아이템을
 * Ctrl+C 했을 때 나오는 전문이고, 거래소 API의 extended.text와 같은 값이다
 * (background.js 참고). 그래서 아이템 이름과 '아이템 종류: 지도' 같은 속성 줄도
 * 매칭 대상에 들어간다 — 모드 문구만 놓고 맞춰 보면 안 된다.
 *
 * 게임이 쓰는 엔진은 MSVC의 std::regex(ECMAScript 문법)다. 검색칸에서 곧바로 튀어
 * 나온 예외 대화상자의 문구가 microsoft/STL의 것과 한 글자도 다르지 않다
 * ('regex_error(error_complexity)', https://www.pathofexile.com/forum/view-thread/3195613).
 * 그래서 전방 탐색은 되고 후방 탐색은 안 되며, 되추적이 터지는 패턴은 게임을
 * 멈춘다. 여기서 문법을 정할 때의 근거가 대체로 이것이다.
 *
 * 가장 중요한 규칙: 인게임 엔진은 언제나 한 줄씩 맞춘다. 여러 줄을 한 덩어리로
 * 보지 않으므로 '.'은 줄바꿈을 넘지 못하고 '^'와 '$'는 줄마다 걸린다. 그래서 한
 * 패턴이 서로 다른 두 모드 줄에 걸쳐 매칭되는 일이 없다. (C++11의 std::regex에는
 * 여러 줄 모드가 아예 없어서, GGG가 줄을 따로 넣어 주는 것으로 보인다.)
 *   https://www.pathofexile.com/forum/view-thread/3305826
 *   ("The regex engine always performs a single line match ... (?m) doesn't do anything")
 */

// 인게임 검색창 입력 한도
const POE_QUERY_MAX = 250;

/* ---------------- 질의 수준: 항목 나누기 ---------------- */

/**
 * 검색어를 항목으로 나눈다.
 *
 * 인게임 검색은 공백으로 항목을 나누고 항목을 모두 만족하는 아이템만 남긴다
 * (AND). 항목 앞의 '!'는 그 항목만 뒤집고, "따옴표"는 공백이 든 문구를 한 항목으로
 * 묶는다. 따옴표는 묶는 역할만 하고 안쪽 문법은 그대로 살아 있다.
 *
 * 돌려주는 각 항목: { source, pattern, negated }
 *  - source  사용자가 친 원문 (오류 표시에 그대로 쓴다)
 *  - pattern 따옴표와 '!'를 벗긴 알맹이
 *  - negated '!'가 붙어 있었는지
 */
function splitTerms(query) {
  const terms = [];
  let cur = '';
  let raw = '';
  let quoted = false;

  const flush = () => {
    if (!raw) return;
    let pattern = cur;
    let negated = false;
    if (pattern.startsWith('!')) {
      negated = true;
      pattern = pattern.slice(1);
    }
    terms.push({ source: raw, pattern, negated });
    cur = '';
    raw = '';
  };

  for (const ch of query) {
    if (ch === '"') {
      quoted = !quoted;
      raw += ch;
      continue;
    }
    if (!quoted && /\s/.test(ch)) {
      flush();
      continue;
    }
    cur += ch;
    raw += ch;
  }
  flush();

  // 알맹이가 빈 항목('!'만 치거나 따옴표만 연 경우)은 거를 것이 없다.
  return terms.filter((t) => t.pattern !== '');
}

/**
 * 패턴을 최상위 '|'에서만 나눈다.
 *
 * 검색 자체에는 필요 없지만, "이 정규식이 어느 모드를 가리키나"를 되짚을 때
 * 쓴다(trade-query.js). 괄호 그룹 안('대치.-(9|1[0-2])%')이나 문자 클래스,
 * 이스케이프된 '\|' 속의 '|'는 나열이 아니므로 지나친다.
 */
function splitAlternatives(pattern) {
  const parts = [];
  let depth = 0;
  let inClass = false;
  let cur = '';

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') {
      cur += ch + (pattern[i + 1] ?? '');
      i++;
      continue;
    }
    if (inClass) {
      cur += ch;
      if (ch === ']') inClass = false;
      continue;
    }
    if (ch === '[') inClass = true;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === '|' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);

  return parts.filter(Boolean);
}

/* ---------------- 패턴 수준: 파서 ---------------- */

/*
 * 만드는 마디는 다음뿐이다. 이 목록에 없는 문법은 오류로 돌려준다.
 *   { type: 'empty' }
 *   { type: 'char', ch }              한 글자 (대소문자는 접어서 비교)
 *   { type: 'any' }                   .
 *   { type: 'class', negated, ranges } [가-힣], [^abc]
 *   { type: 'seq', items }            이어 붙이기
 *   { type: 'alt', options }          |
 *   { type: 'repeat', node, min, max } ? * + {n,m}
 *   { type: 'start' } / { type: 'end' } ^ $
 */

/**
 * 패턴을 해석하지 못했을 때. 어디서 왜 막혔는지 함께 알린다.
 *
 * kind가 둘인 이유는 게임의 대응이 다르기 때문이다.
 *  - 'syntax'      문법이 깨진 패턴. 게임은 이런 패턴을 글자 그대로 찾으므로
 *                  여기서도 그렇게 한다(compileQuery 참고). 오류가 아니라 안내다.
 *  - 'unsupported' 게임에서 어떻게 되는지 알 수 없는 문법. 찍지 않고 물러선다.
 */
class PoeRegexError extends Error {
  constructor(message, index, kind = 'syntax') {
    super(message);
    this.name = 'PoeRegexError';
    this.index = index;
    this.kind = kind;
  }
}

/*
 * 축약 클래스. poe.re가 만들어 인게임에 그대로 붙여 넣는 문자열에 '\d'가 쓰이므로
 * 게임이 받아 준다는 것이 확인된다(veiset/poe-vendor-string의 OutputString.ts).
 * ECMAScript 문법이니 나머지도 함께 있다.
 */
const DIGIT_RANGES = [['0', '9']];
const WORD_RANGES = [['a', 'z'], ['A', 'Z'], ['0', '9'], ['_', '_']];
// 줄바꿈은 어차피 어떤 명령으로도 먹지 않는다(consumes 참고).
const SPACE_RANGES = [[' ', ' '], ['\t', '\t'], ['\r', '\r'], ['\f', '\f'], ['\v', '\v']];

const SHORTHAND = {
  d: { negated: false, ranges: DIGIT_RANGES },
  D: { negated: true, ranges: DIGIT_RANGES },
  w: { negated: false, ranges: WORD_RANGES },
  W: { negated: true, ranges: WORD_RANGES },
  s: { negated: false, ranges: SPACE_RANGES },
  S: { negated: true, ranges: SPACE_RANGES },
};

function parsePattern(src) {
  let i = 0;

  const fail = (message, kind = 'syntax') => {
    throw new PoeRegexError(message, i, kind);
  };

  const peek = () => src[i];
  const eof = () => i >= src.length;

  // alt := seq ('|' seq)*
  function parseAlt() {
    const options = [parseSeq()];
    while (!eof() && peek() === '|') {
      i++;
      options.push(parseSeq());
    }
    return options.length === 1 ? options[0] : { type: 'alt', options };
  }

  // seq := repeat*
  function parseSeq() {
    const items = [];
    while (!eof() && peek() !== '|' && peek() !== ')') {
      items.push(parseRepeat());
    }
    if (!items.length) return { type: 'empty' };
    return items.length === 1 ? items[0] : { type: 'seq', items };
  }

  // repeat := atom quantifier?
  function parseRepeat() {
    const start = i;
    const node = parseAtom();
    if (eof()) return node;

    const ch = peek();
    let min;
    let max;
    if (ch === '?') {
      min = 0;
      max = 1;
    } else if (ch === '*') {
      min = 0;
      max = Infinity;
    } else if (ch === '+') {
      min = 1;
      max = Infinity;
    } else if (ch === '{') {
      const brace = parseBrace();
      if (!brace) return node; // '{'가 수량자꼴이 아니면 그냥 글자다
      ({ min, max } = brace);
      return wrapRepeat(node, min, max, start);
    } else {
      return node;
    }
    i++;
    return wrapRepeat(node, min, max, start);
  }

  function wrapRepeat(node, min, max, start) {
    // 앵커에 수량자를 붙이면 뜻이 없다. 실수일 가능성이 높으니 알려 준다.
    if (node.type === 'start' || node.type === 'end') {
      i = start;
      fail('앵커(^, $)에는 수량자를 붙일 수 없습니다');
    }
    // 겹쳐 쓴 수량자('a**')는 게임에서도 오류다.
    if (!eof() && '?*+'.includes(peek())) {
      fail('수량자를 겹쳐 쓸 수 없습니다');
    }
    return { type: 'repeat', node, min, max };
  }

  /** '{2,4}' 꼴이면 {min,max}, 아니면 null(그냥 여는 중괄호 글자). */
  function parseBrace() {
    const save = i;
    i++; // '{'
    const digits = /[0-9]/;
    let lo = '';
    while (!eof() && digits.test(peek())) lo += src[i++];
    if (!lo) {
      i = save;
      return null;
    }
    let hi = lo;
    if (!eof() && peek() === ',') {
      i++;
      hi = '';
      while (!eof() && digits.test(peek())) hi += src[i++];
      if (!hi) hi = String(Infinity);
    }
    if (eof() || peek() !== '}') {
      i = save;
      return null;
    }
    i++; // '}'
    const min = Number(lo);
    const max = hi === String(Infinity) ? Infinity : Number(hi);
    if (max < min) fail('수량자의 최대가 최소보다 작습니다');
    return { min, max };
  }

  // atom := '(' alt ')' | '[' class ']' | '.' | '^' | '$' | escape | char
  function parseAtom() {
    const ch = src[i];

    if (ch === '(') {
      if (src[i + 1] === '?') {
        const kind = src[i + 2];

        /*
         * 전방 탐색은 게임에서 된다. poe.re가 '(?=(\S*r){2})' 꼴을 만들어 인게임에
         * 그대로 붙여 넣게 하고, 지도용으로 흔히 도는 '...rar..(?!ch)'도 같은 꼴이다.
         *
         * 후방 탐색은 막는다. MSVC의 std::regex에는 구현이 아예 없다.
         */
        if (kind === '=' || kind === '!') {
          i += 3;
          const inner = parseAlt();
          if (eof() || peek() !== ')') fail('닫는 괄호가 없습니다');
          i++;
          return { type: 'look', negated: kind === '!', node: inner };
        }
        if (kind === '<') {
          fail('후방 탐색은 인게임 검색에서 쓸 수 없습니다', 'unsupported');
        }
        // '(?:'는 묶기만 하고 매칭 결과를 바꾸지 않는다.
        if (kind === ':') {
          i += 3;
          const inner = parseAlt();
          if (eof() || peek() !== ')') fail('닫는 괄호가 없습니다');
          i++;
          return inner;
        }
        fail(`(?${kind ?? ''} 꼴은 인게임 검색에서 쓸 수 없습니다`, 'unsupported');
      }
      i++;
      const inner = parseAlt();
      if (eof() || peek() !== ')') fail('닫는 괄호가 없습니다');
      i++;
      return inner;
    }
    if (ch === ')') fail('여는 괄호가 없습니다');
    if (ch === '[') return parseClass();
    if (ch === ']') fail('여는 대괄호가 없습니다');
    if (ch === '.') {
      i++;
      return { type: 'any' };
    }
    if (ch === '^') {
      i++;
      return { type: 'start' };
    }
    if (ch === '$') {
      i++;
      return { type: 'end' };
    }
    if (ch === '*' || ch === '+' || ch === '?') {
      fail('수량자 앞에 글자가 없습니다');
    }
    if (ch === '\\') {
      i++;
      if (eof()) fail('역슬래시로 끝났습니다');
      const esc = src[i];

      if (SHORTHAND[esc]) {
        i++;
        return { type: 'class', ...SHORTHAND[esc] };
      }
      /*
       * 역참조와 단어 경계는 게임에서 어떻게 되는지 알 수 없다. 문법상 있어야
       * 맞지만 실제로 통했다는 보고를 찾지 못했다. 조용히 다른 결과를 내느니
       * 막는다 — 지도 정규식에서 둘 다 쓸 일이 없다.
       */
      if (/[0-9]/.test(esc)) fail('역참조는 인게임 검색에서 쓸 수 없습니다', 'unsupported');
      if (esc === 'b' || esc === 'B') {
        fail('\\b(단어 경계)는 인게임 검색에서 쓸 수 없습니다', 'unsupported');
      }
      if (/[A-Za-z]/.test(esc)) fail(`\\${esc}는 모르는 이스케이프입니다`, 'unsupported');
      i++;
      return { type: 'char', ch: esc };
    }
    i++;
    return { type: 'char', ch };
  }

  function parseClass() {
    i++; // '['
    const ranges = [];
    let negated = false;
    if (!eof() && peek() === '^') {
      negated = true;
      i++;
    }
    // 바로 뒤의 ']'는 닫는 괄호가 아니라 글자다.
    let first = true;
    while (!eof() && (peek() !== ']' || first)) {
      first = false;
      let lo = src[i++];
      if (lo === '\\') {
        if (eof()) fail('역슬래시로 끝났습니다');
        // '[\d.]'처럼 클래스 안에 든 축약 클래스는 범위를 그대로 합친다.
        const shorthand = SHORTHAND[src[i]];
        if (shorthand) {
          if (shorthand.negated) {
            fail(`클래스 안에는 \\${src[i]}를 넣을 수 없습니다`, 'unsupported');
          }
          ranges.push(...shorthand.ranges);
          i++;
          continue;
        }
        lo = src[i++];
      }
      let hi = lo;
      if (!eof() && peek() === '-' && src[i + 1] !== undefined && src[i + 1] !== ']') {
        i++;
        hi = src[i++];
        if (hi === '\\') {
          if (eof()) fail('역슬래시로 끝났습니다');
          hi = src[i++];
        }
        if (hi.codePointAt(0) < lo.codePointAt(0)) fail('문자 범위가 거꾸로입니다');
      }
      ranges.push([lo, hi]);
    }
    if (eof()) fail('닫는 대괄호가 없습니다');
    i++; // ']'
    if (!ranges.length) fail('문자 클래스가 비어 있습니다');
    return { type: 'class', negated, ranges };
  }

  const node = parseAlt();
  // parseSeq는 ')'에서 멈춘다. 여기까지 남아 있다면 짝이 없는 닫는 괄호다.
  if (!eof()) fail('여는 괄호가 없습니다');
  return node;
}

/* ---------------- 패턴 수준: 명령으로 옮기기 ---------------- */

/*
 * 마디 나무를 명령 목록으로 옮긴 뒤, 실행 중인 자리를 집합으로 들고 글자를 한 번씩
 * 훑는다(NFA 시뮬레이션).
 *
 * 되추적으로 짜면 '(가+)+나' 같은 패턴에서 시간이 지수로 튄다 — 24글자에 6초가
 * 걸렸다. 검색칸에는 아무 정규식이나 붙여 넣을 수 있으니 그 한 줄에 사이드바가
 * 멈춰 버린다. 인게임 문법에는 역참조도 전방 탐색도 없어서 패턴이 언제나 정규
 * 언어다. 그래서 가능한 자리를 한꺼번에 굴릴 수 있고, 글자 수 × 명령 수에 비례하는
 * 시간에 끝난다. 폭발하는 패턴이 아예 없다.
 *
 * 명령:
 *   { op: 'char' | 'any' | 'class' }  글자 하나를 먹는다
 *   { op: 'split', x, y }             두 갈래 (자리는 그대로)
 *   { op: 'jmp', x }                  건너뛴다
 *   { op: 'lineStart' | 'lineEnd' }   너비 없는 앵커
 *   { op: 'match' }                   여기 닿으면 성공
 */

// 'ㄱ{1,100000}' 같은 수량자로 메모리를 태우지 않도록 둔 상한.
const MAX_PROGRAM = 5000;

function foldCase(ch) {
  return ch.toLowerCase();
}

function inClass(node, ch) {
  const c = foldCase(ch);
  let hit = false;
  for (const [lo, hi] of node.ranges) {
    const l = foldCase(lo);
    const h = foldCase(hi);
    if (c >= l && c <= h) {
      hit = true;
      break;
    }
    // 대소문자를 접기 전 값으로도 본다('[A-Z]'에 'a'가 걸리도록).
    if (ch >= lo && ch <= hi) {
      hit = true;
      break;
    }
  }
  return node.negated ? !hit : hit;
}

/** 마디 나무 → 명령 목록. 끝에는 언제나 match가 붙는다. */
function compileProgram(root) {
  const prog = [];

  const emit = (inst) => {
    if (prog.length >= MAX_PROGRAM) {
      throw new PoeRegexError('패턴이 너무 큽니다 (수량자를 줄이세요)', 0);
    }
    prog.push(inst);
    return prog.length - 1;
  };

  const walk = (node) => {
    switch (node.type) {
      case 'empty':
        return;

      case 'char':
        emit({ op: 'char', ch: foldCase(node.ch) });
        return;

      case 'any':
        emit({ op: 'any' });
        return;

      case 'class':
        emit({ op: 'class', negated: node.negated, ranges: node.ranges });
        return;

      case 'start':
        emit({ op: 'lineStart' });
        return;

      case 'end':
        emit({ op: 'lineEnd' });
        return;

      case 'look':
        // 전방 탐색은 자리를 옮기지 않는다. 속을 따로 옮겨 두고, 맞추는 자리에서
        // 그 자리에 붙여 돌려 본다(runProgram 참고).
        emit({ op: 'look', negated: node.negated, prog: compileProgram(node.node) });
        return;

      case 'seq':
        node.items.forEach(walk);
        return;

      case 'alt': {
        // split 앞갈래, 뒷갈래 / 앞갈래 끝에서 전체 끝으로 jmp
        const jumps = [];
        node.options.forEach((option, index) => {
          const last = index === node.options.length - 1;
          if (last) {
            walk(option);
            return;
          }
          const split = emit({ op: 'split', x: 0, y: 0 });
          prog[split].x = prog.length;
          walk(option);
          jumps.push(emit({ op: 'jmp', x: 0 }));
          prog[split].y = prog.length;
        });
        for (const jump of jumps) prog[jump].x = prog.length;
        return;
      }

      case 'repeat':
        walkRepeat(node);
        return;

      default:
        return;
    }
  };

  /*
   * 최소 횟수만큼 펴 놓고, 나머지를 별표(무한) 또는 물음표(유한)로 잇는다.
   * 'ㄱ{2,4}'는 'ㄱㄱㄱ?ㄱ?'과 같은 말이다.
   */
  function walkRepeat(node) {
    for (let n = 0; n < node.min; n++) walk(node.node);

    if (node.max === Infinity) {
      // 별표: split 몸통, 끝 / 몸통 뒤에서 split으로 되돌아간다
      const split = emit({ op: 'split', x: 0, y: 0 });
      prog[split].x = prog.length;
      walk(node.node);
      emit({ op: 'jmp', x: split });
      prog[split].y = prog.length;
      return;
    }

    const optional = node.max - node.min;
    const splits = [];
    for (let n = 0; n < optional; n++) {
      const split = emit({ op: 'split', x: 0, y: 0 });
      prog[split].x = prog.length;
      splits.push(split);
      walk(node.node);
    }
    // 건너뛰기로 갈 자리는 모두 전체 끝이다.
    for (const split of splits) prog[split].y = prog.length;
  }

  walk(root);
  emit({ op: 'match' });
  return prog;
}

/* ---------------- 패턴 수준: 굴리기 ---------------- */

function inClass(inst, ch) {
  const folded = foldCase(ch);
  let hit = false;
  for (const [lo, hi] of inst.ranges) {
    // 접기 전후로 모두 본다('[A-Z]'에 'a'가, '[a-z]'에 'A'가 걸리도록).
    if ((ch >= lo && ch <= hi) || (folded >= foldCase(lo) && folded <= foldCase(hi))) {
      hit = true;
      break;
    }
  }
  return inst.negated ? !hit : hit;
}

/** 이 명령이 글자 하나를 먹는지. 줄바꿈은 어떤 명령으로도 먹지 않는다. */
function consumes(inst, ch) {
  if (ch === '\n') return false;
  switch (inst.op) {
    // 아이템 전문은 줄바꿈으로 이어진 한 덩어리다. '.'이 줄을 넘게 두면
    // '터.피해'가 서로 다른 두 모드 줄에 걸쳐 걸린다.
    case 'any':
      return true;
    case 'char':
      return foldCase(ch) === inst.ch;
    case 'class':
      return inClass(inst, ch);
    default:
      return false;
  }
}

/**
 * 명령 목록을 굴린다.
 *
 * anchored가 참이면 from 자리에서 시작하는 것만 본다(전방 탐색에 쓴다). 거짓이면
 * 자리마다 새 실을 하나씩 풀어 놓는다 — 인게임 검색이 부분 일치이기 때문이다.
 */
function runProgram(prog, text, from, anchored) {
  const len = text.length;
  let running = [];

  for (let pos = from; pos <= len; pos++) {
    const seen = new Uint8Array(prog.length);
    const waiting = [];

    // 갈래·건너뛰기·앵커·전방 탐색은 글자를 먹지 않으므로 여기서 미리 다 펴 둔다.
    const stack = [...running];
    if (!anchored || pos === from) stack.push(0);

    while (stack.length) {
      const pc = stack.pop();
      if (seen[pc]) continue;
      seen[pc] = 1;

      const inst = prog[pc];
      switch (inst.op) {
        case 'split':
          stack.push(inst.x, inst.y);
          break;
        case 'jmp':
          stack.push(inst.x);
          break;
        case 'lineStart':
          // 줄 단위 앵커다. 아이템 전문이 여러 줄이므로 각 줄머리에 걸린다.
          if (pos === 0 || text[pos - 1] === '\n') stack.push(pc + 1);
          break;
        case 'lineEnd':
          if (pos === len || text[pos] === '\n') stack.push(pc + 1);
          break;
        case 'look':
          // 속을 이 자리에 붙여 돌려 보고, 결과가 뜻과 맞으면 지나간다.
          if (runProgram(inst.prog, text, pos, true) !== inst.negated) stack.push(pc + 1);
          break;
        case 'match':
          return true;
        default:
          waiting.push(pc);
      }
    }

    if (pos === len) break;

    const ch = text[pos];
    running = [];
    for (const pc of waiting) {
      if (consumes(prog[pc], ch)) running.push(pc + 1);
    }
    // 앵커된 실행에서 이어갈 실이 없으면 더 볼 것이 없다.
    if (anchored && !running.length) return false;
  }

  return false;
}

/* ---------------- 공개 API ---------------- */

/**
 * 항목 하나가 문구에 걸리는지.
 *
 * 게임은 먼저 글자 그대로 찾아보고, 없을 때 정규식으로 본다. GGG가 그렇게
 * 고치겠다고 밝혔고(RhysGGG, "try a basic string match first, then attempt a
 * regex match if the basic match fails") 3.14.1c의 "items with quality ...
 * couldn't be filtered using the '+' character" 수정이 그 예시와 맞아떨어진다.
 * 덕분에 '+16% 품질'처럼 정규식으로는 깨진 검색어도 게임에서는 그냥 걸린다.
 */
function termMatches(term, text) {
  if (text.toLowerCase().includes(term.pattern.toLowerCase())) return true;
  return term.prog ? runProgram(term.prog, text, 0, false) : false;
}

/**
 * 검색어를 해석해 매처를 만든다.
 *
 * 돌려주는 값:
 *  - terms   해석된 항목들 { source, pattern, negated, prog, error }
 *  - errors  받지 못한 항목들 { source, message, index, kind }
 *  - test(text)  아이템 전문이 이 검색어에 걸리는지
 *
 * 문법이 깨진 항목(kind: 'syntax')은 글자 그대로 찾는 항목이 되고 errors에도
 * 담긴다 — 게임과 같은 동작이지만, 정규식으로 쓸 생각이었다면 알아야 하니까.
 * 게임에서 어떻게 되는지 알 수 없는 문법(kind: 'unsupported')은 아예 빼 둔다.
 * 찍어서 맞추면 확장만 걸린다고 하고 게임은 아닌 어긋남이 생긴다.
 */
function compileQuery(query) {
  const terms = [];
  const errors = [];

  for (const term of splitTerms(query)) {
    try {
      const prog = compileProgram(parsePattern(term.pattern));
      terms.push({ ...term, prog, error: null });
    } catch (err) {
      if (!(err instanceof PoeRegexError)) throw err;
      const error = { source: term.source, message: err.message, index: err.index, kind: err.kind };
      terms.push({ ...term, prog: null, error });
      errors.push(error);
    }
  }

  return {
    terms,
    errors,
    query,
    /** 항목을 모두 만족해야 한다(AND). '!'가 붙은 항목은 걸리면 탈락이다. */
    test(text) {
      for (const term of terms) {
        if (term.error?.kind === 'unsupported') continue;
        if (termMatches(term, text) === term.negated) return false;
      }
      return true;
    },
  };
}

/** 검색어 하나를 문구 하나에 맞춰 본다. */
function matchesQuery(query, text) {
  return compileQuery(query).test(text);
}

/**
 * 항목 하나짜리 매처. compileQuery와 달리 공백으로 다시 쪼개지 않는다.
 *
 * 따옴표로 묶인 문구('"몬스터 피해"')나 이미 항목으로 쪼개 둔 패턴을 맞출 때
 * 쓴다. 그냥 compileQuery에 넣으면 '몬스터'와 '피해' 두 항목의 AND가 되어,
 * 붙어 있지 않아도 걸리는 다른 검색이 되어 버린다.
 */
function compilePattern(pattern) {
  let prog = null;
  let error = null;
  try {
    prog = compileProgram(parsePattern(pattern));
  } catch (err) {
    if (!(err instanceof PoeRegexError)) throw err;
    error = { source: pattern, message: err.message, index: err.index, kind: err.kind };
  }

  const term = { pattern, prog, negated: false };
  return {
    pattern,
    prog,
    error,
    test(text) {
      if (error?.kind === 'unsupported') return false;
      return termMatches(term, text);
    },
  };
}

/**
 * 검색어를 검사한다. 화면에 그대로 보여 줄 수 있는 결과를 돌려준다.
 *  - ok           그대로 써도 되는지 (받지 못한 문법이 없는지)
 *  - errors       받지 못한 항목들
 *  - unsupported  그중 게임에서 어떻게 되는지 알 수 없어 뺀 항목들
 *  - length       글자 수
 *  - tooLong      인게임 한도(250자)를 넘었는지
 *
 * 문법이 깨진 항목은 ok를 거짓으로 만들지만 매칭에서 빠지지는 않는다. 게임이
 * 글자 그대로 찾아 주기 때문이다(termMatches 참고).
 */
function validateQuery(query) {
  const { errors, terms } = compileQuery(query);
  const unsupported = errors.filter((e) => e.kind === 'unsupported');
  return {
    ok: errors.length === 0,
    errors,
    unsupported,
    terms,
    length: query.length,
    tooLong: query.length > POE_QUERY_MAX,
  };
}

// 브라우저에서는 <script>로 로드되고, 테스트에서는 require로 쓴다.
if (typeof module !== 'undefined') {
  module.exports = {
    splitTerms,
    splitAlternatives,
    parsePattern,
    compileQuery,
    compilePattern,
    matchesQuery,
    validateQuery,
    PoeRegexError,
    POE_QUERY_MAX,
  };
}
