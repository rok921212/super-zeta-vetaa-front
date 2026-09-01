# Theme Architecture Audit

_Audit of all 7 broadcast themes (`front/src/Themes/Theme1..Theme7`) against the
required architecture: **one** realtime socket + data pipeline + hooks + sorting +
feature logic shared by every theme; themes differ **only** in HTML/JSX + CSS._

> **Remediation status (2026-08-29).** Phase 1 + Phase 2 landed and are
> `npm run build`-verified. Fixed: standings `totalScore` bug (B1/B2 →
> `buildOverallStandings` / `pickStandingTeam`); orphan `TopFragger.tsx` + dead
> code deleted (C1, E4, E5); `Upper.tsx` (A2), `LiveFrags.tsx` (A1), `Dom.tsx`
> (A3), `Alerts.tsx` (A4), `Achieve.tsx` (A5), `LiveStats.tsx` recall + `hasLiveState5`
> + match-1 gate (A6/A7/D1), inline `isDead` (A8) — all ×7, on shared hooks.
> New shared modules: `hooks/{recallEvents,killMilestones,liveKillFeed,liveDerived}.ts`,
> `components/{RecalledOverlay,TeamRecallOverlay}.tsx`, plus additions to
> `officialStandings.ts` / `fraggerScore.ts` / `unsortteams.ts`.
> Phase 3 (also landed): E1 → `hooks/matchTotals.ts` (`computeMatchTotals`) +
> `officialStandings.computeMatchStandings`; migrated `MatchSummary` ×7,
> `MatchData` ×7, `RosterShowCase` ×5, `WwcdStats` ×7, `WwcdSummary` ×7, `teamh2h`
> ×7. E2 → `placePoints===10` → `isWinningPlacement` across `Schedule` ×7 +
> `HighlightSchedule` ×4 + the `MatchData`/`RosterShowCase` icon sites. E3 →
> `buildFraggerPool` skips unplayed matches; T4 `OverallFrags` pre-filter removed.
> E6 → `RosterShowCase` routes through `computeMatchStandings`.
>
> **Everything in this audit is now remediated.** Only remaining direct
> `compareOfficialStandings` use is the T3/T7 `OverAllData` overall-only fallback
> (which passes `totalScore` correctly).

Status legend: **shared** = consumes the canonical owner · **theme-local** =
divergent implementation living in the theme · **n/a** = feature/file absent.

---

## 1. Already shared and correct — do NOT reimplement

| Concern | Canonical owner |
| --- | --- |
| The single Socket.IO connection, relay↔cloud hot-swap, infinite reconnect | `dashboard/socketManager.tsx` — `SocketManager` singleton; the **only** `io()` call in `front/src` |
| `joinRoundRoom` / `leaveRoundRoom`, `liveMatchUpdate` / `overallDataUpdate` / `roundStructureChanged` listeners, `followSelected`, match-switch boundary reset, localStorage seed, HTTP bulk hydration | `dashboard/PublicThemeRenderer.tsx` |
| Protobuf/msgpack decode, proto→object remap, team+player **delta merge**, dedupe, normalization | `dashboard/matchTeamMerge.ts` — `mergeTeamsWithPlayers`, `normalizeMatchTeams`, `remapProtoTeam/Player` |
| Client append-only elimination snapshot + ordered `deadTeamList` prop | `PublicThemeRenderer.tsx` — `isTeamAllDead`, `computeDeadTeamList`, `sortDeadTeamList` |
| **Recall-safe** team elimination: per-tick `isAllDead` (toggles back on recall) vs permanent `isEliminationLocked` (frozen at first wipe, **never** keyed on `health===0`) | `shared/hooks/unsortteams.ts` — `useSortedTeams`, `isPlayerDead`, `isRondoMap`, `RECALL_MAPS` |
| Team sort + derived stats (`totalKills`, `aliveCount`, `teamRank`, `totalPoints`, `hasOutsideBlueCircle`) | `shared/hooks/unsortteams.ts` — `useSortedTeams` (`sortBy`: `live` / `overall` / `liveUntilDead`) |
| Cross-match standings + official PUBG tie-break + WWCD test | `shared/hooks/officialStandings.ts` — `computeRankedStandings`, `buildStandings`, `compareOfficialStandings`, `isWinningPlacement`, `getLastMatchPlacePoints` |
| MVP / fragger pool + weighted "Gunslinger" score | `shared/hooks/fraggerScore.ts` — `buildFraggerPool`, `computeFraggerScores`, `compareFraggerScore` |

