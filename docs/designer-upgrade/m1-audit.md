# Milestone 1 — Audit and data contract

Date: 2026-10-28. Spec: `front/docs/designer-upgrade-spec.md`. No product code changed in this milestone.

## What I checked

- **Game-feed logs:** all four logs in `D:\code\log`, 14.5 GB in total. These are the stdout of the `:10086` game-feed server for 4 sessions, about 9.1 h, or 32,796 s.
  - The extractor read every line, giving 398,617 request records.
  - The parsed shape of every endpoint is saved in [`field-audit.json`](field-audit.json).
- **Repository paths traced:**
  - relay: `desktop-app/relay/server.cjs`
  - desktop pollers: `fetcher.rs`, `replay.rs`, `director/`, `commands.rs`, `useLocalGame.ts`, and theme BattleBars
  - backend: bulk tiers and protobuf wire (`proto/overlay.proto`)
  - overlay client and bindings: `bindings/{index,live,local}.ts`
  - runtime: `runtime/{OverlayRuntime,layoutTiers}.ts(x)`
  - editor and templates: StyleWhen presets and the element factory
- **Binaries in `D:\code`:** `server.exe` and `old server if socket crash.exe`, inspected read-only with string search only, to settle G1.

## Baseline (before any upgrade change)

| Check | Command | Result |
|---|---|---|
| Front graphics + overlayClient | `CI=true npx react-scripts test src/graphics src/overlayClient --watchAll=false` | Run 1: 611/612, 1 failed, 46 suites. Run 2: **612/612**. So **1 flaky test**; run 1's output was truncated, so the test is not named yet. |
| Relay | `npm run test:relay` (desktop-app) | **44/44 pass** |
| Backend | `npm test` (test-back) | **141 pass, 1 skipped, 0 fail** |
| Layout schema sync | `npm run schema:check` | in sync (`sha256:1f60c7f2438b6574`) |
| Production build | `npm run build` (front) | **succeeds**. `main.*.js` is 181 KB gzip; 516 files in `static/js` |

Note: an overlayClient/dashboard test opens a real socket to the production Render backend (`super-zeta-beta-back-jttd.onrender.com`) and logs after the test finishes. It is a likely source of the flaky test, and the suite should not depend on the network.

The working tree already had uncommitted changes in `front` and `Render_hosted/test-back` before this work began. These baselines are for that tree.

## Architecture map (where each field comes from)

```
 PUBG Mobile observer client
   │ POST /set*  (circle, observing, backpack, kill, revive, assist, airdrop, weapon detail, isingame …)
   ▼
 :10086 game-feed server  (server.exe, a packaged Node app; source is not in this repo)
   │ GET /gettotalplayerlist /getcircleinfo /getobservingplayer /getgameglobalinfo /getplayerweapondetailinfo
   │ GET /getkillinfo /getteaminfolist /getallinfo   ← exist in the server binary, but nothing in the repo calls them
   ▼
 Desktop app (Tauri), which polls :10086 SIX separate ways:
   fetcher.rs ─────────── gettotalplayerlist → backend socket (cloud ingest)
   replay.rs ──────────── totalplayerlist 500 ms, circle 1 s, global 5 s → .ssr recording
   director/mod.rs ────── totalplayerlist + observing, 250 ms tick
   commands.rs proxies ← useLocalGame.ts (players 1 s, info 15 s), Theme1/2 BattleBar (1 s),
                          Component2 map (1 s), PlayerKillsBar
   relay/server.cjs ───── getplayerweapondetailinfo, ~3 s → GET /local/weapon-details
   ▼
 Cloud backend (Render): MatchData model → protobuf/msgpack deltas → socket rooms
   round:<t>:<r>:matchData | :matchDataPositional | :overall, plus /api/public/bulk
   ▼
 relay :8787 (one upstream socket, fans out to local overlays) ── or the cloud directly
   ▼
 overlayClient/engine.ts  (state: tournament, round, match, matchData, overallData, derived)
   ▼
 bindings/buildScope: tournament … derived · live (live.ts) · feed (detectors) · local (local.ts)
   │                    local = EMPTY_LOCAL on /o/, SAMPLE_LOCAL in the editor
   ▼
 LayoutRenderer, shared by editor and /o/  (OverlayRuntime passes state but no local)
```

