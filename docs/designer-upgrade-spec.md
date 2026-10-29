# ScoreSync Designer — Deep Technical Upgrade Plan

## A Complete No-Code, Data-Driven Esports Broadcast Graphics Studio

**Project:** ScoreSync / PUBG Mobile Live Broadcast Overlay System
**Primary objective:** Transform the existing Designer into a professional, extensible, no-code broadcast graphics platform where every available game-data field can be used to build, animate, simulate, preview, and publish custom overlays.

> Saved verbatim from the user's spec (2026-10-28). Execution plan and milestone reports live in `front/docs/designer-upgrade/`.

---

# 1. Core Vision and Engineering Principles

The current Designer already has substantial infrastructure: a shared renderer, a live-data engine, 21 layer types, data expressions, a visual data picker, animation rules, a timeline, reusable parts, simulation, theme publishing, asset management, and backend revision support.

The upgrade must build on these capabilities instead of replacing them.

The intended experience should combine the usability of a visual website builder, the flexibility of a motion-graphics editor, and the reliability of a professional live esports broadcast system.

## Primary principles

1. **Data-first architecture:** Every usable data field must be discoverable and usable in the Designer without manually entering its path.
2. **No-code by default:** Creating a component, connecting a field, setting conditions, and configuring animation must use visual controls.
3. **One rendering engine:** Editor previews, simulations, and published overlays must use the same production rendering logic.
4. **Local-first live data:** When the desktop relay provides game data, published overlays should consume it through the existing relay architecture.
5. **Schema-driven extensibility:** Newly discovered fields should become accessible without requiring a new UI implementation for every field.
6. **Performance by design:** Layers and data sources should update only when necessary, and unused data tiers should not be fetched.
7. **Professional output:** The system must support broadcast-quality typography, image compositing, masks, gradients, transforms, animation, and reusable layouts.
8. **Backward compatibility:** Existing themes, published revisions, layer types, bindings, templates, animations, and import/export formats must remain functional.
9. **Explainable behavior:** When an element is blank or an animation does not trigger, the Designer should explain why.
10. **Incremental implementation:** Each phase must be independently testable and deployable.

# 2. Phase Zero — Repository Audit and Architecture Verification

Before changing code, conduct a detailed audit of the actual repository.

Do not assume that the supplied audit is complete or that its file paths, line numbers, field availability, or endpoint behavior remain unchanged.

## 2.1 Inspect the complete graphics pipeline

Trace the following paths end to end:

- Game-feed HTTP endpoints and incoming POST-only events.
- Desktop relay polling, event handling, consumer subscriptions, and Socket.IO delivery.
- Cloud backend ingestion, bulk-data responses, cache tiers, and live socket updates.
- Overlay client state, data normalization, derived values, and event detection.
- Data bindings, expression evaluation, and runtime scope creation.
- Editor field discovery, element inspection, simulation, and rendering.
- Published overlay initialization, live updates, reconnection, and revision resolution.

Document where every data field originates, how it is transformed, and where it becomes available.

## 2.2 Produce a field-level audit

Create a machine-readable audit report with one entry per observed field:

- Original source and endpoint/event.
- Raw field name and normalized field name.
- Data type and example value.
- Parent object and collection structure.
- Update frequency or event-driven behavior.
- Current availability in the cloud engine.
- Current availability through the local relay.
- Current availability in the editor and published runtime.
- Whether the field is safe to expose to expressions.
- Whether it is optional, nullable, or transient.
- Relevant consumers and data tiers.
- Missing implementation steps and verification status.

Compare the field inventory against all available game-feed logs, protocol definitions, TypeScript types, protobuf schemas, endpoint responses, and existing theme bindings.

**Important:** Do not claim complete field coverage simply because the data picker can display a field name. A field counts as supported only when its value can be correctly sourced, normalized, selected, previewed, and rendered in the intended runtime.

## 2.3 Establish baseline tests and metrics

Before modifications, record:

- Existing test results.
- Production build status.
- Existing layer types and supported properties.
- Existing binding and expression behavior.
- Relay polling frequency and payload sizes.
- Cloud bandwidth usage by endpoint and data tier.
- Rendering performance with representative overlay complexity.
- Existing theme import/export and revision compatibility.

Identify failures that already exist before attributing them to the upgrade.

**Deliverable:** An architecture map, field coverage report, regression baseline, and prioritized implementation backlog.

# 3. Phase A — Universal Game-Data Access Layer

This phase is the foundation of the entire system. Every later feature should use this common data-access layer.

## A1. Build a canonical data registry

Create a centralized registry, for example: `front/src/graphics/bindings/dataDictionary.ts`

The registry should describe available data fields rather than hardcode every field independently in multiple UI components.

