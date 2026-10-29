// Builds sanitized feed fixtures from extract.cjs samples.
// Names -> P<n>/Team <n>; player ids remapped consistently across endpoints.
// usage: node sanitize.cjs <samplesDir> <outDir>
'use strict';
const fs = require('fs');
const path = require('path');
const [src, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

const ids = new Map(); // original id string -> fake
const fakeId = (v) => {
  const k = String(v);
  if (k === '0' || k === '' || k === '-1') return v;
  if (!ids.has(k)) ids.set(k, String(900000000 + ids.size + 1));
  return typeof v === 'number' ? +ids.get(k) : ids.get(k);
};
const names = new Map();
const fakeName = (v, prefix) => {
  const k = String(v);
  if (!k) return v;
  if (!names.has(k)) names.set(k, `${prefix}${[...names.values()].filter((n) => n.startsWith(prefix)).length + 1}`);
  return names.get(k);
};
const ID_KEYS = /^(uId|playerOpenId|playerKey|PlayerKey|PlayerID|CauserUID|VictimUID|BeRevivedUID|ReviverUID|UID|killerUId|victimUId|0)$/;
const NAME_KEYS = /^(playerName|CauserName|VictimName)$/;

function clean(v, key) {
  if (Array.isArray(v)) return v.map((x) => (key === 'assistUIdArray' ? fakeId(x) : clean(x)));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (ID_KEYS.test(k) && (typeof x === 'number' || typeof x === 'string')) o[k] = fakeId(x);
      else if (NAME_KEYS.test(k)) o[k] = fakeName(x, 'P');
      else if (k === 'teamName') o[k] = `Team ${v.teamId ?? '?'}`;
      else if (k === 'picUrl' && x) o[k] = '';
      else o[k] = clean(x, k);
    }
    return o;
  }
  return v;
}

// Pick the richest sample (most non-zero numbers) per endpoint.
const score = (b) => JSON.stringify(b).match(/:[1-9]/g)?.length ?? 0;
const index = {};
for (const file of fs.readdirSync(src)) {
  const samples = JSON.parse(fs.readFileSync(path.join(src, file), 'utf8')).filter((s) => s.body !== undefined);
  if (!samples.length) continue;
  const best = samples.sort((a, b) => score(b.body) - score(a.body))[0];
  let body = clean(best.body);
  if (body.playerweapondetailinfo) body.playerweapondetailinfo = body.playerweapondetailinfo.slice(0, 6); // bound size
  const name = file.replace(/^(GET|POST)_/, '').replace(/\.json$/, '');
  const method = file.split('_')[0];
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ method, path: `/${name.replace(/^_/, '')}`, capturedAt: best.ts, body }, null, 1));
  index[name] = { method, bytes: fs.statSync(path.join(out, `${name}.json`)).size };
}
fs.writeFileSync(path.join(out, 'README.md'), [
  '# Game-feed fixtures (:10086)',
  '',
  'Captured from the game-feed server logs (`D:\\code\\log`, 2026-10-25..28) and sanitized:',
  'player names → `P<n>`, team names → `Team <teamId>`, player ids remapped consistently',
  'across endpoints (so killinfo/assist/revive uids still match `gettotalplayerlist`), `picUrl` blanked.',
  'POST bodies came from Node `util.inspect` logs, so nested arrays deeper than 2 levels',
  'appear as the string `"[Array truncated]"`.',
  '',
  'Regenerate with the M1 extractor (see `front/docs/designer-upgrade/m1-audit.md`).',
  '',
  ...Object.entries(index).map(([k, v]) => `- \`${k}.json\` — ${v.method}, ${v.bytes} B`),
  '',
].join('\n'));
console.log(index, 'ids remapped:', ids.size);