**Revisions and reconnects.** `/o/:publicId` fetches `/api/overlay-render/:publicId`, validates and migrates the layout, then swaps it in. It re-checks for a new published version every 60 s. On reconnect, the engine refetches the bulk payload and re-joins the socket room. The relay replays its cached structure, snapshot and overall data to each new joiner (`server.cjs` ~1763-1779).

## What the game feed provides (measured)

| Endpoint | Calls | Rate per session | Avg / max body | Read by |
|---|---|---|---|---|
| GET /gettotalplayerlist | 217,738 | **6.6/s** (max 10/s) | 59.6 KB / 71 KB | 6 desktop pollers |
| GET /getcircleinfo | 22,340 | 0.68/s | 101 B | replay, useLocalGame |
| GET /getobservingplayer | 19,777 | 0.60/s | 55 B | director, useLocalGame |
| GET /getplayerweapondetailinfo | 10,538 | 0.32/s (about every 3 s) | **143 KB / 388 KB** | relay |
| GET /getgameglobalinfo | 4,492 | 0.14/s | 360 B | replay, useLocalGame |
| POST /setcircleinfo | 43,668 | 1.33/s | 123 B | — |
| POST /setobservingplayer | 40,409 | 1.23/s; 88 % have an empty body | 8 B | — |
| POST /totalmessage | 15,946 | 0.49/s | body not logged | — |
| POST /setteambackpackinfo | 10,912 | 0.33/s | 2.6 KB | **nobody** |
| POST /setgameglobalinfo | 9,105 | 98 % have an empty body | — | — |
| POST /setkillinfo | 2,689 | 0.08/s | 200 B | **nobody** (GET /getkillinfo exists, see G1) |
| POST /setplayerweapondetailinfo, /setplayersaminfo | 1,145 each | at elimination or match end | 1.5 KB / 90 B | via GET weapon detail |
| POST /setplayerassistinfo | 512 | — | 138 B | **nobody** |
| POST /setreviveplayer | 213 | — | 155 B | **nobody** |
| POST /setairdropboxinfo | 76 | — | 336 B | **nobody** |
| POST /setisingame | 46 | about 11 per session | `InGame` / `Finished` | **nobody** |
| POST /setentertopeightafterrevive | 26 | — | 46 B | **nobody** |
| POST /setplayerssightusageinfo, /setplayerweaponinfo | 16 each | at match end | 10.8 KB / 31 B (always empty) | **nobody** |
| POST /setplayerdeadafterrevive | 3 | — | 99 B | **nobody** (new, not in earlier notes) |

Local traffic: player-list polling alone moves about 396 KB/s over localhost. Six pollers ask for the same 60 KB document. Weapon detail adds about 46 KB/s.

### Value domains (measured from the 10-27 log)

**`liveState`** (counted over the first 1.5 GB):

| Value | Count | Meaning |
|---|---|---|
| 0 | 491 k | alive |
| 1 | 34 k | alive |
| 2 | 41 k | alive |
| 3 | 245 k | alive; `local.ts` labels it "in vehicle" |
| 4 | 17.7 k | knocked |
| 5 | 882 k | dead |

No 6, 7 or 8 were observed, although `local.ts` labels them.

**`ResultHealthStatus`** (kill events):

| Value | Count | Meaning |
|---|---|---|
| `1` | 395 | knock — inferred, not confirmed by any document |
| `2` | 379 | kill — inferred, not confirmed by any document |

**`CircleStatus`:** values 0, 1, 2 and 3 were observed. `local.ts` maps 0 = wait, 1 = delay, 2 = move. **3 is unmapped** (60 occurrences) and currently becomes `unknown`.

