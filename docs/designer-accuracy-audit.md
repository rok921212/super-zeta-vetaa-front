# Designer accuracy audit: built-in themes, desktop overlays, cold start

Date: 2026-10-20. Scope: how Theme1–Theme8 and the desktop app overlays are built (every animation, timer and data field), what the Designer engine can and cannot reproduce, and why the first connection after a long idle or sleep is slow.

Paths are relative to the repo root. `file:line` references are from the date above.

---

## 1. How the built-in themes are wired

- **Registry:** `front/src/Themes/registry.ts`
  - `require.context` finds every `ThemeN/(on|off)-screen/*.tsx` and lazy-loads it (44–72).
  - Aliases (31–35): `1strunnerup→firstrunnerup`, `2ndrunnerup→secondrunnerup`, `achieve→achive`.
  - Fallbacks when a theme lacks a view (93–98): `mvp→matchfragrs`, `highlightpoints→overalldata`, `highlightschedule→schedule`, `rostershowcase→Theme4 RosterShowCase`.
- **View switch:** `front/src/dashboard/themeViews.tsx`
  - Each view sits in `<Suspense key={mountKey}>` (55–63).
  - MatchData and OverAllData are keyed with `rankingReplay`, so a DisplayHud page pick remounts them and replays the entrance (83, 91).
  - **There is no transition between views:** the mount animation is the entrance, and the old view unmounts instantly.
  - Props (65–131): every live view gets `{tournament, round, match, matchData}`, plus:

    | Prop | Views |
    |---|---|
    | `overallData` | LiveStats, LiveData |
    | `deadTeamList` | Alerts |
    | `matchDatas` | Achive |
- **Canvas:** a fixed 1920×1080 `div` or `<svg viewBox="0 0 1920 1080">` with absolute pixel placement.
  - Theme3 LiveStats and Alerts draw a 3840×2160 viewBox inside a 1920 SVG.
- **Libraries:** framer-motion (113 imports), inline-`<style>` CSS `@keyframes`, CSS transitions, the Web Animations API (logo↔flag), and Tailwind `transition-all` / `animate-pulse`. No GSAP or react-spring.
- **Fonts:**
  - `@font-face` in `front/src/index.css`: PaybAck, Awaking, Supermolot, Unisans, Tungsten, Bebas, AGENCYB, IMPACT, RELIDUX.
  - Google Fonts (`front/public/index.html:8`): Anton, Bebas Neue, Righteous, Space Grotesk, Inter, JetBrains Mono.
- **Colours:** set at run time from `tournament.primaryColor` / `secondaryColor`. Defaults: `#000/#333`, `#6b21a8/#c084fc`, `#E01515/#620505`.

## 2. Shared modules (`front/src/Themes/shared/`)

