// Manual, one-off verification for the CLIENT-side merge/remap contract in
// dashboard/matchTeamMerge.ts (extracted from PublicThemeRenderer.tsx so it
// can be required and exercised directly, mirroring the backend's own
// scripts/verify-team-delta.js / verify-player-delta.js /
// verify-protobuf-delta.js convention). Runs the ACTUAL production
// mergeTeamsWithPlayers/remapProtoPlayer/remapProtoTeam functions, not a
// hand-ported duplicate. Requires Node 22.6+/24 (native TS type-stripping,
// no build step). NOT wired into npm start/CI.
//   Run: node scripts/verify-client-merge.js
const {
  remapProtoPlayer,
  remapProtoTeam,
  mergeTeamsWithPlayers,
  normalizeMatchTeams,
} = require('../src/dashboard/matchTeamMerge.ts');

const results = [];
const pass = (msg) => results.push(`PASS: ${msg}`);
const fail = (msg) => results.push(`FAIL: ${msg}`);

function synthPlayer(n, overrides = {}) {
  return {
    _id: `p${n}`,
    uId: `u${n}`,
    playerName: `Player ${n}`,
    teamId: 1,
    killNum: 0,
    health: 100,
    location: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}
function synthTeam(slot, overrides = {}) {
  return {
    teamId: String(slot),
    teamName: `Team ${slot}`,
    slot,
    placePoints: 0,
    players: [synthPlayer(`${slot}-1`), synthPlayer(`${slot}-2`)],
    ...overrides,
  };
}

// --- 1. A team absent from the incoming delta is left completely untouched ---
const prevTeams1 = [synthTeam(1), synthTeam(2), synthTeam(3)];
const incoming1 = [{ ...synthTeam(2), players: [{ ...synthPlayer('2-1'), killNum: 5 }] }]; // only team 2, only its first player changed
const merged1 = mergeTeamsWithPlayers(prevTeams1, incoming1);
const team1Untouched = merged1.find((t) => t.teamId === '1');
(merged1.length === 3 && team1Untouched && JSON.stringify(team1Untouched) === JSON.stringify(prevTeams1[0]))
  ? pass('Team absent from the delta (team 1) is byte-for-byte untouched')
  : fail(`Team absent from delta: length=${merged1.length}, team1 unchanged=${JSON.stringify(team1Untouched) === JSON.stringify(prevTeams1[0])}`);

// --- 2. A team present with a PARTIAL players array merges those fields onto
//        the prior full roster — the untouched teammate keeps every field ---
const team2Merged = merged1.find((t) => t.teamId === '2');
const team2Player1 = team2Merged.players.find((p) => p._id === 'p2-1');
const team2Player2 = team2Merged.players.find((p) => p._id === 'p2-2');
(team2Merged.players.length === 2 && team2Player1.killNum === 5 && team2Player1.health === 100 && JSON.stringify(team2Player2) === JSON.stringify(prevTeams1[1].players[1]))
  ? pass('Partial delta on team 2: changed player got killNum=5 while keeping untouched health=100, sibling player fully untouched')
  : fail(`Partial delta on team 2: players=${team2Merged.players.length}, p1.killNum=${team2Player1?.killNum}, p1.health=${team2Player1?.health}, p2 unchanged=${JSON.stringify(team2Player2) === JSON.stringify(prevTeams1[1].players[1])}`);

// --- 3. Brand-new team (first tick for it) is added wholesale ---
const prevTeams3 = [synthTeam(1)];
const newTeam = synthTeam(99);
const merged3 = mergeTeamsWithPlayers(prevTeams3, [newTeam]);
(merged3.length === 2 && JSON.stringify(merged3.find((t) => t.teamId === '99')) === JSON.stringify(newTeam))
  ? pass('Brand-new team (first tick) added wholesale, unrelated to any prior team')
  : fail(`Brand-new team: length=${merged3.length}, matches=${JSON.stringify(merged3.find((t) => t.teamId === '99')) === JSON.stringify(newTeam)}`);

// --- 4. Brand-new player within an already-known team is appended, not dropped ---
const prevTeams4 = [synthTeam(1)]; // 2 players
const newPlayerDelta = [{ ...synthTeam(1), players: [synthPlayer('1-3', { killNum: 9 })] }]; // a 3rd player showing up
const merged4 = mergeTeamsWithPlayers(prevTeams4, newPlayerDelta);
const team1After = merged4.find((t) => t.teamId === '1');
(team1After.players.length === 3 && team1After.players.some((p) => p._id === 'p1-3' && p.killNum === 9))
  ? pass('New player appearing mid-match (roster growth) is appended, existing 2 teammates untouched')
  : fail(`New player append: players=${team1After.players.length}, has new player=${team1After.players.some((p) => p._id === 'p1-3')}`);

// --- 5. remapProtoPlayer/remapProtoTeam correctly rename docId -> _id and
//        leave a sparse (partial, protobuf-decoded) player otherwise intact ---
const protoDecodedPlayer = { docId: 'p42', uId: 'u42', killNum: 7 }; // sparse: no health/liveState/etc, as a real partial decode would look
const remappedPlayer = remapProtoPlayer(protoDecodedPlayer);
(remappedPlayer._id === 'p42' && !('docId' in remappedPlayer) && remappedPlayer.uId === 'u42' && remappedPlayer.killNum === 7 && !('health' in remappedPlayer))
  ? pass('remapProtoPlayer: docId->_id renamed, sparse fields (no health) stay genuinely absent, present fields untouched')
  : fail(`remapProtoPlayer: ${JSON.stringify(remappedPlayer)}`);

const protoDecodedTeam = { docId: 't42', teamId: '42', teamName: 'Team 42', players: [protoDecodedPlayer] };
const remappedTeam = remapProtoTeam(protoDecodedTeam);
(remappedTeam._id === 't42' && !('docId' in remappedTeam) && remappedTeam.players.length === 1 && remappedTeam.players[0]._id === 'p42')
  ? pass('remapProtoTeam: docId->_id renamed, nested players remapped via remapProtoPlayer')
  : fail(`remapProtoTeam: ${JSON.stringify(remappedTeam)}`);

// --- 6. End-to-end: a protobuf-shaped partial player runs through
//        remapProtoPlayer THEN mergeTeamsWithPlayers and comes out with every
//        untouched field intact — the exact client-side mirror of what
//        scripts/verify-protobuf-delta.js already proved on the encode side ---
const prevTeams6 = [{ teamId: '5', teamName: 'Team 5', players: [{ _id: 'p5', uId: 'u5', killNum: 2, health: 80, assists: 3 }] }];
// A real delta always carries the routing fields (uId/docId) — see the
// backend's PLAYER_ROUTING_FIELDS — so mergeTeamsWithPlayers can key the
// partial player onto the prior full one. Only `health` actually changed.
const rawProtoDeltaTeam = { docId: 't5', teamId: '5', players: [{ docId: 'p5', uId: 'u5', health: 60 }] };
const remappedDeltaTeam = remapProtoTeam(rawProtoDeltaTeam);
const merged6 = mergeTeamsWithPlayers(prevTeams6, [remappedDeltaTeam]);
const player6 = merged6[0].players[0];
(player6._id === 'p5' && player6.health === 60 && player6.killNum === 2 && player6.assists === 3 && player6.uId === 'u5')
  ? pass('End-to-end (remap + merge): changed field (health=60) applied, untouched fields (killNum=2, assists=3, uId) retained from prior state')
  : fail(`End-to-end: ${JSON.stringify(player6)}`);

// --- 7. Display strings (picUrl/showPicUrl/character/teamName + team's
//        teamName/teamTag/teamLogo) are `optional` on the wire now — a delta
//        that OMITS them (unchanged) must not blank the prior value ---
const prevTeams7 = [{
  teamId: '7', _id: 't7', teamName: 'Alpha', teamTag: 'ALP', teamLogo: 'https://cdn/alpha.png',
  placePoints: 3,
  players: [{ _id: 'p7', uId: 'u7', playerName: 'Neo', picUrl: 'https://cdn/neo.jpg', character: 'X', killNum: 1 }],
}];
// protobuf-decoded delta: only placePoints + a player's killNum moved; every
// display string is genuinely absent (decoded `optional` unset).
const displaylessDelta = remapProtoTeam({
  docId: 't7', teamId: '7', placePoints: 4,
  players: [{ docId: 'p7', uId: 'u7', killNum: 2 }],
});
const merged7 = mergeTeamsWithPlayers(prevTeams7, [displaylessDelta]);
const t7 = merged7[0];
const p7 = t7.players[0];
(t7.teamName === 'Alpha' && t7.teamTag === 'ALP' && t7.teamLogo === 'https://cdn/alpha.png' && t7.placePoints === 4
  && p7.playerName === 'Neo' && p7.picUrl === 'https://cdn/neo.jpg' && p7.character === 'X' && p7.killNum === 2)
  ? pass('Display-less delta: team & player display strings retained from prior state, only placePoints/killNum updated')
  : fail(`Display-less delta clobbered strings: ${JSON.stringify(t7)}`);

// --- 8. Duplicate team in prevTeams collapses to one, and the incoming delta
//        merges into that single record (not into both copies) ---
const dupTeam = synthTeam(1);
const prevTeams8 = [dupTeam, { ...dupTeam }, synthTeam(2)]; // team 1 twice
const merged8 = mergeTeamsWithPlayers(prevTeams8, [
  { ...synthTeam(1), players: [{ ...synthPlayer('1-1'), killNum: 4 }] },
]);
const team1Copies = merged8.filter((t) => String(t.teamId) === '1');
(merged8.length === 2 && team1Copies.length === 1 && team1Copies[0].players.find((p) => p._id === 'p1-1').killNum === 4)
  ? pass('Duplicate team in prevTeams collapses to one; delta merges into the single record')
  : fail(`Dedupe teams: length=${merged8.length}, team1 copies=${team1Copies.length}`);

// --- 9. Duplicate player within a prev team collapses to one ---
const prevTeams9 = [{ teamId: '3', _id: 't3', players: [
  { _id: 'p3a', uId: 'u3', killNum: 1 },
  { _id: 'p3b', uId: 'u3', killNum: 1 }, // same uId -> duplicate
] }];
const merged9 = mergeTeamsWithPlayers(prevTeams9, [{ teamId: '3', players: [{ uId: 'u3', killNum: 6 }] }]);
(merged9[0].players.length === 1 && merged9[0].players[0].killNum === 6)
  ? pass('Duplicate player (same uId) within a team collapses to one, delta applied once')
  : fail(`Dedupe players: count=${merged9[0].players.length}, killNum=${merged9[0].players[0]?.killNum}`);

// --- 10. _id is pinned from the previous record even when the incoming tick
//         carries a freshly-regenerated _id (backend does this every tick) —
//         this is what keeps React `key={player._id}` / `key={team._id}` stable ---
const prevTeams10 = [{ teamId: '4', _id: 't4-old', players: [{ _id: 'p4-old', uId: 'u4', health: 100 }] }];
const regenDelta = [{ teamId: '4', _id: 't4-NEW', players: [{ _id: 'p4-NEW', uId: 'u4', health: 70 }] }];
const merged10 = mergeTeamsWithPlayers(prevTeams10, regenDelta);
(merged10[0]._id === 't4-old' && merged10[0].players[0]._id === 'p4-old' && merged10[0].players[0].health === 70)
  ? pass('_id pinned from prev (team + player) across a regenerated-id tick; stat still updates')
  : fail(`_id pin: team._id=${merged10[0]._id}, player._id=${merged10[0].players[0]._id}, health=${merged10[0].players[0].health}`);

// --- 11. Match boundary: caller passes prevTeams=[] so the incoming payload
//         becomes the authoritative base — no team from the previous match
//         can survive ---
const matchATeams = [synthTeam(1), synthTeam(2), synthTeam(3)];
const matchBDelta = [synthTeam(10), synthTeam(11)];
const merged11 = mergeTeamsWithPlayers([], matchBDelta);
(merged11.length === 2 && merged11.every((t) => ['10', '11'].includes(String(t.teamId))))
  ? pass('Match boundary (prevTeams=[]): only the new match’s teams remain')
  : fail(`Match boundary: teams=${merged11.map((t) => t.teamId).join(',')}`);

// --- 12. normalizeMatchTeams: one record per team (newer roster wins, scalar
//         fields merged), players deduped within a record, id-less team dropped ---
const messy = [
  { teamId: '1', players: [{ uId: 'a' }, { uId: 'b' }] },
  { teamId: '1', teamName: 'Later', players: [{ uId: 'b' }, { uId: 'c' }] }, // same team again, newer
  { players: [{ uId: 'z' }] }, // no teamId/_id -> phantom, dropped
  { teamId: '2', players: [{ uId: 'x' }, { uId: 'x' }] }, // duplicate player
];
const norm = normalizeMatchTeams(messy);
const n1 = norm.find((t) => String(t.teamId) === '1');
const n2 = norm.find((t) => String(t.teamId) === '2');
(norm.length === 2
  && n1 && n1.teamName === 'Later' && n1.players.length === 2 && n1.players.every((p) => ['b', 'c'].includes(p.uId))
  && n2 && n2.players.length === 1)
  ? pass('normalizeMatchTeams: one record per team (newer wins, scalars merged), players deduped, id-less team dropped')
  : fail(`normalizeMatchTeams: length=${norm.length}, team1=${JSON.stringify(n1)}, team2 players=${n2?.players.length}`);

console.log('\n=== CLIENT MERGE VERIFICATION RESULTS ===');
results.forEach((r) => console.log(r));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed > 0 ? 1 : 0);