**Socket invariant already holds.** Grep of `front/src/Themes/**` returns zero
`io(` / `io.connect` / `new Socket` / `SocketManager` / `socket.on(` /
`socket.emit(` / `joinRoundRoom` / `liveMatchUpdate` / `overallDataUpdate`. Every
theme file carries a `// SocketManager import removed` note. No theme decodes
msgpack/protobuf, merges deltas, or opens a connection. Data reaches every theme
as already-decoded / deduped / merged / normalized props (`matchData`,
`overallData`, `deadTeamList`, `matches`, `matchDatas`).

`Theme{6,7}/on-screen/LiveData.tsx`, despite the name, are **not** socket layers —
header comments confirm "SocketManager import removed… PublicThemeRenderer owns
the single socket"; they consume `useSortedTeams` off props.

---

## 2. Feature matrix

| Feature | T1 | T2 | T3 | T4 | T5 | T6 | T7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Socket connection | shared | shared | shared | shared | shared | shared | shared |
| joinRoundRoom | shared | shared | shared | shared | shared | shared | shared |
| liveMatchUpdate listener | shared | shared | shared | shared | shared | shared | shared |
| overallDataUpdate listener | shared | shared | shared | shared | shared | shared | shared |
| Data normalization | shared | shared | shared | shared | shared | shared | shared |
| Team/player merging | shared | shared | shared | shared | shared | shared | shared |
| Match switching | shared | shared | shared | shared | shared | shared | shared |
| followSelected | shared | shared | shared | shared | shared | shared | shared |
| **Player sorting (live kill feed)** | local `on-screen/LiveFrags.tsx` | local | local | local | local | local (+`Achieve.tsx`) | local (+`Achieve.tsx`) |
| **Team sorting (Upper strip)** | local `on-screen/Upper.tsx` | local | local | local | local | local | local |
| Team sorting (LiveStats/Alerts/LiveData) | shared `useSortedTeams` | shared | shared | shared | shared | shared | shared |
| **Placement / standings sorting** | local `off-screen/OverAllData.tsx` (no `totalScore`) | local (no `totalScore`) | **shared** `computeRankedStandings` | local (no `totalScore`) | local (no `totalScore`) | local (no `totalScore`) | **shared** `computeRankedStandings` |
| Champions / RunnerUp winner pick | local (no `totalScore`) | local | local (no `totalScore`) | local | local | local | local (no `totalScore`) |
| **Kill milestone engine** (`Dom.tsx`) | local (subset) | local | local | local | local | local | local |
| **Elimination alert trigger** (`Alerts.tsx`) | local re-derive | local re-derive | **shared** `deadTeamList` prop | local re-derive | local re-derive | local re-derive | local re-derive |
| Elimination lock / dead-team snapshot | shared | shared | shared | shared | shared | shared | shared |
| **Recall — team lock safety** | shared `useSortedTeams` | shared | shared | shared | shared | shared | shared |
| **Recall — RECALLED banner in LiveStats** | none | none | none | none | none | **full** `isRondoMap`+per-player detector | none (regressed vs T6) |
| Recall — dedicated `Recall.tsx` view | n/a | n/a | n/a | n/a | n/a | local detector | local detector (byte-identical to T6) |
| LiveStats data source | shared props + `useSortedTeams` | shared | shared | shared | shared (+local `hasLiveState5`) | shared | shared |
| LiveStats `overallData` gating | always | always | always | `matchNo===1?null` | `matchNo===1?null` | always | always |
| Health handling | presentation (reads `health`/`healthMax`) | presentation | presentation | presentation | presentation (+`parseInt(p.health)` in `Upper.tsx:153`) | presentation | presentation |
| Dead-player predicate | inline `liveState===5\|\|bHasDied` ×N | inline ×N | inline ×N | inline ×N | inline + `parseInt(liveState)===5` | inline + shared `isPlayerDead` (LiveStats) | inline ×N |
| WWCD calc (`isWinningPlacement`) | mixed: shared in Wwcd*/MatchData; `placePoints===10` in Schedule; local "WWCD %" gauge in `Upper.tsx` | mixed | mixed | mixed | mixed | mixed | mixed |
| MVP calc (off-screen) | shared `fraggerScore` | shared | shared | shared (+dead local aggr in `mvp.tsx`) | shared | shared (+local `Achieve.tsx`) | shared (+local `Achieve.tsx` re-impl of `buildFraggerPool`) |
| Player H2H | shared `fraggerScore` | shared | shared | shared | shared | shared | shared |
| Team H2H | shared `officialStandings` | shared | shared | shared | shared | shared | shared |
| MatchSummary aggregate tiles | local `reduce` | local `reduce` | local `reduce` | local `reduce` (different field set) | local `reduce` | local `reduce` | local `reduce` |
| Own data fetch (extra) | n/a | n/a | n/a | **`off-screen/TopFragger.tsx`** `api.get` (orphan) | **`TopFragger.tsx`** (orphan) | **`TopFragger.tsx`** (orphan) | **`TopFragger.tsx`** (orphan) |