| Module | Behaviour and timing | Used by |
|---|---|---|
| `hooks/recallEvents.ts` | `useRecallEvents`: a player going dead→alive on Rondo maps, detected in `overlayClient/detectors.ts`. `useRecallBanner`: one banner at a time, de-duplicated, **300 ms** gap; the display calls `onDone` | LiveStats T1–T8, Recall T6–T8 |
| `hooks/killMilestones.ts` | `useKillMilestones`: firstBlood, streak3/5/8 (highest wins), grenadeKill, vehicleKill, damage (default 500), airdrop, distanceKill (only when a threshold is set). Emits one event with an increasing `nonce` | Dom T1–T8 |
| `hooks/liveKillFeed.ts` | `useLiveKillFeed`: players flattened with team context and `isTeamAllDead`, sorted by kills | LiveFrags (top 5) |
| `hooks/liveDerived.ts` | `wwcdChance`: average health of the 4 players when the API is on, otherwise alive×25 | Upper, `graphics/bindings/live.ts` |
| `hooks/matchTotals.ts` | `computeMatchTotals`: every per-match total any theme shows | MatchSummary, Wwcd*, teamh2h |
| `hooks/unsortteams.ts` | `useSortedTeams(md, overall, 'live' \| 'overall' \| 'liveUntilDead')` adds totalKills, aliveCount, teamRank, totalPoints, isAllDead, hasOutsideBlueCircle | All live views |
| `hooks/rankingPager.ts` | `rankingPageCount`; `useRankingPager(view, pages, intervalMs)` on a shared `setInterval`, which DisplayHud can hold or flip via `publicDataInvalidated{reason:'overlayPage'}` | MatchData, OverAllData |
| `hooks/logoFlagSwitch.ts` + `components/TeamLogo.tsx` | Logo↔flag swap every **3000 ms** on one wall-clock timer shared by every overlay. Web Animations fade **350 ms**: out `ease-in`, in `ease-out` | Almost every logo |
| `components/RecalledOverlay.tsx` | Green wipe `135deg #0dd10d→#067d06`. Width 0→100% over **1.5 s** `cubic-bezier(.22,1,.36,1)`; text fades 0.4 s after a 0.8 s delay. Collapses at 2500 ms (0.6 s `cubic-bezier(.55,0,1,.45)`); `onDone` at 3300 ms | LiveStats |
| `components/SmashPointBar.tsx` | `ss-smash-in`: 380 ms `cubic-bezier(.2,.8,.2,1)`, y +8. `ss-smash-pulse`: 420 ms, scale 1.08 + brightness on value change. Gold `#C9A54C/#F1D27A` | LiveStats, LiveData |
| `Theme8/shell/*` ("DATUM") | `EASE_IN (.16,1,.3,1)`, `EASE_STEP (.87,0,.13,1)`; durations 260 / 200 / 420 ms (in / out / reorder). `Shutter`: clip-path inset wipe (120 ms opacity under reduced motion). `ValueNum`: `.t8-flash`, 180 ms. Keyframes in `index.css` 183–205 | T8 LiveStats, Lower, Champions |

## 3. Which files are copies of which

**On-screen**

| View | Theme files that are the same |
|---|---|
| `Dom` | T2 = T3 = T4 = T7 = T8 |
| `Upper` | T3 ≈ T7 = T8 |
| `LiveFrags` | all 8 nearly the same |
| `Recall` | T6 = T7 = T8 |
| `Achieve` | T7 = T8 |
| `Alerts` | T7 ≈ T8 |
| `intro` | T1 = T3 = T7 = T8; T4 = T5 = T6 |

**Off-screen.** The themes fall into two families.
- **Family A:** T1, T2, T3, T7 and T8. Righteous/Bebas fonts, gold `#FFD700→#FFA500` ramp, `/chicken.png`.
- **Family B:** T4, T5 and T6. AGENCYB font, `/theme4assets/*`, Cloudinary purple waves.
- Shared across both families:

  | Views | Same in |
  |---|---|
  | HighlightPoints, HighlightSchedule, PlayerSwitch | T6–T8 |
  | RosterShowCase | T4–T8 |
- Only in one theme:

  | Theme | Views |
  |---|---|
  | T7 | WwcdStats, mvp, MatchData |
  | T8 | Champions (built on the shell) |
  | T1 | RosterShowCase |

## 4. Animations on the on-screen overlays

### 4a. Alerts (team eliminated)
Every theme uses the same trigger: a new `teamId` appears in `deadTeamList`. On a new match, teams that are already dead are pre-marked as shown, and the queue shows one alert at a time.

| Theme | Hold / queue | Animation |
|---|---|---|
| T1 `Theme1/on-screen/Alerts.tsx:42,64-70,119-208` | 5000 ms + 300 ms gap | framer-motion with **duration 0**, so a hard cut. Panels y 172→0, gold bar width 0→695 |
| T2 `:51,79-89,143-149` | 6000 ms, then a 450 ms exit | x −80 and rotateY −15 → 0, 0.5 s `[.22,1,.36,1]`, perspective 800. 620×190 at (60,60); three stacked clip-path layers |
| T3 `:99-106,155-227` | 5000 + 300 ms | `AnimatePresence mode="wait"`, then three steps: black scaleX 0→1 (0.4 s); brand plate x 400→0 (0.5 s, delay 0.4); gold plate y 200→0 (delay 0.9). Reversed on exit |
| T4 `:51,86-92,133-190` | 6000 ms | opacity 0.2 s + **typewriter** (100 ms per character) |
| T5 `:48,73-79,153-224` | 6000 + 300 ms | Variants: opacity/scale 0.9→1 over 0.5 s, stagger 0.15; springs 300/25, 400/20, 350/22. The typewriter state is computed but never shown |
| T6 `:52,77,135-141` | 6000 ms | scale 0.6→1, 0.45 s `[.34,1.56,.64,1]` (overshoot). 600×180, centred; `lines.avif` strips |
| T7 / T8 `:42,64-70,118-271` | 5000 ms (T8 adds a 300 ms gap) | Wrapper opacity 0.25 s plus CSS keyframes: `bannerSlideIn` 0.4 s, `cardPopIn` 0.45 s (+0.1), `logoPopIn` 0.5 s overshoot (+0.15), `killsCountIn` 0.45 s (+0.25), `playerSlideUp` 0.4 s (0.15 + i×0.08), `nameBarSlideIn` 0.4 s (+0.35) |