Each field definition should support:

- Stable field identifier.
- Friendly display name.
- Canonical binding path.
- Category and subcategory.
- Data type.
- Unit and formatting hints.
- Example or simulation value.
- Description.
- Source requirements.
- Availability state.
- Nullability and default behavior.
- Whether the value is live, derived, historical, or event-based.
- Whether the field belongs to a collection and supports repeaters.
- Whether it requires the desktop app.
- Whether the field is suitable for text, charts, conditions, or animation.
- Search keywords and aliases.

Suggested categories:

1. Tournament and competition.
2. Match and round.
3. Team.
4. Player.
5. Player combat statistics.
6. Killfeed and combat events.
7. Weapons and damage.
8. Inventory and ammunition.
9. Health, knock, revive, and elimination state.
10. Zone and circle.
11. Plane path and movement.
12. Spectator and observed player.
13. Match timing and global game state.
14. Overall standings and rankings.
15. Derived statistics.
16. Desktop-only local telemetry.
17. Custom user-defined data.

### Dynamic discovery

Use a hybrid registry:

- Explicit definitions for known, important fields.
- Schema-derived discovery for structured objects.
- Runtime observations for previously unknown fields.
- Optional user-created aliases for project-specific data.

Unknown fields must appear under an **Other / Newly Discovered** category instead of being silently hidden.

Dynamic discovery must not automatically expose unsafe objects, arbitrary executable values, or huge binary payloads. Use depth limits, collection limits, safe type inspection, and an allowlist for expression access.

When an unknown field appears, the user should be able to inspect its structure, see a sample value, and decide how to use it.

## A2. Unify the existing data pickers

Use the same registry and traversal logic for:

- DataPicker.
- FieldCatalog.
- Text binding controls.
- Repeater source selection.
- Conditional logic.
- Animation triggers.
- Chart configuration.
- Component properties.
- Data diagnostics.

Do not maintain multiple independent implementations of hidden keys, object traversal, or array-depth handling.

The picker should display friendly labels while showing the technical path only in an optional details panel.

Example:

**Player Headshots**
- Category: Player Statistics
- Type: Number
- Example: 4
- Source: Live player data
- Available in: Cloud and desktop, depending on the source
- Unit: Count

Provide search, category filtering, recently used fields, favorites, and a clear indication of unavailable or desktop-only data.

## A3. Create a reliable normalized data model

Keep raw game-feed data separate from normalized data.

Recommended conceptual pipeline:

`Raw Feed → Validation → Normalization → Source Merge → Canonical Live State → Derived Values → Bindings → Renderer`

Requirements:

- Preserve original source fields when practical.
- Normalize inconsistent identifiers and numeric formats.
- Handle missing values, nulls, empty arrays, and invalid payloads.
- Avoid silently converting unknown values to zero.
- Track the source and freshness of important data.
- Prevent stale values from overwriting newer values.
- Resolve team/player identity changes using stable identifiers rather than display names.
- Handle match transitions and reconnects without replaying stale state as new events.
- Support schema versioning and future feed changes.

Expose useful metadata such as `available`, `lastUpdated`, and `source` through the diagnostic system without forcing every visual binding to depend on metadata.

## A4. Expand live player data

Verify and expose every supported player-stat field from the actual feed and protocol, including the fields identified in the audit:

- Headshots.
- Assists.
- Knockouts.
- Healing.
- Damage received.
- Survival time.
- Maximum kill distance.
- Driving distance.
- Rescue or revive counts.
- Grenade statistics.
- Outside-blue-zone time.
- Current live state.
- Weapons and weapon-specific details.
- Other discovered player statistics.

Preserve correct types and units.

For example, survival time should be formatable as elapsed time, distance should have configurable units, and counts should support number formatting.

Do not invent values when a feed does not provide them. If a statistic can only be derived from available events, identify it as derived and document its limitations.

## A5. Integrate local game-feed data into published overlays

The audit identifies that the published runtime does not populate the existing `local.*` scope correctly.

Fix the underlying data pipeline rather than creating separate map or spectator rendering implementations.

### Relay changes

Inspect the existing polling implementation in `desktop-app/relay/server.cjs` and reuse its established patterns.

Integrate verified endpoints for:

- Total player list.
- Circle information.
- Observed-player information.
- Global game information.
- Weapon details.

Use the existing game-feed base configuration and established relay lifecycle. Do not introduce duplicate polling loops if the information is already being collected elsewhere.

The proposed endpoint polling intervals are initial candidates, not fixed requirements. Measure actual update frequency and payload size before selecting final intervals.

Implement:

- Consumer-gated polling.
- Change detection using stable, deterministic fingerprints.
- Raw-but-slim normalized payloads.
- Initial state delivery for newly connected consumers.
- Socket delivery for subsequent changes.
- Safe disconnect and reconnect handling.
- Bounded polling and request timeouts.
- Validation and error recovery.
- Stale-data indicators.
- Cleanup when the final consumer disconnects.

A proposed normalized event is: `localFeed`

It may carry `players`, `observedUid`, `gunAds`, `circle`, `globalInfo`, and `weapon`, provided each field is verified against the actual feed.

An initial snapshot may be exposed through an existing or new relay endpoint such as `/local/feed`, following the project's established HTTP conventions.

Avoid sending duplicate snapshots through both HTTP and sockets when an existing synchronization mechanism already handles this correctly.

### Published runtime changes

Integrate the relay stream through the overlay client and the existing `buildLocal()` mechanism in `bindings/local.ts`.

Pass the resulting local scope into `runtime/OverlayRuntime.tsx`.

The same normalized data contract must be used by the editor simulation and published renderer, with appropriate source adapters.

When the relay is unavailable:

- Keep cloud-supported fields working.
- Mark desktop-only values as unavailable.
- Explain why affected components cannot display live data.
- Show a clear desktop-connection placeholder in preview or diagnostics.
- Do not silently display sample data as though it were live.

## A6. Optimize data-tier selection

Audit `layoutLiveTiers` and the current bulk-fetch pipeline.

Build a dependency-aware selector that determines which data sources are required by a layout.

Examples:

- A static tournament title should not fetch positional player data.
- A player card should fetch only the player statistics it requires.
- A map that uses relay positions should not also fetch equivalent positional match data unnecessarily.
- A layout that uses overall standings should fetch the necessary overall-data tier.
- A layout with no overall-data dependencies should not fetch overall data merely because it exists.

Dependencies must include indirect references inside reusable components, repeaters, conditional rules, and animations.

Cache the computed dependency set by published layout revision. Invalidate it when bindings, component dependencies, or data-source requirements change.

**Acceptance criteria:** Every supported field has a documented source, and every layer that uses it can render the correct value in the editor and the appropriate live runtime.

# 4. Phase B — A Truly No-Code Designer Experience

The goal is not simply to make the existing interface prettier. The goal is to remove unnecessary technical steps from the entire overlay-creation workflow.

## B1. Reorganize the workspace

Use a clear professional editor layout.

**Left panel — Add and organize**

- Elements.
- Text and shapes.
- Images and media.
- Live data components.
- Reusable components.
- Layers and groups.
- Assets and uploaded fonts.

**Center — Canvas**

- Accurate 1920×1080 preview.
- Zoom and pan.
- Alignment guides.
- Selection handles.
- Safe-area guides.
- Multi-select and group transforms.
- Drag-and-drop placement.
- Contextual editing.

**Right panel — Properties**

- Content.
- Data.
- Layout and transforms.
- Appearance.
- Animation.
- Visibility rules.
- Advanced settings.

**Bottom panel — Timeline and diagnostics**

- Keyframes.
- Animation tracks.
- Playback controls.
- Event simulation.
- Data freshness.
- Validation errors.

Allow panels to collapse, resize, and remember their layout. Do not force beginners to see every advanced control at once.

## B2. Use progressive disclosure

Every property should have a simple mode and an advanced mode where appropriate.

For example, a beginner should be able to create a text layer by selecting a field, choosing a font preset, and setting its position.

An advanced user should still be able to adjust letter spacing, line height, transform origins, text fitting, gradients, shadows, blending, and animation curves.

Never remove existing advanced functionality merely to simplify the interface.

Provide contextual explanations and sensible defaults instead of exposing technical configuration immediately.

## B3. Build a guided overlay creation workflow

Implement a guided creation flow:

1. Select a template or blank canvas.
2. Choose the overlay purpose.
3. Choose the data source.
4. Add a ready-made component or visual element.
5. Connect fields through the visual picker.
6. Customize appearance.
7. Configure visibility and animation.
8. Test using simulation.
9. Validate the overlay.
10. Publish a named revision.

Offer contextual suggestions based on the current overlay type.

For example, when building a killfeed, suggest a repeater, player name, weapon icon, elimination result, and event-triggered entrance animation.

The workflow must remain optional so experienced users can work directly on the canvas.

## B4. Improve layer selection and management

Every layer should have a useful display name, type icon, visibility toggle, lock toggle, and selection state.

Support:

- Rename.
- Duplicate.
- Delete.
- Group and ungroup.
- Reorder.
- Multi-select.
- Copy and paste.
- Lock position.
- Hide from canvas without deleting.
- Search layers.
- Navigate to a selected layer.
- Detect missing bindings or assets.

Provide clear parent-child relationships for groups, repeaters, and reusable components.

