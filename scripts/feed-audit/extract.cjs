// Streams :10086 game-feed logs and inventories every endpoint/event:
// counts, rate, payload size, field paths (type + example), raw samples.
// usage: node extract.cjs <outDir> <file>[:maxMB] ...
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const outDir = process.argv[2];
const inputs = process.argv.slice(3).map((a) => { const [f, mb] = a.split(/:(?=\d+$)/); return { f, max: mb ? +mb * 1048576 : Infinity }; });

const HEADER = /^\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\] (GET|POST) (\S+)/;
const eps = new Map(); // key -> stats
const ep = (k) => {
  if (!eps.has(k)) eps.set(k, { count: 0, parsed: 0, unparsed: 0, emptyBody: 0, bytes: 0, maxBytes: 0, first: null, last: null, perSecond: new Map(), fields: new Map(), samples: [], tags: new Set() });
  return eps.get(k);
};

// util.inspect text -> JSON (lenient). Truncation markers become strings.
function inspectToJson(txt) {
  let s = txt.trim();
  const brace = s.search(/[{[]/);
  if (brace < 0) return undefined;
  s = s.slice(brace);
  // Mask strings as @N@ so key-quoting never touches their contents.
  const strs = [];
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") {
      let j = i + 1, buf = '';
      while (j < s.length && s[j] !== "'") { if (s[j] === '\\') { buf += s[j + 1]; j += 2; } else buf += s[j++]; }
      strs.push(JSON.stringify(buf)); out += `@${strs.length - 1}@`; i = j; continue;
    }
    out += c;
  }
  out = out
    .replace(/\[(Array|Object)\]/g, '"[$1 truncated]"')
    .replace(/\.\.\. \d+ more items?/g, '')
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/@(\d+)@/g, (_, n) => strs[+n]);
  try { return JSON.parse(out); } catch { return undefined; }
}

const DYN = /^\d{4,}$/; // numeric keys (item ids, '0'..'7' kept literal below)
function walk(v, p, fields, depth = 0) {
  const t = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
  const key = p || '(root)';
  let f = fields.get(key);
  if (!f) fields.set(key, (f = { types: new Set(), example: undefined, seen: 0, numericStrings: 0 }));
  f.types.add(t); f.seen++;
  if (t === 'string' && v !== '' && !isNaN(+v)) f.numericStrings++;
  if (f.example === undefined && t !== 'object' && t !== 'array' && v !== '' && v !== null) f.example = v;
  if (depth > 6) return;
  if (t === 'array') { for (const x of v.slice(0, 120)) walk(x, `${p}[]`, fields, depth + 1); }
  else if (t === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${p ? p + '.' : ''}${DYN.test(k) ? '<itemId>' : k}`, fields, depth + 1);
}

async function run({ f, max }) {
  const stream = fs.createReadStream(f, { end: max === Infinity ? undefined : max - 1 });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let cur = null; const body = []; let bodyBytes = 0;
  const flush = () => {
    if (!cur) return;
    const s = ep(cur.key);
    const text = body.join('\n'); body.length = 0; bodyBytes = 0;
    const bytes = Buffer.byteLength(text);
    s.bytes += bytes; s.maxBytes = Math.max(s.maxBytes, bytes);
    s.count++; s.first ??= cur.ts; s.last = cur.ts;
    { const sec = Date.parse(cur.ts.replace(' ', 'T')) / 1000; s.perSecond.set(sec, (s.perSecond.get(sec) || 0) + 1); }
    const tag = text.match(/^(\S+ [A-Za-z ]+?)(:|$)/m); if (tag && !text.startsWith('{') && s.tags.size < 50) s.tags.add(tag[1].slice(0, 60));
    if (!text.trim()) { s.emptyBody++; cur = null; return; }
    // Parse sparsely for the hot endpoints (every 40th), always for others.
    const hot = s.count > 200 && s.count % 40 !== 0;
    if (!hot) {
      let obj;
      if (cur.method === 'GET') { try { obj = JSON.parse(text.split('\n')[0]); } catch {} }
      else obj = inspectToJson(text);
      if (obj !== undefined) { s.parsed++; walk(obj, '', s.fields); { const sc = (text.match(/[:,] ?[1-9]/g) || []).length; if (s.samples.length < 3) s.samples.push({ sc, ts: cur.ts, file: path.basename(f), body: obj }); else { const lo = s.samples.reduce((a, b) => (a.sc <= b.sc ? a : b)); if (sc > lo.sc) Object.assign(lo, { sc, ts: cur.ts, file: path.basename(f), body: obj }); } } }
      else { s.unparsed++; if (s.samples.length < 2) s.samples.push({ ts: cur.ts, file: path.basename(f), raw: text.slice(0, 2000) }); }
    }
    cur = null;
  };
  const misc = ep('(non-request lines)');
  let nextMark = 0;
  const onLine = (line) => {
    if (stream.bytesRead >= nextMark) { console.error(`  ${path.basename(f)} ${(stream.bytesRead / 1048576) | 0} MB heap ${(process.memoryUsage().heapUsed / 1048576) | 0} MB`); nextMark += 500 * 1048576; }
    const m = HEADER.exec(line);
    if (m) { flush(); cur = { ts: Buffer.from(m[1]).toString(), method: m[2], key: `${m[2]} ${m[3].split('?')[0]}` }; return; }
    if (cur) {
      bodyBytes += line.length;
      if (bodyBytes < 4e6) body.push(line);
      else if (!cur.big) { cur.big = true; console.error(`oversize body ${cur.key} @ ${cur.ts} in ${path.basename(f)}`); }
      return;
    }
    misc.count++; const k = line.replace(/[\w-]{16,}/g, '<id>').replace(/\d+/g, 'N').slice(0, 80); if (misc.tags.size < 200) misc.tags.add(k);
  };
  rl.on("line", onLine);
  await new Promise((res) => rl.on("close", res));
  flush();
}

(async () => {
  for (const i of inputs) { const t = Date.now(); await run(i); console.error(`done ${i.f} in ${((Date.now() - t) / 1000).toFixed(0)}s`); }
  const report = {};
  for (const [k, s] of [...eps].sort((a, b) => b[1].count - a[1].count)) {
    const secs = [...s.perSecond.values()];
    const span = s.first && s.last ? (Date.parse(s.last.replace(' ', 'T')) - Date.parse(s.first.replace(' ', 'T'))) / 1000 : 0;
    report[k] = {
      count: s.count, parsed: s.parsed, unparsed: s.unparsed, emptyBody: s.emptyBody,
      first: s.first, last: s.last, avgPerSec: span ? +(s.count / span).toFixed(3) : null, maxPerSec: secs.length ? Math.max(...secs) : 0,
      avgBytes: s.count ? Math.round(s.bytes / s.count) : 0, maxBytes: s.maxBytes,
      tags: [...s.tags].slice(0, 30),
      fields: Object.fromEntries([...s.fields].map(([p, f]) => [p, { types: [...f.types], numericString: f.numericStrings > 0 && f.numericStrings === f.seen, example: f.example, seen: f.seen }])),
    };
    fs.writeFileSync(path.join(outDir, 'samples', `${k.replace(/[^\w]+/g, '_')}.json`), JSON.stringify(s.samples, null, 1));
  }
  fs.writeFileSync(path.join(outDir, 'inventory.json'), JSON.stringify(report, null, 1));
  console.error('wrote inventory.json');
})();