### 4b. Dom (kill milestones)

| Theme | Thresholds | Animation |
|---|---|---|
| T1 | damage 500 | framer opacity/scale 0.8→1, 0.5 s; holds 6 s. The exit never ran (early `return null`) — **fixed** |
| T2/T3/T4/T7/T8 | damage 500 | CSS `.dom-card` translateX −500 → 0, 0.5 s `cubic-bezier(.22,1,.36,1)`; double rAF before showing; hold 6 s; 500 ms exit |
| T5 | damage 500 | framer x −600→0, 0.6 s easeOut, clip polygon. Exit **fixed** |
| T6 | **damage 600, distance 300 m** | CSS translateX −110% → 0, 0.55 s `cubic-bezier(.32,0,.67,0)`; exit wait 700 ms; 400×450 portrait card |

### 4c. LiveStats / LiveData
**Pieces shared by T2, T6, T7 and T8 (T3 has an SVG version):**
- **EliminatedOverlay.** Fires on `isAllDead` false→true. Sweep 1.5 s `(.22,1,.36,1)`; collapses at 2500 ms (0.6 s); unmounts at 3300 ms.
- **Row reorder.** `top` 0.7 s `cubic-bezier(.4,0,.2,1)`, armed one rAF after mount.
- **Outside the zone.** `pulseBlue` inset glow, 1.2 s, infinite.
- **Firing.** Bullet icon with `animate-pulse`.
- **Health bars.** 300 ms.

**Per theme:**

| Theme | Differences |
|---|---|
| T1 | Hero card + 50 px rows. No elimination overlay and no reorder animation |
| T2 | Lightning-bolt health clip (0.3 s); dead rows at grayscale 0.4 |
| T3 | Pure SVG at 3840; row opacity 0.6 s; `pulseBlueRow` 1.2 s; `firePulse` 0.6 s |
| T4 | Mixed SVG + HTML, 40 px rows; dead rows grayscale + brightness 0.7 |
| T5 | Whole panel slides x 500→0 over 1 s, with a 1 s delay |
| T8 | Reorder 420 ms `EASE_STEP`; steady zone glow; charcoal sweep |

### 4d. Other on-screen views

| View | Behaviour |
|---|---|
| LiveFrags | Top 5; switches KILLS ↔ DAMAGE every **10 000 ms**; health bars 500 ms; a team fully dead fades to opacity 0.5 |
| Upper | Top 5 alive teams (T4: 4); health 300 ms. T6 adds a WWCD gauge (300 ms `(.25,1,.5,1)`, skew −20, colour steps 75/50/25). T5 slides in x 500 over 1 s with a 1 s delay |
| Recall (T6–T8) | Dom-style card labelled "RECALLED"; holds 6000 ms, `onDone` at 6500 ms |
| Achieve | T6: no animation. T7/T8: `playerBoxSlideUp` 0.8 s `(.22,1,.36,1)`, stagger 0.25 s |
| Lower, intro, mapPreview, slots | Static |

## 5. Animations on the off-screen views

**Family A**

