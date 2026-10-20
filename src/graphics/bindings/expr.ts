// Safe expressions inside {{ … }}: JS-like syntax over live data, parsed into
// a small tree and evaluated here — never executed (no eval, no Function).
//
//   {{ item.players[0].isFiring ? '•' : item.rank }}
//   {{ sum(item.players, 'killNum') * 10 + item.placePoints }}
//   {{ item.damage | fixed(1) }}      {{ item.teamName ?? 'TBD' }}
//
// Names resolve only from the binding roots (item, live, derived, …) through
// the same own-property rules as a path (resolve.ts safeGet). Calls reach only
// the HELPERS table below. A bad expression evaluates to undefined (renders
// as nothing); expressionProblem() explains it to the editor.

import { BINDING_ROOTS, LIMITS } from '../schema/layoutSchema.js';
import { FORMATTER_IMPLS } from './formatters.ts';
import { compare, looseEquals, num } from './loose.ts';
import { safeGet, type BindingScope } from './resolve.ts';

const ROOTS = new Set<string>(BINDING_ROOTS);
const MAX_LENGTH: number = LIMITS.maxExpressionLength || 500;
const MAX_NODES = 200;
const MAX_DEPTH = 40;

// ── helpers ─────────────────────────────────────────────────────────────────

type Helper = (args: unknown[], scope: BindingScope) => unknown;

const n0 = (v: unknown) => num(v);
const listOf = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const field = (row: unknown, key: unknown) => (key == null || key === '' ? row : safeGet(row, String(key)));
const truthy = (v: unknown) => !!v && v !== 'false' && v !== '0';

const HELPERS: Record<string, Helper> = {
  round: ([v, d]) => { const x = n0(v); if (x == null) return undefined; const p = 10 ** Math.max(0, Math.min(6, n0(d) || 0)); return Math.round(x * p) / p; },
  fixed: ([v, d]) => { const x = n0(v); return x == null ? undefined : x.toFixed(Math.max(0, Math.min(6, n0(d) ?? 0))); },
  floor: ([v]) => { const x = n0(v); return x == null ? undefined : Math.floor(x); },
  ceil: ([v]) => { const x = n0(v); return x == null ? undefined : Math.ceil(x); },
  abs: ([v]) => { const x = n0(v); return x == null ? undefined : Math.abs(x); },
  min: (args) => { const xs = args.flatMap((a) => (Array.isArray(a) ? a : [a])).map(n0).filter((x): x is number => x != null); return xs.length ? Math.min(...xs) : undefined; },
  max: (args) => { const xs = args.flatMap((a) => (Array.isArray(a) ? a : [a])).map(n0).filter((x): x is number => x != null); return xs.length ? Math.max(...xs) : undefined; },
  clamp: ([v, lo, hi]) => { const x = n0(v); if (x == null) return undefined; return Math.min(n0(hi) ?? x, Math.max(n0(lo) ?? x, x)); },
  pad: ([v, w, ch]) => (v == null ? undefined : String(v).padStart(Math.max(0, Math.min(20, n0(w) || 2)), ch == null ? '0' : String(ch).slice(0, 1) || '0')),
  if: ([c, a, b]) => (truthy(c) ? a : b),
  len: ([v]) => (Array.isArray(v) || typeof v === 'string' ? v.length : undefined),
  join: ([v, sep]) => (Array.isArray(v) ? v.filter((x) => x != null && typeof x !== 'object').join(sep == null ? ', ' : String(sep)) : undefined),
  sum: ([arr, key]) => listOf(arr).reduce((s: number, row) => s + (n0(field(row, key)) || 0), 0),
  count: ([arr, key]) => (key == null ? listOf(arr).length : listOf(arr).filter((row) => truthy(field(row, key))).length),
  any: ([arr, key]) => listOf(arr).some((row) => truthy(field(row, key))),
  all: ([arr, key]) => { const l = listOf(arr); return l.length > 0 && l.every((row) => truthy(field(row, key))); },
  percent: ([a, b]) => { const x = n0(a); const y = n0(b); return x == null || !y ? undefined : Math.round((x / y) * 100); },
  string: ([v]) => (v == null ? '' : String(v)),
  number: ([v]) => n0(v) ?? undefined,
};
// Every binding formatter works as a function too: upper(x), ordinal(x), time(x)…
// (`number` stays the converter above; the formatter is `x | number` as before.)
for (const [name, f] of Object.entries(FORMATTER_IMPLS)) {
  if (!HELPERS[name]) HELPERS[name] = ([v], scope) => f(v, scope);
}
/** The pipe form `x | number` keeps the old formatter meaning (thousands separators). */
const PIPE_ONLY: Record<string, Helper> = {
  number: ([v], scope) => FORMATTER_IMPLS.number(v, scope),
};

