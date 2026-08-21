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
export function mergeTeamsWithPlayers(prevTeams: any[], incomingTeams: any[]): any[] {
  const playerKey = (p: any) => String(p?.uId ?? p?.docId ?? p?._id ?? '');
  const incomingById = new Map(incomingTeams.map((t) => [String(t.teamId ?? t._id), t]));

  const merged = prevTeams.map((prevTeam) => {
    const key = String(prevTeam.teamId ?? prevTeam._id);
    const incomingTeam = incomingById.get(key);
    if (!incomingTeam) return prevTeam; // team wasn't in this delta at all — untouched

    const prevPlayers: any[] = prevTeam.players || [];
    const incomingPlayers: any[] = incomingTeam.players || [];
    const incomingPlayersById = new Map(incomingPlayers.map((p) => [playerKey(p), p]));
    const mergedPlayers = prevPlayers.map((prevPlayer) => {
      const incomingPlayer = incomingPlayersById.get(playerKey(prevPlayer));
      return incomingPlayer ? { ...prevPlayer, ...incomingPlayer } : prevPlayer;
    });
    const knownPlayerIds = new Set(prevPlayers.map(playerKey));
    for (const p of incomingPlayers) {
      if (!knownPlayerIds.has(playerKey(p))) mergedPlayers.push(p); // new player, first tick for them
    }

    return { ...prevTeam, ...incomingTeam, players: mergedPlayers };
  });

  const knownTeamIds = new Set(prevTeams.map((t) => String(t.teamId ?? t._id)));
  for (const t of incomingTeams) {
    if (!knownTeamIds.has(String(t.teamId ?? t._id))) merged.push(t); // new team, first tick for it
  }
  return merged;
}