| View | Animation and timing |
|---|---|
| Header | y −20, 0.6 s |
| Loops | `opacity [.9,1,.9]` or a red background pulse, 2 s, infinite |
| MatchData | Header scaleX 0.8 s; rows y 20, 0.5 s, stagger 0.1; page every **25 s** |
| OverAllData | T1/T2: y −30, 0.6 s, stagger 0.3. T3/T7/T8: y 50, 0.5 s, stagger 0.2 |
| MatchFragrs | Headline letter by letter, stagger 0.03; cards stagger 0.18 after 0.5 s, each 0.55 s `[.16,1,.3,1]`; watermark fades to 0.1 over 1.2 s |
| OverallFrags (T3/7/8) | 8 rows per page, every 15 s |
| RosterShowCase (T1) | Page every 25 s |

**T7 unique views**

| View | Animation and timing |
|---|---|
| WwcdStats | About 20 CSS keyframes: CenterDeploy 1.05 s … LogoIdle 3.5 s, infinite. Most use `cubic-bezier(.16,1,.3,1)`; players staggered by `--wwcd-delay` |
| MatchData | Page every 10 s; `popLayout`; rows y 16, 0.35 s, stagger 0.06 |
| mvp | Side panels x ±50, 0.55 s |

**Family B**

| View | Animation and timing |
|---|---|
| Champions (T4/T5) | Cards stagger 0.4, y 100, 0.6 s |
| Champions (T6) | Flicker loops (1.5 s / 1.2 s); glitch x 0.4 s with `repeatDelay` 2 |
| MatchData | Pages every 25 s (T5: 20 s) |
| OverAllData | T4: 16 rows per page. T5: 22 rows per page. T6: rank-1 row red pulse 1.5 s |
| HighlightPoints | 12 per page, every 25 s; `mode="wait"` x ±80, 0.45 s; bars 1 s |
| PlayerSwitch | Cycles every 5 s. T4/T5: y 1080, 0.8 s `[.6,.05,.01,.9]`. T6–T8: y 1200 + scale 0.85 + rotate ±5, 1.15 s |
| RosterShowCase | 4 teams every 20 s |
| T6 fraggers | `fragr-card-enter` 1.0 s, stagger 0.25; `fragr-wipe`; `fragr-content-reveal` |
| T6/T8 mvp | Idle loops: bob 3 s, glow 2.5 s, sweep 2.4 s, ring 18 s |

## 6. Desktop app overlays (`desktop-app/src`)

Each tool is a Tauri window (`dashboard/overlayTools.ts:41-105`).
- **Theme choice:** `?theme=ThemeN` picks a built-in look (`dashboard/toolThemeRegistry.ts`); `?theme=design:<id>` hands the window to `designed/DesignedTool.tsx`.
- **Live data:** the local game socket at `localhost:10086` (`totalPlayerList`, `observingPlayer`, `circleInfo`, `gameGlobalInfo`), with a Tauri HTTP fallback.

| Tool | Window | Animation and timing |
|---|---|---|
| Map Timer `Themes/Theme1/MapTimer.tsx` | 680×200 | Shows when 12 s or less remain. Scale 0.4→1, 0.4 s. At 5 s or less: pulse 0.7 s and red `#FF3B30`. Ring dashoffset 1 s; digit flip (rotateX ±90, 0.35 s, `mode="wait"`). The dev button showed in the overlay — **fixed** |
| Logo Map `Themes/Theme1/Component2.tsx` | 1920×1080 | Deep-zoom 8×8 tiles; rAF view glide `easeInOutCubic`; auto zoom 2200 ms, paused 8 s after manual input; markers 0.5 s; plane path dashes 2 s, linear; zone redraw every 100 ms (moving) or 1000 ms. Markers show logo, health ring, state icon, name pill and health bar |
| Player Pictures `Theme1/2/ObservingPlayer.tsx` | 620×620 | T1: chamfer clip, 0.3 s fade. T2: replays on each camera switch — slab skewX scaleX 0.45 s, photo 0.5 s (+0.12), name 0.45 s (+0.22); gradient `mask-image` |
| Battle Bar T1 | 960×540 | No animation. TOTAL DEATHS, NEAREST TEAM (m), GRENADE ELI, LONGEST ELI, TEAM DMG |
| Battle Bar T2 | 960×540 | Squad HUD: health 150 ms linear; ghost bar 600 ms with a 350 ms delay; knocked row goes red over 0.4 s; firing held 1200 ms; dead rows grayscale with line-through |
| Player Kills `Theme2/PlayerKillsBar.tsx` | 960×400 | Kill pop scale 1.6→1, 380 ms `(.2,.9,.3,1.3)`, **only when the count goes up**; knocked cards pulse every 1.1 s |
| Team Slots `dashboard/TeamSlotsView.tsx` | 1280×720 | Auto-fit grid. Fights: hold 6000 ms, rejoin 4000 ms. Badges: dealing 900 ms, hit 1500 ms. Transitions 200 ms |
| Match Analysis `replay/*` | 1600×900 | Template underneath, Canvas 2D on top; 3000 ms trails; 100 ms clock |
| Hide-all `layout/OverlayFrame.tsx` | — | Body fades over 250 ms; flag held in Rust (`overlay_visibility.rs`) |

