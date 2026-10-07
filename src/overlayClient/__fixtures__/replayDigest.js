// Shared by the front jest parity suite and desktop-app/relay/test/parity.test.cjs:
// a timestamp-free fingerprint of an overlay state (engine state or SDK v1 state).
'use strict';

function digest(state) {
  const md = state.matchData;
  const status = state.status || {};
  return {
    matchId: md ? String(md.matchId) : null,
    lastSequence: status.lastSequence != null ? status.lastSequence : status.seq,
    teams: ((md && md.teams) || [])
      .map((t) => `${t.teamId}:` + (t.players || [])
        .map((p) => `${p.uId}/${p.killNum || 0}/${p.liveState || 0}`)
        .sort()
        .join(','))
      .sort(),
    dead: (state.deadTeamList || []).map((d) => String(d.teamId)),
    overall: ((state.overallData && state.overallData.teams) || []).map((t) => `${t.teamId}:${t.placePoints}`).sort(),
  };
}

/** Replace the TID / RID placeholders in a fixture subtree. */
function withIds(value, tid, rid) {
  return JSON.parse(JSON.stringify(value).replace(/"TID"/g, JSON.stringify(tid)).replace(/"RID"/g, JSON.stringify(rid)));
}

module.exports = { digest, withIds };
