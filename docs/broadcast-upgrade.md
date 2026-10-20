# Broadcast upgrade: Designer, Auto Switcher, Smash Point

What changed in the October 2026 upgrade pass, how each part works, and how to
release or roll it back. Most of the original spec already existed; this file
covers the whole feature set as it now stands, and marks what is new.

## Keyboard

| Key | What it does | Where |
| --- | --- | --- |
| **Ctrl+Shift+F8** (default, *new default*) | Hides / shows only the On-air OBS sources, the battle bar window and the desktop observing-player window (map, kills bar, team slots and post-match / awards / pre-match stay up). Never touches the director, the observed player or match data. | `desktop-app/src-tauri/src/overlay_visibility.rs` (one global shortcut, absolute `overlay-hidden` state) |
| Change it | Display HUD → hotkey panel → Change. Must include Ctrl; may not take Ctrl+Alt+F12 or Ctrl+B. A saved key wins over the default. | `hotkeys.json` in the app config folder |
| **Hold Alt** | Director does not switch while held; read from the physical key state each tick, so a lost key-up cannot leave it stuck. | `ob_input.rs::alt_held` |
| Ctrl+Alt+F12 | Safety stop: director + drones. Always allowed, even when locked. | `lib.rs` |

## Auto Switcher (desktop OB director)

Code: `desktop-app/src-tauri/src/director/`.

* **Fight lifecycle** (`engagement.rs`): possible fight → fight → wrapping up → just ended (cooldown), driven by
  firing, damage dealt/taken, knocks and kills with a 4 s confidence half-life. One shot is only a suspicion.
* **Who to watch** (`brain.rs`): locked on the current fight; a bigger fight must beat it by `fightMargin`
  after `fightDwellS`; inside a fight a more active player must lead by `playerMargin` for `leadTicks`
  checks after `playerDwellS`. Knocks are held on air (`knockHoldS`, `downHoldS`), then the camera stays
  on the same fight (teammate first). Every hold and switch has a reason; the Director page lists candidates.
* **Vehicles (new)**: `liveState 3` = in a vehicle. Not documented by the feed; measured on 48 recorded
  matches (players flip 0↔3 ≈ 7× a match, median 20 s, 10–35 m/s vs < 10 m/s on foot). With
  *Rank players in vehicles lower* (default on), a quiet vehicle player scores below anyone on foot, and
  idle rotation skips driving teams while another team is on foot. Shooting, dealing or taking damage
  from a vehicle keeps full priority (vehicle fights are still followed).
* **Replay tests**: `feedlog.rs` replays recorded feeds (`Record the feed for replay tests` on the
  Setup tab) through the same brain; `cargo test --lib director` runs the scripted scenarios
  (no flicker, knock keeps the fight, passing car does not take the camera, same input → same decisions).

### Lock

Server-side bcrypt hash only (`Render_hosted/test-back/services/directorLock.js`). Locking and unlocking
both need the password; failures are rate-limited per account+IP and per account. Set the
deployment-wide starting password with:

```
cd Render_hosted/test-back
node scripts/hash-director-lock.cjs      # type the password; it never goes on the command line
# put the printed DIRECTOR_LOCK_DEFAULT_HASH=... in the Render environment
```

Admins give an account its own password in the admin panel (Users → Auto Switcher).

### Managed settings (new)

Admin panel → Users → **Auto Switcher** → *Auto Switcher settings*.

* Unmanaged (default): each PC keeps its own settings, exactly as before.
* *Manage with these settings*: the fight-following values (sensitivity, dwell times, holds, margins,
  idle policy, vehicle ranking) apply to every desktop of the account at once (`directorSettingsChanged`
  over the hub socket, and on every reconnect). Slots, keys, input mode, map and dry-run stay per PC.
  A local edit of a managed field is replaced by the admin's value (enforced in Rust, `managed.rs`).
* *Allow automatic switching* off: the director stops (drones are left alone) and Start is refused.
* *Restore recommended* fills the form with the defaults (`DirectorConfig::default()`); *Stop managing*
  hands the settings back to each PC. Every change is audited (overlay cluster `adminAudit`).
* *Recent switch decisions*: desktops report their decisions every 15 s (at most 20 per batch); the
  server keeps the newest 40 per account **in memory only** (no database write per switch).