## B5. Make data binding visual

When editing text, images, shapes, progress bars, or charts, users should be able to connect data through a dedicated binding control.

The binding workflow should support:

- Select a field.
- Preview the current value.
- Choose a formatter.
- Configure fallback behavior.
- Apply optional conditions.
- Preview changes immediately.

For text, provide visual formatters for numbers, durations, percentages, distance, and compact labels.

For images, support appropriate fallbacks when an asset or URL is missing.

For progress bars, allow a source field, minimum, maximum, fill direction, and optional threshold colors.

For charts, allow users to select a data collection and choose the desired metric without constructing a JSON configuration manually.

Existing safe expression functionality may remain available under an Advanced section.

# 5. Phase C — Visual Condition Builder

The current raw-JSON compound condition editor should be replaced by a reusable visual condition builder.

Implement a shared component, such as: `editor/conditions/ConditionBuilder.tsx`

Use it in:

- Layer visibility.
- Style rules.
- Animation triggers.
- Repeater filtering.
- Component variants.
- Event-driven behavior.

## C1. Human-readable condition rows

Each condition row should contain:

1. Field selector.
2. Plain-English operator.
3. Correctly typed value input.
4. Optional delete control.

Operator labels should be understandable:

- Is equal to.
- Is not equal to.
- Is greater than.
- Is at least.
- Is less than.
- Is at most.
- Contains.
- Starts with.
- Is empty.
- Exists.
- Has changed.

Only display operators that make sense for the selected field type.

Examples:

- Player kills → Is at least → 5
- Player name → Contains → Player
- Player live state → Is equal to → Knocked
- Observed player → Exists
- Team position → Is at most → 3

## C2. Support nested AND/OR logic

Allow users to create groups using:

- Match all conditions.
- Match any condition.
- Nested groups.
- Add condition.
- Add group.
- Duplicate group.

The visual builder must serialize to the existing supported condition format where possible.

Build a safe migration path for previously saved conditions. Never discard a condition merely because the new interface cannot display it.

If a condition uses an unsupported operator, preserve it and show an explicit compatibility warning.

## C3. Validate conditions

Provide:

- Type validation.
- Missing-field warnings.
- Clear errors for incompatible operators.
- Preview of whether the condition currently evaluates to true or false.
- Explanation of unavailable fields.
- Tests for serialization and deserialization round-trips.

# 6. Phase D — Complete Animation and Event System

ScoreSync already has animation rules and a timeline. The upgrade should unify the user experience without creating a second competing animation engine.

The existing animation engine remains the source of truth.

## D1. Establish one canonical animation workflow

Keep Animate WHEN-to-DO rules and the keyframe timeline as the primary tools.

Move the legacy enter/exit animation interface behind a compatibility or Legacy section while preserving its stored settings and rendering behavior.

Provide beginner-friendly presets that configure the underlying animation system.

Examples:

- Fade in.
- Slide in.
- Scale in.
- Pop.
- Reveal.
- Progress fill.
- Exit and hide.
- Repeat on event.

Every preset must remain editable after application.

## D2. Complete the event catalog

Audit actual event availability and implement the missing supported triggers.

Candidate events include:

- Player kills changed.
- Player knocked.
- Player eliminated.
- Player revived.
- Player death.
- Match started.
- Match ended.
- Round changed.
- Zone phase changed.
- Observed player changed.
- Team placement changed.
- Killfeed entry received.
- Health threshold crossed.

Do not fabricate game events that the feed cannot reliably identify.

Where an event must be derived from state changes, use a dedicated detector with documented semantics.

For example, a revive event can be derived from a verified knocked-to-alive transition only when the player's identity and previous state are known reliably.

## D3. Correct event lifecycle behavior

Prevent:

- Replaying the same event after reconnect.
- Duplicate animations from repeated identical payloads.
- False events caused by missing initial state.
- Stale killfeed entries appearing at match start.
- Animation triggers firing continuously when a condition remains true.
- Timelines accumulating unnecessary event history.

Use stable event identifiers when provided. Where identifiers are absent, implement carefully scoped deduplication using verified event attributes and match context.

Distinguish between:

- A condition that is currently true.
- A condition that has just become true.
- A field whose value has changed.
- A discrete event that occurred.

These are different trigger semantics and must be represented clearly in the UI.

## D4. Improve timeline usability

Support:

- Keyframe selection and editing.
- Scrubbing.
- Playback and pause.
- Frame or time navigation.
- Easing selection.
- Duration editing.
- Layer-specific tracks.
- Event markers.
- Animation preview.
- Reusable animation presets.

Provide a consistent timing model and avoid discrepancies between the editor preview and published runtime.

## D5. Fix the knocked-player style preset

