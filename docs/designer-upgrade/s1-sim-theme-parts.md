# Stage 1: you can see it working (simulation + Theme6/7 parts)

Date: 2026-10-29. Plan: simple Designer, 4 stages, user review after each. Stage 2 (simple data connection) starts after review.

## What the user asked for

- The firing bullet, the eliminated bar and the recall bar should look exactly like the coded themes.
- The simulation should let you pick how many teams it shows.
- An animation built once on a team row should work for every row, and the user should be able to see that it does.
- Recall should work in the simulation.

## What changed

### Simulation (`front/src/graphics/editor/simulation.ts`)

- **Teams shown.** `createSimulation(seed, { teamCount })` and `controls.setTeamCount(n)` / `teamCount()` control how many teams the sample match has. The sim bar has a dropdown: 1 / 2 / 4 / 8 / 16 teams, default 4, remembered per browser.
  - Changing it restarts the sample match and refetches the round, so standings follow too.
- **Recall works.**
  - Recalls only fire on Rondo (`RECALL_MAPS`). The live sample match is match 4, which used to be Sanhok, so the Recall button never played anything.
  - Match 4 is now Rondo. Matches 5 and 6 are Rondo as well, so pressing "Match start" keeps recalls working.
- **+Kill is shaped like the real feed.**
  - The victim is knocked first (liveState 4) and dies 0.9s later.
  - If they were the last one alive, that death wipes the team, and the ELIMINATED edge fires then.
- **Reset is a fresh match.**
  - It used to revive everyone in the same match, so the recall detector reported a recall for every dead player.
  - Reset (and a team-count change) now restarts the match under a new id. The engine treats that as a match boundary, the same as live, and no false RECALLED appears.
- **Standings refetch.** Structure changes bump `publicRev`. Without this, the engine's revision guard skipped the refetched round and the standings kept the old team count.

### "What just happened" log and the On air switch (`renderer/useTimeline.ts`, `LayoutRenderer.tsx`, `editor/Canvas.tsx`, `editor/DesignerEditor.tsx`)

- **Clip-start callback.** `TimelineCtx.onClipPlay` reports each clip that an event or a data change starts, with the row it played on (`#1 Alpha Wolves`). It does not report entrances or loops.
- **The log.** The sim bar shows the latest entry. Clicking it opens the last 12.
  - A part's pieces (a sweep's bar and its label) count as one line.
  - This is how you check that one bar built once played on the right row.
- **On air switch** (`TimelineCtx.onAir`, on by default in SIMULATION). Layers that wait for an event (sweeps, alerts) stay hidden until it happens, as OBS shows them.
  - Turn it off to see and select them while designing.
  - Before this, in the editor every sweep sat visible over every row.
- **Status bar.** In simulation it drops the zoom and selection text, which are already in the toolbar and inspector, so all the controls fit on one line.

### Theme6/7 parts (`templates/parts.ts`, `editor/animationEffects.ts`, `editor/animationLibrary.ts`)

All of these were measured from `Themes/Theme7/on-screen/LiveStats.tsx` and `Themes/shared/components/RecalledOverlay.tsx`.

- **Firing bullet.**
  - Same SVG geometry at 44px, rotated 90°, white fill.
  - Thin red stroke: the theme's stroke is 2 units in a 500-unit box, about 0.2px.
  - `drop-shadow(0 0 18px red) drop-shadow(0 0 30px red)`, pulsing to 0.5 over 2s.
  - Shown while anyone on the team is firing. Like the theme, it is not hidden for a dead team (the old part was).
- **ELIMINATED sweep** (new part).
  - A bar in the tournament gradient that grows from the left over 1.5s on `cubic-bezier(.22,1,.36,1)`, stays until 2.5s, then shrinks back over 0.6s on `cubic-bezier(.55,0,1,.45)`.
  - "ELIMINATED" (RELIDUX, letter-spaced) fades in after 0.8s.