**Designed desktop tool.** `DesignedTool.tsx` refetched the design every 30 s. Before this pass it had **no events** and **no `derived`/`live`**. The feed redrew at most every 200 ms and the zone ticked every 500 ms.

## 7. The Designer engine (`front/src/graphics`)

- **Layer types (21)** (`schema/layoutTypes.ts`): rect, ellipse, line, polygon, path, text, image, teamLogo, playerAvatar, flag, video, progress, healthBar, icon, group, repeater, component, builtin, map, css, code.
- **Older `anim` presets** (`renderer/animation.ts`): 12 presets and 6 easings.
- **Keyframe timeline:**
  - Up to 20 clips per layer and 24 tracks per clip.
  - **31 properties**, **26 easings** plus custom cubic-bezier, wiggle noise.
  - Options: delay, speed, loop, alternate, stagger (repeater rows only), retrigger (restart / ignore / queue).
- **Triggers:** enter, event, condition (with revert), loop, exit (with "after N ms"), change.
- **Events (11):** kill, elimination, milestone, recall, matchStart, matchEnd, rankChange, killsChange, knock, revive, playerDeath.
- **Animate panel:** 46 trigger sentences and **178 effects** (`editor/animationEffects.ts`).
- **Bindings:**
  - 18 roots plus `live`, `feed` and `local`.
  - 13 bindable props, 16 formatters, 9 operators.
- **Templates:**

  | Kind | Count |
  |---|---|
  | Starters | 10 |
  | Rebuilt | 14 |
  | Views | 16 |
  | Desktop | 5 |
  | Live parts | 16 |
  | Style kits | 8 |

  None of the editable templates were exact copies of the originals: rebuilt and views are neutral restyles, and the desktop templates are reinterpretations. Only the `builtin` layer is pixel-exact, and it cannot be edited.

## 8. Gaps: what the Designer could not reproduce

| # | Gap | Status |
|---|---|---|
| 1 | Desktop designs got no events, so kill/knock/elimination/recall/milestone clips never fired | **Fixed:** local event source |
| 2 | Desktop designs had no `derived` or `live.*` | **Fixed** |
| 3 | Desktop redraw throttled to 200 ms; zone clock 500 ms | **Fixed:** 100 ms and 250 ms |
| 4 | `local.*` lacked damage, headshots, grenade kills, longest kill, heal, isFiring, outside-zone and raw liveState | **Fixed** |
| 5 | No nearest team, total deaths, team damage or average health | **Fixed** (fight state still deferred) |
| 6 | No group/main-team photo fallback in `local.*` | Deferred |
| 7 | Sanhok scaled wrongly (map size fixed at 819200) | **Fixed:** per-map size |
| 8 | No first-circle flag | **Fixed:** `zone.isFirstCircle` |
| 9 | Map markers are plain dots (no logo, health ring, plane path or tiles) | Deferred |
| 10 | Map follow is linear CSS, with no eased glide | Deferred |
| 11 | One clip per layer at a time; a loop overrides a held state | Deferred |
| 12 | Stagger only works by repeater row; no per-letter or typewriter text | Deferred |
| 13 | Change trigger had no "increase only" | **Fixed:** `direction: up/down/any` |
| 14 | No transitions on data-driven style changes; no ghost bar | Deferred |
| 15 | No ring/arc progress; no arithmetic on bound keyframe values | Deferred (use a code layer) |
| 16 | Perspective fixed at 900 px; no polygon/circle clip animation; no gradient masks | Deferred |
| 17 | No physics springs | Deferred |
| 18 | Legacy `anim` maps only 6 easings | Deferred |
| 19 | Repeater rows play no exit | Deferred |
| 20 | CSS importer refuses clip-path, `var()` and `calc()` | Deferred |
| 21 | No paging or rotation timer | **Fixed:** repeater `page` and group `cycle` |
| 22 | Alerts fire on engine events, not the `deadTeamList` difference; no "skip what was already dead at load" | Engine elimination events already ignore the initial snapshot |
| 23 | No text-decoration, texture fill or rotation binding; missing icons | Deferred |
| 24 | No zone-phase, firing, damage or fight events | Deferred |
| 25 | Team Slots auto-fit grid | Deferred |