The audit identifies that the existing preset checks `item.liveState`, while the current player data model does not expose that field correctly.

Expose the verified live-state value through the canonical player binding and use it in the shared condition system.

Add tests proving that the preset activates when the intended state is present and returns to normal when the state changes.

# 7. Phase E — Advanced Visual Layer and Component System

The existing layer types should be preserved and expanded carefully.

Audit all existing types, including text, shape, image, repeater, health bar, map, CSS, code, built-in components, video, component instances, and flags.

Do not introduce duplicate implementations of existing functionality.

## E1. Complete layer insertion

Ensure every supported renderable type can be created through the Insert panel.

Include the currently missing video, component, and flag insertion paths if they remain supported by the runtime.

Every inserted layer must receive:

- Valid default properties.
- A stable identifier.
- Correct serialization.
- An appropriate inspector.
- Canvas selection support.
- A usable preview.
- Correct rendering in the published overlay.

## E2. Improve visual editing

Provide professional controls for:

- Position and size.
- Rotation.
- Scale.
- Anchor and transform origin.
- Padding and alignment.
- Opacity.
- Fill and stroke.
- Gradients.
- Shadows.
- Corner radius.
- Masks and clipping.
- Image fitting.
- Text fitting.
- Layer blending where supported.
- Responsive scaling rules.
- Layer ordering.

Support numeric editing and drag-based editing together.

Do not add a visual control unless the underlying renderer can apply the property consistently in both editor and production output.

## E3. Reusable components

Allow users to create reusable component definitions from existing layers.

A component should support:

- Named inputs.
- Data bindings.
- Appearance properties.
- Visibility rules.
- Animation configuration.
- Internal layer organization.
- Preview values.
- Versioning.
- Reuse across multiple themes.

Changing a reusable component should not unexpectedly break previously published revisions.

Use a clear distinction between editing a component definition and editing one instance.

Provide a safe migration or versioning strategy for component changes.

## E4. Professional asset management

Extend the existing asset system with:

- Image uploads.
- Font management.
- Asset previews.
- Search and filtering.
- Usage tracking.
- Missing-asset diagnostics.
- Duplicate detection.
- Appropriate caching.
- Asset replacement without manually reconnecting every layer.

Preserve existing font and asset endpoints and their security constraints.

For external media, validate URLs and supported formats. Do not allow arbitrary remote content to execute inside the graphics renderer.

# 8. Phase F — Ready-Made Live Broadcast Components

Create editable components from ordinary Designer layers and bindings, not hardcoded screenshots or separate rendering systems.

The following are initial component targets.

## F1. Killfeed

- Player and team identity.
- Weapon icon or weapon name.
- Killer and victim.
- Elimination or knock indicator when supported.
- Distance where available.
- Event-specific animation.
- Configurable row count.
- Duplicate-event protection.
- Missing-data fallbacks.

Use verified feed information. Clearly distinguish a true feed event from a derived elimination estimate.

## F2. Zone and circle panel

- Current zone phase.
- Zone timer.
- Circle information.
- Position or radius data where available.
- Configurable warning states.
- Countdown animation.
- Desktop-data availability indicator.

Do not display a fabricated countdown when the actual timer is unavailable.

## F3. Observed-player card

- Player name.
- Team identity.
- Health or live state where available.
- Weapon information.
- Combat statistics.
- Spectator or observed-player indicator.
- Configurable entrance and exit animation.

## F4. Team inventory panel

- Weapons.
- Ammunition.
- Healing items.
- Other verified inventory data.

This component depends on the availability of reliable inventory data. Do not assume POST-only data becomes accessible merely because the relay can observe the original request.

## F5. Weapon and damage statistics

- Damage comparisons.
- Weapon usage.
- Player accuracy or headshot statistics.
- Kill-distance metrics.
- Progress bars and charts.

Provide explicit handling for missing denominators, zero values, and unavailable statistics.

## F6. Additional component ideas

- Match status header.
- Team score strip.
- Player elimination card.
- Match standings.
- Tournament leaderboard.
- MVP statistics.
- Winner announcement.
- Team-versus-team comparison.
- Match recap.
- Sponsor panel.

These components should be created from the same reusable layer system so users can inspect and customize their contents.

# 9. Phase G — Reliable POST-Only Feed Data Integration

The audit identifies important information sent to the local feed server but not currently readable through the available GET endpoints.

Potential data includes:

- Detailed killfeed with weapon and distance.
- Team backpack information.
- Revive events.
- Player assists.
- Airdrop information.

This requires a separate investigation because polling a GET endpoint that does not exist will not solve the problem.

## G1. Verify the actual endpoint contract

Probe the documented or confirmed local endpoints safely.