- **RECALLED sweep.** Same motion, `#0dd10d → #067d06`, text "RECALLED - NAME" (AGENCYB).
- **New effects.** `themeSweep` and `themeSweepText` (the label's late fade). They are in the Animate panel under Wipe.
- **New rule: "this team has just been eliminated".**
  - It plays once when the team goes out, and again after a recall and a second wipe.
  - It does not play for a team that was already out when the overlay loaded, which matches the theme's `wasEliminatedRef`.
  - It is a condition clip with a new `edge: true` flag. The old "this team is eliminated" state rule is unchanged.
- **Retrigger.** Popups started by a condition (a state turning true again) now restart instead of queueing behind themselves.
- **LiveStats team row (Theme 7)** is rebuilt to the Theme 7 row:
  - 80px rank cell (gradient with a 70% black shade; the bullet takes the rank's place while firing).
  - 230px tag cell with the logo.
  - 260px black stats cell: kills, points, four 10×40 health bars (green, red while knocked, empty when dead).
  - Zone glow, ELIMINATED and RECALLED sweeps. The row dims to 70% while the team is out.
  - Saved designs keep their old parts; nothing is migrated.
- **"Repeats for every …" note.** A layer inside a list now says so in the Inspector, with its row limit.

### Schema

- `ClipTrigger.edge` (boolean) is added to `layoutTypes.ts` and `schema/layoutSchema.js`.
- The backend copy was regenerated with `node front/scripts/sync-layout-schema.mjs` (`Render_hosted/test-back/utils/layoutSchema.generated.cjs`, sha256 dba8da8ab0436de6).
- A backend that hasn't been redeployed simply ignores the field, so an edge clip plays like a normal condition clip there.

## Files touched

- front/src/graphics/editor/simulation.ts
- front/src/graphics/editor/DesignerEditor.tsx
- front/src/graphics/editor/Canvas.tsx
- front/src/graphics/editor/Inspector.tsx
- front/src/graphics/editor/animationEffects.ts
- front/src/graphics/editor/animationLibrary.ts
- front/src/graphics/renderer/useTimeline.ts
- front/src/graphics/renderer/LayoutRenderer.tsx
- front/src/graphics/templates/parts.ts
- front/src/graphics/schema/layoutTypes.ts
- front/src/graphics/schema/layoutSchema.js
- Render_hosted/test-back/utils/layoutSchema.generated.cjs (generated)
- front/src/graphics/__tests__/simulationStage1.test.tsx (new, 10 tests)

## Test output (real)

- `npx tsc --noEmit -p .`: no errors in `src/graphics`.
- `react-scripts test src/graphics src/home src/overlayClient`: **634 passed, 1 failed** (635 tests, 48 suites).
  - The failure is `home.test.tsx` › pricing. The test expects `$70`, but the committed `public/content/site.json` says `$100`. It failed the same way before any Stage 1 change and is unrelated.
  - `designerUi.test.tsx` › "create from a template opens the new layout" failed once under full-suite load. It passed alone twice; it is the timing-sensitive test M1 already listed as flaky.
- `npm run build`: **Compiled successfully.**
- Browser check: the production build in headless Chrome with a mock API (scratchpad harness):
  - Inserted "LiveStats team row (Theme 7)" with 4 teams. The Inspector shows "Repeats for every team (up to 16 rows)".
  - Pressed **+Elim**. The ELIMINATED sweep grew across row #1 only, in the tournament red, and the log said "▶ Eliminated sweep · #1 Alpha Wolves".
  - Pressed **Recall**. The green "RECALLED - AW_ACE" sweep played on the same row.
  - Pressed **Firing**. The bullet replaced the rank on the firing team's row.
  - Pressed **Reset**. All rows were clean, with no false recall.
  - Set **Teams = 1**. One row.

## Not done / limits

- **Dummy kill-feed entries** (killer / victim / weapon) are moved to Stage 3. They belong to the same `local.killFeed` data that the feed-log tail adds, and making them in Stage 1 would have invented a data path that Stage 3 then has to replace.
- **Exact pixel comparison.** The bullet and sweeps were compared by numbers (sizes, colours, timings, easing) and by eye in screenshots, not by a pixel diff against a live Theme 7 overlay.
- **Untested here:** the Theme 7 row on a real live match (relay or feed), OBS and the desktop app.
- **Fonts.** RELIDUX and AGENCYB render in the website build. A design published to `/o/` uses whichever fonts that page loads, the same as the themes.