**Kill events with `CauserUID` = `VictimUID` = `'0'`:** 21 of 774, which is 2.7 %. They are spread across the whole match. All but one have `ItemID '-1'` and `Distance -1`. A killfeed must filter them out. They are not only a replay at match start, which corrects the earlier quick look.

### Quirks a normalizer must handle

- Numbers arrive as strings in the circle, global, kill, revive and observing payloads.
- The revive and dead-after-revive payloads carry `Location` as `"x=…,y=…,"`.
- `circleInfo` is sometimes `[]` (lobby) and sometimes an object.
- Circle posts arrive out of order: GameTime 35, then 34, then 34 within the same second.
- `teamName` changes mid-session for the same `teamId`. Join on ids, never names.
- `RoomID` (about 2.4e18) is above 2^53, so JS rounds it and the value is not usable as an id.
- `picUrl` is always empty and `character` is always `"None"`.
- `PickUpData`/`UseData` and `TotalPlayerWeaponReport` were always empty.
- `setisingame` fires several times per match start.

## Field coverage (`field-audit.json`)

There are 133 game-feed fields. "Supported" is used in the spec's sense: sourced, normalized, selectable, previewable and rendered.

| | Fields |
|---|---|
| Reach a **published** overlay at all (cloud wire) | 37, all player fields, through raw `matchData.teams[].players[]` paths |
| Have a friendly `live.*` path | 13 |
| Exist in `local.*` (editor sample only; empty on `/o/`) | 20 |
| Weapon detail (relay only, themes only, not bindable) | 34 |
| POST-only, not read by anything | 51 |
| Have a registry label, category or unit | **0**, because `dataDictionary.ts` does not exist |

So by the spec's definition, **no field is fully supported yet**. Player stats are reachable only by typing raw paths.

Seven player fields are deliberately **removed from the cloud wire**: `inDamage`, `PoisonTotalDamage`, `outsideBlueCircleTime`, `UseSelfRescueTime`, `UseEmergencyCallTime`, `AIKillNum` and `BossKillNum`. They are marked `reserved` in `proto/overlay.proto` (lines 37, 85) to save bandwidth. They can reach designs only through the relay local feed, and that should not change: it is the right trade-off.

## Defects confirmed in code (re-verified today)

1. **`/o/` has no local data.** `runtime/OverlayRuntime.tsx:147` renders `LayoutRenderer` with `state`, but the state has no `local`. `bindings/index.ts:64` therefore falls back to `EMPTY_LOCAL`, and map, zone and observed layers render empty.
2. **Wrong tiers for maps, and overall always joined.** `runtime/layoutTiers.ts:23-30` joins `matchDataPositional` for any `map` element, even though `map` draws only from `scope.local`. It also always adds `overall`.
3. **The knocked preset never fires in the default list.** `editor/inspector/StyleWhenSection.tsx:39` tests `item.liveState == 4`. The default Player list repeats `live.players` (`editor/elementFactory.ts:97`), and `LivePlayer` (`bindings/live.ts:11-32`) has no `liveState`.
4. **`live.players` drops 26 of the 38 cloud player fields**, including headshots, assists, knockouts, heal, survival time and the grenade counts.
5. **Two separate field walkers.** `bindings/fieldCatalog.ts` and `editor/DataPicker.tsx` hide different keys and go to different list depths.
6. **Six desktop processes poll the same `/gettotalplayerlist`.** That is about 6.6 requests/s at 60 KB each. Spec rule 4 and I1 mean the new relay local feed must **replace or share** a poller, not add a seventh.

## G1 — POST-only data contract

- **Live probe:** **blocked.** `:10086` was not running on 2026-10-28. All six probe URLs returned "connection refused".
- **Strong evidence that read mirrors exist:** `D:\code\server.exe`, the packaged game-feed server, contains an embedded request log from 2026-03-06 with successful responses:
  - `GET /getkillinfo` → `{"killInfo":[{CauserName, VictimName, CauserUID, VictimUID, ItemID, ResultHealthStatus, CurGameTime, Distance}, …]}`. This is the whole match killfeed, accumulated.
  - `GET /getteaminfolist` → `{"teamInfoList":[{teamId, teamName, isShowLogo, logoPicUrl, killNum, liveMemberNum}]}`.
  - `GET /getallinfo` → `{"allinfo":{TotalPlayerList[], TeamInfoList[], GameStartTime, FightingStartTime, FinishedStartTime, GameID, CurrentTime}}`. This gives a stable **match id (`GameID`)** and **match phase timestamps**.