export const EXPRESSION_HELPERS = Object.keys(HELPERS).sort();

// ── tokenizer ───────────────────────────────────────────────────────────────

type Tok =
  | { k: 'num'; v: number; at: number }
  | { k: 'str'; v: string; at: number }
  | { k: 'id'; v: string; at: number }
  | { k: 'op'; v: string; at: number }
  | { k: 'end'; at: number };

class ExprError extends Error {
  constructor(message: string, public at: number) { super(message); }
}

const OPS = ['===', '!==', '==', '!=', '<=', '>=', '&&', '||', '??', '?', ':', '!', '+', '-', '*', '/', '%', '<', '>', '(', ')', '[', ']', '.', ',', '|'];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i))!;
      out.push({ k: 'num', v: Number(m[0]), at: i });
      i += m[0].length;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\\' && j + 1 < src.length) { j++; s += src[j] === 'n' ? '\n' : src[j]; } else s += src[j];
        j++;
      }
      if (j >= src.length) throw new ExprError('A text in quotes is never closed', i);
      out.push({ k: 'str', v: s, at: i });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(i))!;
      out.push({ k: 'id', v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`“${ch}” is not allowed here`, i);
    out.push({ k: 'op', v: op, at: i });
    i += op.length;
  }
  out.push({ k: 'end', at: src.length });
  return out;
}

// ── parser ──────────────────────────────────────────────────────────────────

export type Node =
  | { t: 'lit'; v: unknown }
  | { t: 'id'; n: string; at: number }
  | { t: 'mem'; o: Node; k: Node }
  | { t: 'call'; f: string; a: Node[]; at: number; pipe?: boolean }
  | { t: 'un'; op: string; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'cond'; c: Node; a: Node; b: Node };