API: `GET /api/director-settings`, `POST /api/director-settings/decisions` (account JWT);
`GET|PUT /api/admin-panel/users/:id/director-settings`, `POST …/reset` (admin).

## Designer

### Connecting data

* **Connect to live data** (was "Select data") opens the picker: common one-click fields (now including
  Smash Point and connection state), a grouped tree with live values, and a typed-address box.
* **Why is it blank? (new)**: every connected property says *why* it shows nothing
  (`graphics/bindings/explain.ts`): no tournament/round/match selected, still loading, source
  disconnected (and which: relay offline, server unreachable), a field that only exists inside a
  "Repeat for each" row or during an event, desktop-app-only data, a list shorter than the item asked
  for ("has 3 items, so item 5 does not exist yet"), or a field that does not exist ("Did you mean
  teamName?"). The same explanation is used by the publish check.
* *Text when data is missing* (fallback) shows for `null`, `undefined` and `''` only — a real `0` is shown.
* Type checks (a list as text, a word as a width…) and the Check-before-publish report were already there.

### Guided steps (new)

A strip under the toolbar: Start · Size · Connect data · Motion (optional) · Try with data · Check · Saved
· On air. Worked out from the design (`editor/progress.ts`), never a forced order; each step jumps to
the place that completes it; *Hide* folds it away (remembered per browser). "On air" uses the new
`publishedDraftRev` (backend records which draft revision was published) to say when edits are not
published yet.

### Fast creation (new)

* Insert panel: one search for elements and live parts, ★ favourites, and recently inserted items
  (per browser).
* **Style kits** (`graphics/templates/styleKits.ts`): Minimal Professional, Purple Premium, Red and
  Black Competitive, White and Blue Broadcast, Dark Tactical, Gold Championship, Clean Statistics, Live
  Match HUD. Original palettes, only fonts every page loads. Pick one in *New design → Style* or in
  Document settings → Theme (one undoable step); *Use the tournament's colours* takes primary/secondary
  from the previewed tournament. Every layer whose colour/font follows the theme changes with it; fixed
  colours are untouched.
* Template cards now say what each template reads and reacts to (`templates/requirements.ts`), e.g.
  "Reads: tournament, teams and players · Reacts to: kill". A test resolves every path of every
  template (197 paths, 19 lists across 44 templates) against the simulation engine's real data shape.

### Animation

* Rules ("When … → Do …"), 150 effects, keyframes, stagger, retrigger (restart / queue / ignore)
  already existed.
* **When a value changes (new)**: trigger type `change` with a watched data path. Plays when the value
  differs from the last one seen; never on the first value and never on a heartbeat or reconnect that
  re-sends the same value (compared by content). Rules built on it: *its value changes*, *the Smash
  Point value changes*, *the observed player changes (desktop app)*; plus *Smash Point is switched on*
  (a state rule).
* **Reduced motion (new)**: on a viewer whose system asks for reduced motion, endless loops stay at rest;
  one-off clips still play so alerts are seen. OBS never sets this, so broadcasts are unaffected.
* The spec's named presets map to existing effects: Fade In/Out, Slide In ←/→/↑/↓, Scale In = Zoom in,
  Subtle Reveal = Rise in, Counter Update = Pop / Pulse once, Knock / Elimination Alert = Pop in → out,
  Staggered cards = any entrance + *stagger*, Smash Point / Result Reveal = Wipe in.

## Smash Point

* Stored on the match: `Match.smashPoint = { enabled, value, displayText }` (value ≤ 40 chars, label ≤ 24).
  Display only — no scoring rule is applied or invented.
* Set it in the desktop app: **Overlays page → Smash Point** (switch on, value, optional label, Save /
  Clear, preview). Also `PUT /api/tournaments/:t/rounds/:r/matches/:id { smashPoint }`.
* Shown by every theme's LiveStats and LiveData through one shared component
  (`Themes/shared/components/SmashPointBar.tsx`): hidden (no gap) unless enabled with a value; primary →
  secondary gradient of the tournament with gold trim; slides in once; a new value pulses the value only.
  It arrives with the match already loaded — no extra request or socket — and a reconnect brings back
  the saved value without replaying the entrance.
* In the Designer: `match.smashPoint.*` fields, the *Smash Point value / on?* shortcuts, and the rules above.
* Designer layers (new, `graphics/templates/smashPoint.ts`): a **Smash Point bar** template, an
  Insert ▸ Live parts entry, and the bar under the table in *Live Stats (pro)*. Theme primary → secondary
  with gold trim, hidden by the same condition as the *Smash Point is switched on* rule, fades in when it
  appears, value pops when it changes. The simulation's match carries a sample Smash Point (`80`) so it
  previews.

## Performance

Measured on the 500-layer fixture against the simulation engine (`graphics/__tests__/perfBudget.test.tsx`,
`PERF_REPORT=1` prints the numbers; jsdom, so a browser is faster):

| | Before | After |
| --- | --- | --- |
| On air: a publish that changes nothing a layer reads (status ping, re-sent slice) | ≈ 118 ms re-render | ≈ 3 ms |
| Guided steps, per edit | — | ≈ 4–5 ms |
| Explaining a binding | — | ≈ 0.03 ms |

The renderer now keeps its binding scope when no readable slice changed (`useStableState` in
`renderer/LayoutRenderer.tsx`; connection timestamps are ignored, `phase` is not). A real data change
still redraws the canvas; connection count, message volume and memory need a live session to measure.

## Open-source references (checked 2026-10-18 via the GitHub API)

| Project | Licence | Use |
| --- | --- | --- |
| Cellohh/browser-scoreboard-overlay | MIT | patterns only |
| sivert-io/cs2-tournament-overlay | MIT | patterns only |
| Deihatchi/tourney-overlay | PolyForm Noncommercial 1.0.0 | **no reuse** (non-commercial) |
| rav3zster/StreamControl | none (all rights reserved) | **no reuse** |
| simoneluconi/obs-scorebug | none (all rights reserved) | **no reuse** |
| michaelsky5/ow-broadcast-toolkit | OWBT Community Source License 1.0 (non-commercial) | **no reuse** |
| dwclarkphx/breeze-overlay | MPL-2.0 (file-level copyleft) | patterns only |
| alyssaxuu/motionity | MIT | patterns only |
| Clear to Air (cleartoair.com) | commercial product | patterns only |

No code or assets were copied. Patterns confirmed by them and already present in ScoreSync: keep the last
good data through an outage, transparent 1:1 browser-source output, operator-entered values that survive
a reconnect. Not adopted yet (ideas): a preview → TAKE step for operator-triggered graphics (OWBT,
Breeze) and a REST trigger API for Stream Deck / Companion (Breeze).

## Release checklist

1. Backend (`Render_hosted/test-back`): `npm test` green; set `DIRECTOR_LOCK_DEFAULT_HASH` if not set;
   deploy. New: `/api/director-settings`, admin `director-settings` routes, `User.directorSettings`,
   `OverlayLayout.publishedDraftRev`, layout schema trigger `change` (regenerate with
   `node front/scripts/sync-layout-schema.mjs` if the schema changes again).
2. Front (`front`): `CI=true npx react-scripts test --watchAll=false` and `npm run build`; deploy.
3. Desktop (`desktop-app`): `cargo test --lib` in `src-tauri`, `npx tsc --noEmit`, build the installer.
   Deploy the backend **before** shipping the desktop (it calls `/api/director-settings`; an older
   backend answers 404, which the desktop ignores — it stays unmanaged).
4. Smoke test: Ctrl+Shift+F8 hides only On-air sources; hold Alt → *paused* on the Director page;
   dry-run a match and look for "in a vehicle, ranked down" in the candidates; set a Smash Point and
   see it in LiveStats + LiveData; admin → manage settings → the desktop's banner appears.

## Rollback

Every change is additive and backward compatible; roll back per component:

* **Backend**: redeploy the previous build. `directorSettings` and `publishedDraftRev` stay in the
  documents and are ignored by older code. A layout saved with a `change` trigger would be refused by
  the older schema validator on its next save; remove such clips first if rolling back for long.
* **Front**: redeploy the previous build. Designs keep working; `change` clips simply do not play on the
  older renderer.
* **Desktop**: reinstall the previous version. A saved custom hide key keeps working; installs on the
  default key go back to Ctrl+Alt+F8. To turn vehicle ranking off without a rollback, untick *Rank
  players in vehicles lower* (or manage it off from the admin panel).
* **Managed settings**: *Stop managing* in the admin panel returns every PC to its own settings at once.