## 9. Bugs found and fixed in this pass
- T8 Alerts showed a stray "1" before the kill count (`Theme8/on-screen/Alerts.tsx:230`).
- T4 LiveStats used the invalid colour `##0000`.
- T1 and T5 Dom returned `null` before `AnimatePresence`, so their exit never played.
- The Desktop MapTimer (Theme1 and Theme2) rendered a "Play Timer Animation" dev button inside the overlay window.
- T3 LiveStats had a doubly nested `foreignObject` around the recall banner.

Noted but not changed: the Logo Map operator controls are drawn in the capture window; the ObservingPlayer name plates are empty; two hook filenames contain a trailing space.

## 10. Connection audit: slow first data after a long idle or sleep

### Render free plan (cold start)
1. **Nothing keeps the service awake.** No cron or self-ping, and nothing calls `/api/health`. After about 15 minutes idle the first visitor pays the whole spin-up.
2. **Startup ran in sequence before `listen`** (`Render_hosted/test-back/index.js`): Google-DNS override → main Mongo (up to 10 s) → overlay Mongo (up to 10 s). A failed Upstash ping called `process.exit(1)` (`middleware/cache.js`).
3. **Website requests failed on a cold start.** Dashboard axios had a 20 s timeout and no retry for cloud calls, so a slow wake gave empty screens.
4. **The desktop Rust fetcher waited longer than needed.** Its backoff capped at 30 s, and `.connect()` had no timeout.
5. **First data could land about 22 s after the server was ready.** The relay's 15 s upstream timeout stacks with the overlay's retry steps (about 2 s, then 5 s).

### Laptop sleep / resume
1. Nothing listened for resume, `online` or `visibilitychange` to check or restart a socket.
2. A dead socket was only noticed by the heartbeat: 25 s + 20 s, about 45 s.
3. The Rust watchdog sent `relayPing` without waiting for an ack, so it never spotted a half-open socket.
4. A hung connect stalled the hub watchdog loop.
5. Sleeps longer than 120 s went past socket.io's connection state recovery, so every client had to fully re-join.

### Fixes ("brute start")
**Backend**
- `listen` first; Mongo and the overlay DB connect in parallel; `/api/*` answers 503 + `Retry-After` until ready.
- New `GET /api/wake` waits up to 25 s for ready.
- Upstash failure no longer exits the process; the DNS override only applies when `NODE_ENV=test`.
- Heartbeat 10 s + 8 s; recovery window 10 minutes.

**Keep-awake**
- `.github/workflows/keep-awake.yml` pings `/api/wake` every 10 minutes. GitHub cron can be delayed, so also add a cron-job.org (or UptimeRobot) monitor on `/api/wake` every 10 minutes as the main pinger.

**Website**
- `wakeBackend()` runs at boot, on `online`/`visible`/`pageshow`, and when the clock jumps (sleep detected); each wake force-reconnects the socket.
- Cloud GET requests retry on network errors and 502/503/504.
- The status pill has a **Reconnect now** button and shows "Waking server…".

**Desktop**
- `connect()` has a 15 s timeout.
- Resume is detected from a wall-clock jump; it resets the backoff, reconnects the fetcher and hub, and prewarms the relay.
- A new **Reconnect now** command.
- The relay gets a `/control/reconnect` endpoint and a faster upstream reconnect (`reconnectionDelayMax` 3000).