const BIN_LEVELS: string[][] = [
  ['??'], ['||'], ['&&'], ['==', '!=', '===', '!=='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%'],
];

function parse(src: string): Node {
  if (src.length > MAX_LENGTH) throw new ExprError(`Too long (${src.length} / ${MAX_LENGTH} characters)`, 0);
  const toks = tokenize(src);
  let p = 0;
  let nodes = 0;
  let depth = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = toks[p]; return t.k === 'op' && t.v === v; };
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(`Expected “${v}”`, toks[p].at);
    p++;
  };
  const node = <T extends Node>(n: T): T => {
    if (++nodes > MAX_NODES) throw new ExprError('Expression is too complex', toks[p].at);
    return n;
  };
  const enter = () => { if (++depth > MAX_DEPTH) throw new ExprError('Expression is nested too deeply', toks[p].at); };

  function args(): Node[] {
    const list: Node[] = [];
    expect('(');
    if (!isOp(')')) {
      do { list.push(ternary()); } while (isOp(',') && ++p);
    }
    expect(')');
    return list;
  }

  function primary(): Node {
    const t = peek();
    if (t.k === 'num' || t.k === 'str') { p++; return node({ t: 'lit', v: t.v }); }
    if (t.k === 'id') {
      p++;
      if (t.v === 'true' || t.v === 'false') return node({ t: 'lit', v: t.v === 'true' });
      if (t.v === 'null' || t.v === 'undefined') return node({ t: 'lit', v: null });
      if (isOp('(')) {
        if (!HELPERS[t.v]) throw new ExprError(`“${t.v}()” is not a helper`, t.at);
        return node({ t: 'call', f: t.v, a: args(), at: t.at });
      }
      return node({ t: 'id', n: t.v, at: t.at });
    }
    if (t.k === 'op' && t.v === '(') {
      p++;
      enter();
      const inner = ternary();
      depth--;
      expect(')');
      return inner;
    }
    throw new ExprError(t.k === 'end' ? 'The expression ends too early' : `Unexpected “${(t as any).v}”`, t.at);
  }

  function member(): Node {
    let n = primary();
    for (;;) {
      if (isOp('.')) {
        p++;
        const t = peek();
        if (t.k !== 'id') throw new ExprError('Expected a field name after “.”', t.at);
        p++;
        if (isOp('(')) throw new ExprError(`Methods like “.${t.v}()” are not allowed — use a helper`, t.at);
        n = node({ t: 'mem', o: n, k: { t: 'lit', v: t.v } });
      } else if (isOp('[')) {
        p++;
        enter();
        const k = ternary();
        depth--;
        expect(']');
        n = node({ t: 'mem', o: n, k });
      } else return n;
    }
  }

  function unary(): Node {
    if (isOp('!') || isOp('-') || isOp('+')) {
      const op = (peek() as any).v;
      p++;
      enter();
      const a = unary();
      depth--;
      return node({ t: 'un', op, a });
    }
    return member();
  }

  function binary(level: number): Node {
    if (level >= BIN_LEVELS.length) return unary();
    let a = binary(level + 1);
    while (peek().k === 'op' && BIN_LEVELS[level].includes((peek() as any).v)) {
      const op = (peek() as any).v;
      p++;
      a = node({ t: 'bin', op, a, b: binary(level + 1) });
    }
    return a;
  }

  function ternary(): Node {
    const c = binary(0);
    if (!isOp('?')) return c;
    p++;
    enter();
    const a = ternary();
    expect(':');
    const b = ternary();
    depth--;
    return node({ t: 'cond', c, a, b });
  }

  function pipes(): Node {
    let n = ternary();
    while (isOp('|')) {
      p++;
      const t = peek();
      if (t.k !== 'id') throw new ExprError('Expected a format name after “|”', t.at);
      p++;
      if (!HELPERS[t.v] && !PIPE_ONLY[t.v]) throw new ExprError(`“${t.v}” is not a format`, t.at);
      const extra = isOp('(') ? args() : [];
      n = node({ t: 'call', f: t.v, a: [n, ...extra], at: t.at, pipe: true });
    }
    return n;
  }

  const tree = pipes();
  if (peek().k !== 'end') throw new ExprError(`Unexpected “${(peek() as any).v ?? ''}”`, peek().at);
  return tree;
}

// ── cache + evaluation ──────────────────────────────────────────────────────

type Parsed = { ok: true; node: Node } | { ok: false; error: ExprError };
const cache = new Map<string, Parsed>();

function parsed(src: string): Parsed {
  let hit = cache.get(src);
  if (!hit) {
    try { hit = { ok: true, node: parse(src) }; } catch (e) {
      hit = { ok: false, error: e instanceof ExprError ? e : new ExprError('Could not read this expression', 0) };
    }
    if (cache.size > 2000) cache.clear();
    cache.set(src, hit);
  }
  return hit;
}

function arith(op: string, a: unknown, b: unknown): unknown {
  if (op === '+' && (typeof a === 'string' || typeof b === 'string')) return `${a ?? ''}${b ?? ''}`;
  const x = num(a);
  const y = num(b);
  if (x == null || y == null) return undefined;
  switch (op) {
    case '+': return x + y;
    case '-': return x - y;
    case '*': return x * y;
    case '/': return y === 0 ? undefined : x / y;
    case '%': return y === 0 ? undefined : x % y;
    default: return undefined;
  }
}

function order(op: string, a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string' && (num(a) == null || num(b) == null)) {
    const c = a.localeCompare(b);
    return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
  }
  switch (op) {
    case '<': return compare(a, b, (x, y) => x < y);
    case '>': return compare(a, b, (x, y) => x > y);
    case '<=': return compare(a, b, (x, y) => x <= y);
    default: return compare(a, b, (x, y) => x >= y);
  }
}

