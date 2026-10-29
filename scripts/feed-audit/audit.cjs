// Builds front/docs/designer-upgrade/field-audit.json from the log inventory
// plus the availability map verified against the code on 2026-10-28.
// usage: node audit.cjs <inventory.json> <out.json>
'use strict';
const fs = require('fs');
const [invPath, outPath] = process.argv.slice(2);
const inv = JSON.parse(fs.readFileSync(invPath, 'utf8'));
const SESSION_SECONDS = 32796; // 4 sessions: 7933 + 8556 + 8366 + 7941

// proto/overlay.proto `message Player` (cloud wire). Reserved/removed: see RESERVED.
const PROTO_PLAYER = 'uId playerName playerOpenId picUrl showPicUrl character teamIdfromApi teamId teamName location health healthMax liveState isFiring bHasDied isOutsideBlueCircle killNum killNumBeforeDie gotAirDropNum maxKillDistance damage killNumInVehicle killNumByGrenade rank headShotNum survivalTime driveDistance marchDistance assists knockouts rescueTimes useSmokeGrenadeNum useFragGrenadeNum useBurnGrenadeNum useFlashGrenadeNum contribution heal'.split(' ');
const RESERVED = 'AIKillNum BossKillNum inDamage outsideBlueCircleTime PoisonTotalDamage UseSelfRescueTime UseEmergencyCallTime'.split(' ');
// bindings/live.ts LivePlayer (raw name -> live.* name)
const LIVE_PLAYER = { playerName: 'playerName', uId: 'uId', picUrl: 'picUrl', killNum: 'killNum', damage: 'damage', health: 'health', healthMax: 'healthMax', isFiring: 'isFiring', isOutsideBlueCircle: 'isOutsideBlueCircle', liveState: 'state|knocked|dead (derived)', bHasDied: 'dead (derived)', teamId: 'teamId', teamName: 'teamName' };
// bindings/local.ts LocalPlayer
const LOCAL_PLAYER = { uId: 'uId', playerName: 'playerName', picUrl: 'picUrl', teamId: 'teamId', teamName: 'teamName', health: 'health', healthMax: 'healthMax', killNum: 'killNum', liveState: 'state|alive|knocked|dead (derived)', bHasDied: 'dead (derived)', 'location.x': 'x (0-1)', 'location.y': 'y (0-1)' };
// Bulk HEAVY tier (Bulkpublic.controller.js) — Designer joins with view=null => full.
const TRANSIENT = /^(isFiring|health|liveState|location|isOutsideBlueCircle|bHasDied)/;

const UNITS = { damage: 'hp', inDamage: 'hp', heal: 'hp', PoisonTotalDamage: 'hp', maxKillDistance: 'm', driveDistance: 'm?', marchDistance: 'm?', survivalTime: 's', outsideBlueCircleTime: 's', UseSelfRescueTime: 's?', UseEmergencyCallTime: 's?', health: 'hp', healthMax: 'hp' };

const entries = [];
const rate = (k) => +(inv[k].count / SESSION_SECONDS).toFixed(3);
const base = (k, path, f) => ({
  source: 'game-feed :10086', endpoint: k, rawPath: path,
  type: f.types.filter((t) => t !== 'null').join('|') + (f.numericString ? ' (numeric string)' : ''),
  example: f.example ?? null,
  updates: `${rate(k)}/s per session (max ${inv[k].maxPerSec}/s)`, avgPayloadBytes: inv[k].avgBytes,
  nullable: f.types.includes('null'),
});