Determine whether GET mirrors exist, whether the POST requests are handled by a server the project controls, and whether the data is stored or immediately discarded.

Do not assume that an HTTP server supports retrieving the data it receives.

## G2. If GET mirrors exist

Integrate them into the existing local-feed pipeline with:

- Consumer-gated collection.
- Appropriate polling or event-driven delivery.
- Change detection.
- Validation.
- Stable event identities where possible.
- Bounded payloads.
- Tests using captured examples.

## G3. If GET mirrors do not exist

If the user controls the local feed server, investigate adding a bounded in-memory event buffer or read-only snapshot endpoint.

For transient events such as killfeed, use a bounded event queue with event identifiers, match scoping, retention limits, and a defined replay policy.

For current inventory or airdrop state, a snapshot model may be more appropriate.

Avoid persisting unnecessary data indefinitely.

If the server cannot be modified, retain the existing derived-data behavior and document which features cannot be guaranteed.

**Deliverable:** A verified data-access contract for every required event, not a collection of guessed endpoints.

# 10. Phase H — Simulation and Visual Debugging

Simulation must become a first-class development and design tool.

It should help users build graphics without requiring a live match and help developers reproduce production issues.

## H1. Use the production rendering pipeline

The editor simulation must use the same:

- Data normalization.
- Binding resolution.
- Expression evaluator.
- Conditional logic.
- Component rendering.
- Animation engine.
- Layer layout logic.

Simulation may substitute data sources, but it must not use a completely separate rendering implementation.

## H2. Simulation scenarios

Provide sample scenarios for:

- Lobby or pre-match.
- Plane phase.
- Early match.
- Active combat.
- Knock and revive.
- Multiple eliminations.
- Zone transition.
- Late game.
- Winner or match completion.
- Missing local data.
- Relay disconnection.
- Incomplete player statistics.

Use deterministic fixtures so bugs can be reproduced.

## H3. Live data inspector

For a selected layer, display:

- Resolved binding.
- Current value.
- Data source.
- Last update time.
- Evaluation status.
- Fallback value, if any.
- Condition result.
- Animation trigger status.

Include an explanation of why the layer is blank or hidden.

Examples:

- The selected field is unavailable.
- The field requires the desktop relay.
- The value is null.
- The condition evaluates to false.
- The repeater contains no items.
- The referenced asset is missing.
- The selected data source is stale.

Provide a way to switch between sample data, recorded fixtures, and live data where supported.

Never allow simulated values to be mistaken for production values without a visible mode indicator.

# 11. Phase I — Runtime Performance and Bandwidth Optimization

Optimize the actual bottlenecks before introducing new infrastructure.

## I1. Relay optimization

- Use one appropriate upstream connection for co-located overlays when supported by the existing architecture.
- Gate local polling on active consumers.
- Stop unnecessary work when no consumers need it.
- Deduplicate unchanged payloads.
- Avoid repeated full-state broadcasts when a small update is sufficient.
- Reuse existing message formats and delta mechanisms.
- Keep reconnect and initial-state behavior deterministic.
- Measure polling and serialization overhead.

Do not introduce additional upstream connections or polling systems when the existing relay can supply the same data.

## I2. Frontend rendering optimization

- Avoid rerendering unrelated layers for every incoming data update.
- Memoize expensive computations where appropriate.
- Batch related state updates.
- Use stable keys for repeated elements.
- Limit unnecessary animation loops.
- Avoid expensive expression evaluation on every animation frame.
- Cache compiled or parsed expressions safely.
- Avoid fetching unused data tiers.
- Profile large repeaters and complex layouts.

## I3. Data lifecycle and cache correctness

Ensure changes to match selection, match identity, layout revision, and relay state invalidate the correct caches.

Prevent old match data from appearing after a new match starts.

Avoid clearing unrelated caches unnecessarily.

Ensure published overlays recover correctly after:

- Socket disconnects.
- Relay restarts.
- Cloud reconnects.
- Match transitions.
- Layout revision changes.

## I4. Performance budgets

Establish measurable budgets rather than assuming the system is optimized.

Track:

- Local feed payload size.
- Poll frequency.
- Cloud bytes per active overlay.
- Number of upstream connections.
- Average and high-percentile render-update time.
- Canvas responsiveness with many layers.
- Memory use during long sessions.
- Time to recover after reconnect.

Test with realistic multi-overlay OBS scenes and representative live match data.

The goal is not just to reduce network traffic; it is to keep broadcast graphics responsive without sacrificing correct data.

# 12. Phase J — Publishing, Compatibility, and Security

Publishing must be safe and predictable for live tournament use.

## J1. Preserve existing publishing behavior

Maintain the current layout CRUD, publication, revision, export, locking, and asset mechanisms.

