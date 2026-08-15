/**
 * 인게임 검색창의 정규식 엔진.
 *
 * 이 파일은 자바스크립트의 RegExp를 쓰지 않고 패턴을 직접 해석한다. 게임이 받아
 * 주는 문법이 자바스크립트보다 좁기 때문이다. RegExp에 그대로 넘기면 게임에서는
 * 통하지 않는 패턴(전방 탐색 등)이 확장에서만 멀쩡히 동작해서, "걸린다"고 표시한
 * 지도가 정작 게임 안에서는 걸리지 않는 어긋남이 생긴다. 여기서는 지원하지 않는
 * 문법을 조용히 통과시키지 않고 오류로 돌려준다.
 *
 * 대상은 창고·소지품·판매상·지도 장치의 검색칸이다. 매칭 대상 문구는 아이템을
 * Ctrl+C 했을 때 나오는 전문이고, 거래소 API의 extended.text와 같은 값이다
 * (background.js 참고). 그래서 아이템 이름과 '아이템 종류: 지도' 같은 속성 줄도
 * 매칭 대상에 들어간다 — 모드 문구만 놓고 맞춰 보면 안 된다.
 *
 * 가장 중요한 규칙: 인게임 엔진은 언제나 한 줄씩 맞춘다. 여러 줄을 한 덩어리로
 * 보지 않으므로 '.'은 줄바꿈을 넘지 못하고 '^'와 '$'는 줄마다 걸린다. 그래서 한
 * 패턴이 서로 다른 두 모드 줄에 걸쳐 매칭되는 일이 없다.
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

/** 패턴 문법 오류. 어디서 틀렸는지 자리와 함께 알린다. */
class PoeRegexError extends Error {
  constructor(message, index) {
    super(message);
    this.name = 'PoeRegexError';
    this.index = index;
  }
}

function parsePattern(src) {
  let i = 0;

  const fail = (message) => {
    throw new PoeRegexError(message, i);
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
      /*
       * '(?:'는 묶기만 하고 매칭 결과를 바꾸지 않으므로 그냥 받는다.
       *
       * 전방·후방 탐색은 거부한다. 인게임 검색은 아이템 전문을 줄 단위로 훑기
       * 때문에 흔히 쓰는 제외 관용구 '(^((?!단어).)*)'가 게임에서 통하지 않는다
       * (https://www.pathofexile.com/forum/view-thread/3305826). 여기서만 통하게
       * 두면 확장이 고른 지도가 게임에서는 안 걸린다.
       */
      if (src[i + 1] === '?') {
        if (src[i + 2] === ':') {
          i += 3;
          const inner = parseAlt();
          if (eof() || peek() !== ')') fail('닫는 괄호가 없습니다');
          i++;
          return inner;
        }
        fail('전방·후방 탐색은 인게임 검색에서 통하지 않습니다');
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
      /*
       * 축약 클래스(\d \w \s)와 역참조(\1)는 인게임에서 통한다는 근거를 찾지
       * 못했다. 통하지 않는다면 그냥 그 글자로 읽혀 조용히 다른 결과가 나온다.
       * 어느 쪽인지 모르는 채로 넘기느니 대신 쓸 것을 알려 주고 막는다.
       */
      if (/[0-9]/.test(esc)) fail('역참조는 인게임 검색에서 쓸 수 없습니다');
      if (/[A-Za-z]/.test(esc)) {
        fail(`\\${esc}는 인게임 검색에서 통하지 않습니다 (\\d 대신 [0-9]처럼 쓰세요)`);
      }
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
 * 패턴이 문구 어딘가에 걸리는지. 인게임 검색은 부분 일치이므로 자리마다 새 실을
 * 하나씩 풀어 놓는다.
 */
function searchProgram(prog, text) {
  const len = text.length;
  let running = [];

  for (let pos = 0; pos <= len; pos++) {
    const seen = new Uint8Array(prog.length);
    const waiting = [];

    // 갈래·건너뛰기·앵커는 글자를 먹지 않으므로 여기서 미리 다 펴 둔다.
    const stack = [0, ...running];
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
  }

  return false;
}

/* ---------------- 공개 API ---------------- */

/**
 * 검색어를 해석해 매처를 만든다.
 *
 * 돌려주는 값:
 *  - terms   해석된 항목들 { source, pattern, negated, node, error }
 *  - errors  문법이 깨진 항목들 { source, message, index }
 *  - test(text)  아이템 전문이 이 검색어에 걸리는지
 *
 * 문법이 깨진 항목은 매칭에서 빼고 errors에 담는다. 게임은 이런 검색어에
 * 아무것도 보여 주지 않지만, 확장은 어디가 틀렸는지 알려 줘야 고칠 수 있다.
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
      const error = { source: term.source, message: err.message, index: err.index };
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
        if (!term.prog) continue;
        const hit = searchProgram(term.prog, text);
        if (hit === term.negated) return false;
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
 * 검색어를 검사한다. 화면에 그대로 보여 줄 수 있는 결과를 돌려준다.
 *  - ok       문법이 온전한지
 *  - errors   깨진 항목들
 *  - length   글자 수
 *  - tooLong  인게임 한도(250자)를 넘었는지
 */
function validateQuery(query) {
  const { errors, terms } = compileQuery(query);
  return {
    ok: errors.length === 0,
    errors,
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
    matchesQuery,
    validateQuery,
    PoeRegexError,
    POE_QUERY_MAX,
  };
}