// 1) Player fields from GET /gettotalplayerlist
const plk = 'GET /gettotalplayerlist';
for (const [p, f] of Object.entries(inv[plk].fields)) {
  const m = p.match(/^playerInfoList\[\]\.(.+)$/);
  if (!m || f.types.includes('object')) continue;
  const name = m[1];
  const top = name.split('.')[0];
  const cloud = PROTO_PLAYER.includes(top);
  const live = LIVE_PLAYER[name] || LIVE_PLAYER[top];
  const local = LOCAL_PLAYER[name];
  const missing = [];
  if (!cloud) missing.push(RESERVED.includes(top) ? 'removed from cloud wire on purpose (proto reserved) — deliver via relay localFeed' : 'not on cloud wire — deliver via relay localFeed');
  if (!live) missing.push('not in live.players (only raw matchData.teams[].players[])');
  if (!local) missing.push('not in local.players');
  missing.push('no registry label/category (dataDictionary.ts does not exist yet)');
  entries.push({
    id: `player.${name}`, category: 'player', ...base(plk, p, f), normalizedName: name, unit: UNITS[top] ?? null,
    collection: 'players (repeater)',
    availability: {
      cloudWire: cloud, cloudScope: cloud ? `matchData.teams[].players[].${name}` : null,
      liveScope: live ? `live.players[].${live}` : null,
      localScope: local ? `local.players[].${local}` : null,
      editor: cloud ? 'yes (raw path; simulation fills only simulated fields)' : local ? 'sample only (SAMPLE_LOCAL)' : 'no',
      publishedRuntime: cloud ? 'yes (cloud/relay socket)' : 'no (local.* is EMPTY_LOCAL on /o/)',
      relay: cloud ? 'proxied cloud stream' : 'no',
    },
    transient: TRANSIENT.test(name), exprSafe: true,
    tier: cloud ? (name.startsWith('location') ? 'matchDataPositional' : 'matchData') : null,
    missing, verification: 'observed in logs 2026-10-25..28; availability checked against proto/live.ts/local.ts',
  });
}

// 2) Zone / circle / plane / observed (GET endpoints)
const zone = [
  ['GET /getcircleinfo', 'circleInfo.CircleIndex', 'zone.index', 'local.zone.index'],
  ['GET /getcircleinfo', 'circleInfo.CircleStatus', 'zone.status', 'local.zone.status|statusLabel|moving (0 wait,1 delay?,2 move,3 ? — 3 unmapped)'],
  ['GET /getcircleinfo', 'circleInfo.Counter', 'zone.counter', 'local.zone.progress|timeLeft (derived)'],
  ['GET /getcircleinfo', 'circleInfo.MaxTime', 'zone.total', 'local.zone.total'],
  ['GET /getcircleinfo', 'circleInfo.GameTime', 'match.gameTime', null],
  ['GET /getgameglobalinfo', 'gameGlobalInfo.CircleArray[].X', 'zone.circles[].x', 'local.zone.x|nextX (derived)'],
  ['GET /getgameglobalinfo', 'gameGlobalInfo.CircleArray[].Y', 'zone.circles[].y', 'local.zone.y|nextY (derived)'],
  ['GET /getgameglobalinfo', 'gameGlobalInfo.CircleArray[].Size', 'zone.circles[].r', 'local.zone.r|nextR (derived)'],
  ['GET /getgameglobalinfo', 'gameGlobalInfo.PlaneStartLocX', 'plane.startX', null],
  ['GET /getgameglobalinfo', 'gameGlobalInfo.PlaneStartLocY', 'plane.startY', null],
  ['GET /getgameglobalinfo', 'gameGlobalInfo.PlaneStopLocX', 'plane.stopX', null],
  ['GET /getgameglobalinfo', 'gameGlobalInfo.PlaneStopLocY', 'plane.stopY', null],
  ['GET /getobservingplayer', 'observingPlayer.0', 'observed.uId', 'local.observed / local.observedTeam'],
  ['GET /getobservingplayer', 'observingPlayer.GunADS', 'observed.gunAds', null],
];
for (const [k, p, norm, local] of zone) {
  const f = inv[k].fields[p] || { types: ['?'] };
  entries.push({
    id: norm, category: norm.split('.')[0] === 'observed' ? 'spectator' : norm.startsWith('plane') ? 'plane' : norm === 'match.gameTime' ? 'match-timing' : 'zone',
    ...base(k, p, f), normalizedName: norm, unit: /Size|\.X|\.Y|Plane/.test(p) ? 'cm (game units)' : /Counter|MaxTime|GameTime/.test(p) ? 's' : null,
    collection: p.includes('[]') ? 'circles' : null,
    availability: { cloudWire: false, cloudScope: null, liveScope: null, localScope: local, editor: local ? 'sample only (SAMPLE_LOCAL)' : 'no', publishedRuntime: 'no (local.* is EMPTY_LOCAL on /o/)', relay: 'no (relay polls only weapon detail)' },
    transient: true, exprSafe: true, tier: null,
    missing: ['relay localFeed', 'OverlayRuntime local scope', ...(local ? [] : ['not normalized into local.*']), 'registry entry'],
    verification: 'observed in logs; consumers: desktop useLocalGame.ts, replay.rs, director',
  });
}