Every published overlay should reference an immutable or otherwise well-defined revision.

A user should be able to test a draft without unintentionally changing an active broadcast overlay.

## J2. Validate before publishing

Check for:

- Invalid bindings.
- Unsupported data fields.
- Missing required assets.
- Broken component references.
- Invalid conditions.
- Unsupported animation actions.
- Unavailable required local sources.
- Excessively expensive repeaters or dependencies.
- Invalid dimensions or transforms.

Separate warnings from blocking errors.

Allow intentional use of desktop-only data while making its runtime requirements explicit.

## J3. Backward compatibility

Test older saved themes and published revisions against the new renderer.

Use migrations only when necessary and make them deterministic.

Preserve unknown properties where possible instead of deleting them during import or save.

Retain support for existing `.sstheme`, ZIP, HTML/CSS, and keyframe import/export paths where currently supported.

## J4. Safe execution

Preserve the existing safe expression evaluator. Do not introduce arbitrary `eval` execution or execute user-supplied JavaScript as part of ordinary data binding.

If advanced custom code remains available, keep it isolated behind explicit controls and enforce appropriate runtime and security restrictions.

Validate uploaded files and asset references, and enforce existing authentication, authorization, and publishing permissions.

# 13. Phase K — Testing Strategy

Testing must cover the entire data-to-pixel pipeline rather than only individual components.

## K1. Data registry tests

Verify:

- Every audited field has an appropriate definition or explicit exclusion.
- Known fields have the correct type and category.
- Unknown fields remain discoverable.
- Nested structures and collections are handled safely.
- Cloud-only and desktop-only requirements are correct.
- The two previous pickers now use consistent discovery rules.

## K2. Normalization and runtime tests

Test:

- Valid and invalid feed payloads.
- Missing and null fields.
- Numeric strings.
- Changing team names with stable team IDs.
- Match transitions.
- Stale updates.
- Reconnect recovery.
- Local-feed snapshots.
- Live socket updates.
- Desktop-only placeholders.
- Correct player statistics.

## K3. Animation and condition tests

Test:

- Knocked-player style behavior.
- Kill-count changes.
- Revive detection.
- Match start and end.
- Repeated identical events.
- Event deduplication.
- Compound AND/OR conditions.
- Condition round-trips.
- Missing-field behavior.
- Timeline playback and serialization.

## K4. Relay integration tests

Use a mock local game-feed server populated with sanitized captured payloads.

Verify that:

- Polling starts only when required consumers are active.
- Polling stops when the final consumer disconnects.
- Identical data is deduplicated.
- Changed data is emitted.
- The initial snapshot is correct.
- Errors do not permanently stop polling.
- Reconnects do not replay stale events.
- Existing relay functionality remains intact.

## K5. End-to-end browser tests

Test at least these paths:

1. Open the Designer and create a text layer.
2. Bind it to a live field.
3. Change simulated data and verify the rendered output.
4. Create a repeater using player data.
5. Add a condition through the visual builder.
6. Animate a component on a supported event.
7. Publish a revision.
8. Open the published overlay through the desktop relay.
9. Verify local map, zone, and observed-player data.
10. Open the cloud version and verify correct behavior when local data is unavailable.
11. Reconnect the relay and verify recovery.
12. Open an older theme and verify compatibility.

## K6. Build and regression checks

Run the existing graphics and overlay-client test suites, relay tests, backend tests, and frontend production build.

Use the repository's actual test commands and fix failures introduced by the changes.

Do not claim tests passed unless they were actually executed and their results were inspected.

# 14. Implementation Order and Deliverables

Use small, reviewable phases with explicit completion criteria.

## Milestone 1 — Audit and data contract

Deliver:

- Repository architecture map.
- Verified field inventory.
- Endpoint and event availability matrix.
- Existing failure baseline.
- Proposed canonical data model.
- Prioritized backlog.

## Milestone 2 — Data coverage

Deliver:

- Central data registry.
- Unified picker.
- Expanded normalized player data.
- Verified local-feed integration.
- Published-runtime local scope.
- Dependency-aware data tiers.
- Field-level tests.

## Milestone 3 — No-code interaction

Deliver:

- Unified data-binding controls.
- Friendly field labels.
- Visual condition builder.
- Typed inputs and operators.
- Consistent layer insertion.
- Blank-value explanations.

## Milestone 4 — Animation and components

Deliver:

- Unified animation workflow.
- Missing supported event triggers.
- Correct knocked-player behavior.
- Reusable component workflow.
- Ready-made live broadcast components.
- Simulation scenarios.

## Milestone 5 — Performance and reliability

Deliver:

- Polling and payload deduplication.
- Correct cache invalidation.
- Rendering optimizations.
- Reconnect handling.
- Performance measurements.
- Long-session and multi-overlay tests.