---

## 3. Per-component findings

### GOOD — presentation-only (no action)

- `Lower.tsx`, `intro.tsx`, `mapPreview.tsx`, `slots.tsx` (all themes) — SVG/grid
  off `tournament`/`round`/`match`/`teams` props; `slice` only.
- `CommingUpNext.tsx` — sorts `matches` by `matchNo` (schedule order, not ranking).
- `playerh2h.tsx`, `EventMvp.tsx`, `MatchFragrs.tsx` top-players block,
  `OverallFrags.tsx` (T1/2/3/5/6), `mvp.tsx` player block — use shared fragger hooks.
- `Theme3/on-screen/Alerts.tsx` — **reference**: elimination driven purely by the
  `deadTeamList` prop.
- `Theme3/off-screen/OverAllData.tsx`, `Theme7/off-screen/OverAllData.tsx` —
  **reference**: `return computeRankedStandings(matchDatas)`.
- `Theme6/on-screen/LiveStats.tsx` recall block — **reference** for recall UX.
- `Theme{6,7}/on-screen/LiveData.tsx` — consume `useSortedTeams`; the trailing
  `.sort(b.totalKills-a.totalKills)` just re-orders already-sorted data.
- LiveStats/Upper/LiveFrags health-bar blocks — health-ratio → bar height/colour
  is presentation. (Minor: inline `isDead` recompute — see BAD-mild below.)

### BAD — divergent business/data logic (move to shared)

| # | Files | What | Fix |
| --- | --- | --- | --- |
| A1 | `Theme{1..7}/on-screen/LiveFrags.tsx` | local `flatMap` + `.sort(b.killNum-a.killNum).slice(5)` + local `isTeamAllDead` | `useLiveKillFeed()` |
| A2 | `Theme{1..7}/on-screen/Upper.tsx` | local `aliveCount = filter(!bHasDied)`, local `totalKills` reduce, sort by alive-count, local "WWCD %" gauge | `useSortedTeams(_, null, 'live')` + `wwcdChance()` |
| A3 | `Theme{1..7}/on-screen/Dom.tsx` | hand-rolled kill-milestone engine; **mutually divergent** (T1 subset; `UNSTOPPABLE`/`UNSTOPABLE`; 500/600 dmg) | `useKillMilestones()`; theme keeps card SVG + label map + timing |
| A4 | `Theme{1,2,4,5,6,7}/on-screen/Alerts.tsx` | ignore `deadTeamList` prop; re-derive from `useSortedTeams` + `everAliveRef` | consume `deadTeamList` prop (mirror T3) |
| A5 | `Theme{6,7}/on-screen/Achieve.tsx` | local per-category leader ranking; **T7 re-implements `buildFraggerPool`** | `buildFraggerPool` + `pickLeader()` |
| A6 | `Theme5/on-screen/LiveStats.tsx` | `hasLiveState5 = every(parseInt(liveState)===5)` — ignores `bHasDied` | `team.isAllDead` from `useSortedTeams` |
| A7 | `Theme{4,5}/on-screen/LiveStats.tsx` | `useSortedTeams(_, matchNo===1?null:overallData, _)` | pass `overallData` unconditionally |
| A8 | ~15 sites (LiveStats/Upper/LiveFrags, all themes) | inline `isDead = liveState===5 \|\| bHasDied` | import `isPlayerDead` |
| B1 | `Theme{1,2,4,5,6}/off-screen/OverAllData.tsx` | `compareOfficialStandings({...})` **without `totalScore`** → primary key silently skipped, ranks WWCD-first; inconsistent "matches played" gates | `computeRankedStandings(matchDatas)` / `buildStandings` |
| B2 | `Theme{1..7}/off-screen/{Champions,1stRunnerUp,2ndRunnerUp}.tsx`, `Theme{4,5,6}/off-screen/HighlightPoints.tsx` | same missing-`totalScore` winner pick | `computeRankedStandings(matchDatas)[0\|1\|2]` |
| C1 | `Theme{4,5,6,7}/off-screen/TopFragger.tsx` | imports `login/api.tsx`; `api.get('/public/rounds/:id/matches')` + N× `api.get('/public/matches/:id/matchdata')`. **Unreachable** (no `renderView` case, no `FALLBACKS` entry) | delete (reachable equiv = `EventMvp`) |
| D1 | `Theme6/on-screen/LiveStats.tsx` (recall detector), `Theme{6,7}/on-screen/Recall.tsx` (byte-identical) | per-player dead→alive detector duplicated 3× | `shared/hooks/recallEvents.ts` + `shared/components/RecalledOverlay.tsx` |
| D2 | `Theme{1,4,5,7}/on-screen/LiveStats.tsx` | no `isAllDead` true→false→true `EliminatedOverlay` re-fire (T2/T3/T6 have it) | `useEliminationEdge()` helper, wire all 7 |
| E1 | `Theme{1..7}/off-screen/MatchSummary.tsx` | local `reduce` over players for tiles; T4 uses a different field set | `computeMatchTotals()` |
| E2 | `Theme{1..7}/off-screen/{Schedule,HighlightSchedule,MatchData}.tsx` | `team.placePoints === 10` as the win test | `isWinningPlacement(placePoints, players[0]?.rank)` |
| E3 | `Theme4/off-screen/OverallFrags.tsx` | pre-filters to `placePoints===10` "completed" matches before `buildFraggerPool` → different MVP list from T1/2/3/5/6 | `isMatchPlayed` filter inside `buildFraggerPool`; drop local filter |
| E4 | `Theme{1,2,3,7}/off-screen/MatchFragrs.tsx`, `Theme4/off-screen/mvp.tsx`, `Theme5/on-screen/LiveStats.tsx` | dead `useMemo` / unused local aggregation | delete |
| E5 | `Theme2/on-screen/realTime.tsx` | empty 0-byte file | delete |
| E6 | `Theme1/off-screen/RosterShowCase.tsx` | on-disk file shadows the `Theme4` `FALLBACKS` entry and re-implements single-match standings | route through shared rollup / `useSortedTeams` |