// 3) Weapon detail (GET, relay already polls it)
const wk = 'GET /getplayerweapondetailinfo';
for (const [p, f] of Object.entries(inv[wk].fields)) {
  if (f.types.includes('object') || p === 'playerweapondetailinfo' || p.endsWith('[]') && f.types.includes('array')) continue;
  entries.push({
    id: `weapon.${p.replace(/^playerweapondetailinfo\[\]\./, '')}`, category: 'weapons', ...base(wk, p, f),
    normalizedName: p.replace(/^playerweapondetailinfo\[\]\./, ''), unit: /Time/.test(p) ? 's' : null, collection: 'players[].weapons[]',
    availability: { cloudWire: false, cloudScope: null, liveScope: null, localScope: null, editor: 'no', publishedRuntime: 'no', relay: 'yes — GET /local/weapon-details (themes only, PascalCase)' },
    transient: false, exprSafe: true, tier: null,
    missing: ['binding root (e.g. local.players[].weapons)', 'camelCase normalization', 'RoomID precision loss (JS number > 2^53)', 'registry entry'],
    verification: 'observed in logs; relay pollWeaponDetail (server.cjs ~1293)',
  });
}

// 4) POST-only events: not readable by any client today.
for (const [k, s] of Object.entries(inv)) {
  if (!k.startsWith('POST ') || ['POST /setcircleinfo', 'POST /setobservingplayer', 'POST /setgameglobalinfo', 'POST /setplayerweapondetailinfo'].includes(k)) continue;
  const fields = Object.entries(s.fields).filter(([p, f]) => p !== '(root)' && !f.types.includes('object'));
  const list = fields.length ? fields : [['(no parsable body)', { types: ['n/a'] }]];
  for (const [p, f] of list) {
    entries.push({
      id: `event.${k.slice(6)}.${p}`, category: /kill/.test(k) ? 'killfeed' : /backpack/.test(k) ? 'inventory' : /revive|dead/.test(k) ? 'health-revive' : /assist/.test(k) ? 'combat-events' : /airdrop/.test(k) ? 'airdrop' : /sight|weaponinfo/.test(k) ? 'weapons' : /saminfo/.test(k) ? 'inventory' : 'match-timing',
      ...base(k, p, f), normalizedName: null, unit: null, collection: p.includes('[]') ? p.split('[]')[0] : null,
      availability: { cloudWire: false, cloudScope: null, liveScope: null, localScope: null, editor: 'no', publishedRuntime: 'no', relay: 'no' },
      transient: true, exprSafe: true, tier: null,
      missing: ['POST-only: :10086 exposes no GET mirror (G1 probe BLOCKED — feed offline 2026-10-28); needs a read endpoint on the :10086 server or a capture point the project controls'],
      verification: 'observed in logs only (util.inspect bodies, nested arrays truncated)',
    });
  }
}

// 5) Shared mirrors of POST data already readable via GET (setcircleinfo etc.) are recorded under their GET entries.
const summary = {
  generated: '2026-10-28', sessionSeconds: SESSION_SECONDS, logs: ['log-20261025.txt', 'log-20261026.txt', 'log-20261027.txt', 'log-20261028.txt'],
  counts: {
    total: entries.length,
    publishedRuntimeYes: entries.filter((e) => String(e.availability.publishedRuntime).startsWith('yes')).length,
    liveScope: entries.filter((e) => e.availability.liveScope).length,
    localScope: entries.filter((e) => e.availability.localScope).length,
    postOnlyUnreadable: entries.filter((e) => e.id.startsWith('event.')).length,
  },
  supportedDefinition: 'sourced + normalized + selectable + previewable + rendered in the intended runtime (spec 2.2). Nothing is "supported" by that bar until a registry entry exists — see missing[].',
};
fs.writeFileSync(outPath, JSON.stringify({ summary, fields: entries }, null, 1));
console.log(summary.counts);