- **Not found:** no GET mirror for backpack, revive, assist, airdrop or sight usage.
- **Next step:** with the game running, run read-only `curl` against `/getkillinfo`, `/getallinfo` and `/getteaminfolist`. If they answer, the killfeed (weapon, distance, knock vs kill), match identity and phase timing all become G2 work.
  - Backpack, revive, assist and airdrop data need a read endpoint on the server (G3).
  - That is only possible if we own the server's source.

## Canonical data model (proposed for M2)

```
Raw (:10086 GET payloads, unchanged)  ─┐
                                       ├─ validate (shape guards, number-from-string, drop UID-0 events)
Cloud engine state (matchData, …)  ───┘
   → normalize (camelCase, ids as strings, units: cm→0-1 map, s, m)
   → merge by uId/teamId (cloud roster = names/logos, local = live telemetry; never by name)
   → canonical:
       live.players[]  += liveState, headShotNum, assists, knockouts, heal, survivalTime,
                          maxKillDistance, driveDistance, marchDistance, rescueTimes, grenade counts,
                          killNumInVehicle, killNumByGrenade, gotAirDropNum, contribution, rank
       local.players[] += those + inDamage, PoisonTotalDamage, outsideBlueCircleTime, weapons[]
       local.zone      += status 3 mapping, phase timing; local.plane {start,stop}
       local.observed  += gunAds
       local.match     {gameId, phase, startedAt, fightingAt, finishedAt}   (if /getallinfo confirmed)
       local.killfeed  [{id, killer, victim, weaponId, knock|kill, distance, gameTime}]  (if /getkillinfo confirmed)
       meta per source {available, source:'relay'|'cloud'|'sample', lastUpdated}
   → derived (existing derived.* and live.* helpers)
   → bindings (registry: friendly label, category, unit, desktop-only badge)
```

Match scoping: everything under `local.*` is reset when `GameID` changes. If `GameID` is not confirmed, the fallback is `setisingame`-free heuristics: `CircleIndex` resets and the player-list roster changes.

## Prioritized backlog (M2 order)

1. **Registry.** `bindings/dataDictionary.ts`, built from `field-audit.json`. `fieldCatalog.ts` and `DataPicker.tsx` move onto one traversal.
2. **Widen `live.players`** with the 26 cloud fields plus `liveState`. This fixes defect 3 and adds tests.
3. **One local-feed poller in the relay.** It is consumer-gated and fingerprint-deduped, and emits `localFeed`.
   - **Decision for the user:** should the desktop UI pollers (useLocalGame, BattleBars, map) read from it too? That is the only way to cut, rather than grow, the 6× polling.
4. **Runtime.** An overlayClient local-feed hook → `buildLocal` → `OverlayRuntime` scope. On cloud pages, show a "needs desktop app" explanation through `explain.ts`.
5. **Dependency-aware `layoutLiveTiers`.**
6. **G2,** if the `/getkillinfo` and `/getallinfo` probe succeeds: real killfeed and match identity.

## Blockers and limits

- **G1 probe:** needs the game-feed server running. Who owns `server.exe`'s source decides whether G3 (backpack, revive, assist, airdrop) is possible at all.
- **Flaky front test:** not yet identified (see the Baseline note).

## Artifacts

- `front/docs/designer-upgrade/field-audit.json`: one entry per game-feed field (spec 2.2 attributes).
- `front/src/graphics/__fixtures__/feed/*.json` and `desktop-app/relay/test/fixtures/feed/*.json`: sanitized samples for every endpoint.
- `front/scripts/feed-audit/`: the extractor, sanitizer and audit generator, so all of the above can be regenerated.