### BAD-mild / cosmetic

- `Theme{1,2,3,4}/off-screen/{MatchData,RosterShowCase}.tsx` — single-match team
  sort uses the shared comparator but re-does the kill `reduce` + map/sort inline.
- `Theme{1,2,5,6}/off-screen/OverAllData.tsx` re-implement rank-change loop that
  `computeRankedStandings` already provides.

---

## 4. Remediation map

| Divergence | Collapses into |
| --- | --- |
| A1 LiveFrags feed | `shared/hooks/liveKillFeed.ts` → `useLiveKillFeed` |
| A2 Upper strip | `useSortedTeams('live')` + `shared/hooks/liveDerived.ts` → `wwcdChance` |
| A3 Dom milestones | `shared/hooks/killMilestones.ts` → `useKillMilestones` |
| A4 Alerts trigger | existing `deadTeamList` prop (canonical, from `sortDeadTeamList`) |
| A5 Achieve leaders | `buildFraggerPool` + new `fraggerScore.pickLeader` |
| A6/A7/A8 LiveStats | `useSortedTeams` derived fields + `isPlayerDead` |
| B1/B2 standings | `officialStandings.computeRankedStandings` / `buildStandings` |
| C1 TopFragger | deleted |
| D1 recall detector | `shared/hooks/recallEvents.ts` + `shared/components/RecalledOverlay.tsx` |
| D2 elimination edge | `unsortteams.useEliminationEdge` |
| E1 match tiles | `shared/hooks/matchTotals.ts` → `computeMatchTotals` |
| E2 win test | `officialStandings.isWinningPlacement` |
| E3 fragger pool input | `isMatchPlayed` filter inside `buildFraggerPool` |

---

## 5. Known gaps NOT addressed in this pass

- **Theme2 view coverage** — several view files are absent on disk (`intro`,
  `mapPreview`, and several `off-screen/*`). `PublicThemeRenderer.resolveComponent`
  renders a "not implemented" placeholder for a missing per-theme view. This is a
  view-**parity** gap, not a logic divergence — left as-is.
- Backend wire shape (`Render_hosted/test-back`) is out of scope.