## Milestone 6 — Production readiness

Deliver:

- Backward compatibility verification.
- Publishing validation.
- End-to-end test results.
- Production build results.
- Migration notes.
- Known limitations and follow-up tasks.

Do not begin all phases simultaneously. Complete the critical data contract and integration path before building additional UI on top of it.

# 15. Repository Areas to Investigate

Use the supplied audit as a starting point, then confirm all locations against the actual repository.

### Desktop relay

- `desktop-app/relay/server.cjs`
- Existing relay tests.
- Existing relay version and supervision logic.
- Current local game-feed polling and event handling.

### Data and overlay client

- `front/src/overlayClient/`
- `front/src/graphics/bindings/local.ts`
- `front/src/graphics/bindings/live.ts`
- `front/src/graphics/bindings/fieldCatalog.ts`
- `front/src/graphics/bindings/expr.ts`
- `front/src/graphics/bindings/explain.ts`

### Runtime and rendering

- `front/src/graphics/runtime/OverlayRuntime.tsx`
- `front/src/graphics/renderer/LayoutRenderer.tsx`
- The existing `layoutLiveTiers` implementation.
- Existing simulation and data-source adapters.

### Editor

- `front/src/graphics/editor/DataPicker.tsx`
- `front/src/graphics/editor/Inspector.tsx`
- `front/src/graphics/editor/AnimatePanel.tsx`
- `front/src/graphics/editor/animationLibrary.ts`
- `front/src/graphics/editor/elementFactory.ts`
- `front/src/graphics/editor/inspector/StyleWhenSection.tsx`
- `front/src/graphics/templates/parts.ts`

### Backend and storage

- Existing overlay layout CRUD and publishing endpoints.
- Published overlay runtime endpoints.
- Redis/LRU cache behavior.
- Asset and font endpoints.
- Revision management and compatibility logic.

Inspect the actual implementation before editing. File names and line numbers from the original audit are not guaranteed to remain current.

# 16. Required Engineering Rules

1. Do not rewrite the whole Designer from scratch.
2. Do not create a second renderer or animation engine.
3. Do not duplicate the data picker, field traversal, or condition evaluation logic.
4. Do not invent GET endpoints for POST-only data.
5. Do not change the legacy tournament database or unrelated collections as part of this Designer upgrade.
6. Do not break the existing desktop relay, cloud overlay, theme routes, or published themes.
7. Do not expose arbitrary code execution through normal binding controls.
8. Do not fetch data tiers that the layout does not need.
9. Do not treat missing data as zero or present sample data as live.
10. Do not remove advanced features while simplifying the interface.
11. Do not claim completion based on successful compilation alone.
12. Do not modify unrelated production infrastructure without a demonstrated need.
13. Keep changes scoped, tested, documented, and reversible.
14. Prefer existing dependencies and utilities over introducing new packages.
15. Report blockers honestly, especially when a required game-feed source is outside the repository's control.

# 17. Definition of Done

The upgrade is complete only when all of the following are demonstrated:

- Every verified game-feed field is discoverable through the unified registry, or has a documented and justified exclusion.
- Every supported field can be selected and used in the appropriate visual component.
- Published overlays receive the correct local data through the relay.
- Cloud-only overlays explain unavailable desktop fields without breaking other graphics.
- The editor, simulation, and published runtime use consistent rendering and binding behavior.
- Beginners can create a data-bound overlay without writing binding paths, JSON, or CSS.
- Advanced users retain access to the existing detailed editing capabilities.
- Conditions and animations work through a unified visual workflow.
- Missing data, stale data, and unsupported sources are diagnosable.
- Reusable components can be customized and safely versioned.
- Unnecessary polling, duplicate network traffic, and unused data fetching are reduced and measured.
- Existing themes, publishing, import/export, and revisions remain compatible.
- Automated tests and production builds pass, with actual results documented.
- A complete end-to-end demonstration shows a user building, simulating, publishing, and running a working overlay.

## Final instruction to the implementation agent

Treat this as a production engineering project, not a cosmetic UI redesign.

First establish the truth of the current architecture and game-feed contract. Then close the data-availability gaps. After that, simplify the workflow, unify conditions and animation, and expand reusable components. Finally, optimize performance and validate the entire system under realistic live broadcast conditions.

At every milestone, provide:

- What was inspected.
- What was changed.
- Which files were modified.
- Why the implementation is correct.
- Which tests were run and their actual results.
- What remains incomplete.
- Any limitations imposed by the external game feed.

**Success means that ScoreSync becomes a flexible, professional no-code broadcast graphics platform in which data availability, visual customization, animation, and reliable live delivery work as one coherent system.**
