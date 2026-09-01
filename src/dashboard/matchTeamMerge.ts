// Pure, JSX-free data-transformation functions used by
// PublicThemeRenderer.tsx's socket handlers. Extracted into their own module
// (no React, no other imports) so they can be required and exercised
// directly by a plain Node script — see scripts/verify-client-merge.js —
// the same way the backend's utils/matchTeamDiff.js is unit-verified by
// scripts/verify-team-delta.js / verify-player-delta.js.

// Proto field names can't start with `_` (grammar requires a leading
// letter), so the wire calls the Mongoose subdoc id `docId` — remap back to
// `_id` (and, for teams, keep `teamId` as its own separate field) so
// protobuf-decoded objects are byte-for-byte shape-compatible with what
// msgpack/JSON already deliver. See overlay.proto's comments on Player.docId
// / Team.docId for why these are two distinct Mongo ObjectIds, not one.
export const remapProtoPlayer = (p: any) => {
  const { docId, ...rest } = p;
  return { ...rest, _id: docId };
};

export const remapProtoTeam = (t: any) => {
  const { docId, players, ...rest } = t;
  return { ...rest, _id: docId, players: Array.isArray(players) ? players.map(remapProtoPlayer) : [] };
};

const teamKey = (t: any) => String(t?.teamId ?? t?._id ?? '');
const playerKey = (p: any) => String(p?.uId ?? p?.docId ?? p?._id ?? '');

// Collapse a players array to one record per stable key (last occurrence wins),
// preserving order of first appearance.
function dedupePlayers(players: any[]): any[] {
  const byKey = new Map<string, any>();
  for (const p of players || []) byKey.set(playerKey(p), p);
  return [...byKey.values()];
}

// Shared by PublicThemeRenderer.tsx's processLiveMatchUpdate/
// handleOverallDataUpdate. Both events carry a TEAM-LEVEL delta (only teams
// that changed since the backend's last tick), and — as of the backend's
// player-level delta (matchTeamDiff.js's computeChangedPlayers) — a changed
// team's OWN `players` array is now itself only the players that changed,
// not its whole roster. So this merges at both levels: a team present in
// `incoming` gets its scalar fields replaced wholesale (the backend always
// sends those in full for an included team) but its `players` merged by id
// onto the previous roster, so a player omitted from this tick keeps its
// last-known stats instead of disappearing/blanking out. A team entirely
// absent from `incoming` is untouched, same as before.
//
// It also GUARANTEES a normalized result: exactly one record per teamId and,
// within each team, one per player key. Without that, a single duplicate in
// `prevTeams` (from a contaminated cache seed or an earlier bad merge) renders
// as two of everything — a direct cause of the "duplicate health bar" symptom.
//
// Identity stability: `_id` is regenerated on the backend for every player and
// team on EVERY live tick (Bulkpublic.controller.js), while every theme keys
// its health bars on `key={player._id}` / `key={team._id}`. So a merged record
// KEEPS the previous `_id` — `uId`/`teamId` are the real identities and the
// merge keys; pinning `_id` is purely to hold the React key stable and stop the
// per-tick remount churn.
export function mergeTeamsWithPlayers(prevTeams: any[], incomingTeams: any[]): any[] {
  // Dedupe both sides up front (last wins, order preserved).
  const prevByKey = new Map<string, any>();
  for (const t of prevTeams || []) prevByKey.set(teamKey(t), t);
  const incomingByKey = new Map<string, any>();
  for (const t of incomingTeams || []) incomingByKey.set(teamKey(t), t);

  const merged: any[] = [];
  for (const prevTeam of prevByKey.values()) {
    const key = teamKey(prevTeam);
    const incomingTeam = incomingByKey.get(key);

    if (!incomingTeam) {
      // Not in this delta — leave byte-for-byte untouched when it has no
      // internal duplicates (the common case), only re-wrap to dedupe.
      const players: any[] = prevTeam.players || [];
      const deduped = dedupePlayers(players);
      merged.push(deduped.length === players.length ? prevTeam : { ...prevTeam, players: deduped });
      continue;
    }

    const prevPlayers = dedupePlayers(prevTeam.players || []);
    const incomingPlayers: any[] = incomingTeam.players || [];
    const incomingPlayersByKey = new Map(incomingPlayers.map((p) => [playerKey(p), p]));
    const knownPlayerIds = new Set(prevPlayers.map(playerKey));

    const mergedPlayers = prevPlayers.map((prevPlayer) => {
      const incomingPlayer = incomingPlayersByKey.get(playerKey(prevPlayer));
      return incomingPlayer
        ? { ...prevPlayer, ...incomingPlayer, _id: prevPlayer._id ?? incomingPlayer._id }
        : prevPlayer;
    });
    for (const p of incomingPlayers) {
      if (!knownPlayerIds.has(playerKey(p))) mergedPlayers.push(p); // new player, first tick for them
    }

    merged.push({
      ...prevTeam,
      ...incomingTeam,
      _id: prevTeam._id ?? incomingTeam._id,
      players: mergedPlayers,
    });
  }

  for (const t of incomingByKey.values()) {
    if (!prevByKey.has(teamKey(t))) {
      merged.push({ ...t, players: dedupePlayers(t.players || []) }); // new team, first tick for it
    }
  }
  return merged;
}

// Data-layer guarantee for anything about to be handed to a theme: exactly one
// record per teamId and, within each team, one per player key — no phantom
// (id-less) teams. Themes then never have to defend against duplicates in their
// own `.map()` keys. Applied at the HTTP-bulk boundary (applyBulkPayload); the
// socket paths get the same guarantee for free from mergeTeamsWithPlayers.
export function normalizeMatchTeams(teams: any[]): any[] {
  if (!Array.isArray(teams)) return [];
  const byKey = new Map<string, any>();
  for (const team of teams) {
    if (!team) continue;
    const key = teamKey(team);
    if (!key) continue; // phantom team with no identity — drop
    const players = dedupePlayers(Array.isArray(team.players) ? team.players : []);
    const prev = byKey.get(key);
    // Same team twice in one payload: newer record wins, shallow-merged over
    // the older so no field already present is lost.
    byKey.set(key, prev ? { ...prev, ...team, players } : { ...team, players });
  }
  return [...byKey.values()];
}