function evalNode(n: Node, scope: BindingScope): unknown {
  switch (n.t) {
    case 'lit': return n.v;
    case 'id': return ROOTS.has(n.n) ? safeGet(scope, n.n) : undefined;
    case 'mem': {
      const o = evalNode(n.o, scope);
      const k = evalNode(n.k, scope);
      if (typeof k !== 'string' && typeof k !== 'number') return undefined;
      return safeGet(o, k);
    }
    case 'call': {
      const f = (n.pipe && PIPE_ONLY[n.f]) || HELPERS[n.f];
      if (!f) return undefined;
      try { return f(n.a.map((a) => evalNode(a, scope)), scope); } catch { return undefined; }
    }
    case 'un': {
      const a = evalNode(n.a, scope);
      if (n.op === '!') return !truthy(a);
      const x = num(a);
      return x == null ? undefined : n.op === '-' ? -x : x;
    }
    case 'cond': return truthy(evalNode(n.c, scope)) ? evalNode(n.a, scope) : evalNode(n.b, scope);
    case 'bin': {
      if (n.op === '&&') { const a = evalNode(n.a, scope); return truthy(a) ? evalNode(n.b, scope) : a; }
      if (n.op === '||') { const a = evalNode(n.a, scope); return truthy(a) ? a : evalNode(n.b, scope); }
      if (n.op === '??') { const a = evalNode(n.a, scope); return a == null || a === '' ? evalNode(n.b, scope) : a; }
      const a = evalNode(n.a, scope);
      const b = evalNode(n.b, scope);
      switch (n.op) {
        case '==': return looseEquals(a, b);
        case '!=': return !looseEquals(a, b);
        case '===': return a === b;
        case '!==': return a !== b;
        case '<': case '>': case '<=': case '>=': return order(n.op, a, b);
        default: return arith(n.op, a, b);
      }
    }
    default: return undefined;
  }
}

/** Evaluate an expression against the binding scope; undefined when it cannot be read. */
export function evaluateExpression(src: string, scope: BindingScope | Record<string, any> | undefined): unknown {
  const p = parsed(src.trim());
  if (!p.ok) return undefined;
  try { return evalNode(p.node, (scope || {}) as BindingScope); } catch { return undefined; }
}

/** Truthiness the way expressions and `@when` blocks use it ("false" / "0" from text data count as false). */
export const isTruthy = truthy;

export interface ExpressionProblem { message: string; column: number }

/** Why an expression cannot be read (syntax, unknown helper, name that is not data), or null. */
export function expressionProblem(src: string): ExpressionProblem | null {
  const s = src.trim();
  const p = parsed(s);
  if (!p.ok) return { message: p.error.message, column: p.error.at + 1 };
  let bad: ExpressionProblem | null = null;
  walk(p.node, (n) => {
    if (!bad && n.t === 'id' && !ROOTS.has(n.n)) {
      bad = { message: `“${n.n}” is not data — start with item., live., derived., match.… or put text in quotes`, column: n.at + 1 };
    }
  });
  return bad;
}

function walk(n: Node, fn: (n: Node) => void): void {
  fn(n);
  switch (n.t) {
    case 'mem': walk(n.o, fn); walk(n.k, fn); break;
    case 'call': n.a.forEach((a) => walk(a, fn)); break;
    case 'un': walk(n.a, fn); break;
    case 'bin': walk(n.a, fn); walk(n.b, fn); break;
    case 'cond': walk(n.c, fn); walk(n.a, fn); walk(n.b, fn); break;
    default: break;
  }
}

/** The path a member chain names with literal keys (`item.players[0].isFiring`), or null. */
function pathOf(n: Node): string | null {
  if (n.t === 'id') return ROOTS.has(n.n) ? n.n : null;
  if (n.t !== 'mem') return null;
  const base = pathOf(n.o);
  if (base == null || n.k.t !== 'lit') return null;
  const k = n.k.v;
  if (typeof k === 'number' && Number.isInteger(k)) return `${base}[${k}]`;
  if (typeof k === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k)) return `${base}.${k}`;
  return null;
}

/** Every data path an expression reads (longest literal chain each), for checks and diagnostics. */
export function expressionPaths(src: string): string[] {
  const p = parsed(src.trim());
  if (!p.ok) return [];
  const out = new Set<string>();
  const visit = (n: Node): void => {
    const path = pathOf(n);
    if (path) { out.add(path); return; }
    switch (n.t) {
      case 'mem': visit(n.o); visit(n.k); break;
      case 'call': n.a.forEach(visit); break;
      case 'un': visit(n.a); break;
      case 'bin': visit(n.a); visit(n.b); break;
      case 'cond': visit(n.c); visit(n.a); visit(n.b); break;
      default: break;
    }
  };
  visit(p.node);
  return Array.from(out);
}
