// /designer/:id — the Designer editor shell.
//
//   toolbar:  back · name · save status · undo/redo · LIVE|SIMULATION · zoom · preview · history · lock · publish
//   Saving is manual: nothing is written until Save / Ctrl+S (or Publish / Lock, which save first).
//   left:     Insert / Layers        centre: Canvas        right: Inspector (or History)
//   status:   mode + engine phase · simulation controls · zoom · selection · element count
//
// State: the document, selection and history live in ONE reducer
// (store.ts). The preview engines are separate: switching LIVE <-> SIMULATION
// only swaps which engine feeds the canvas; it never touches the document.
// LIVE uses the app's shared SocketManager socket (createAppTransport) — no
// extra realtime connection; SIMULATION is the real engine on scripted frames.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import type { LayoutDocument, LayoutElement, TimelineProp } from '../schema/layoutTypes.ts';
import { countElements, createEmptyLayout } from '../schema/layoutSchema.js';
import { layoutsApi, overlayUrl, apiErrorMessage, findThemeSlot, ConflictError, LockedError, type CustomTheme, type LayoutDefaults, type LayoutFull, type LayoutSummary } from '../api.ts';
import { ThemeAssign, applyThemeChoice, defaultThemeChoice, useCustomThemes, type ThemeChoice } from './ThemeAssign.tsx';
import { viewLabel } from '../../dashboard/overlayViews.ts';
import { LayoutRenderer } from '../renderer/LayoutRenderer.tsx';
import { useOverlayEngine, useEngineEvent } from '../../overlayClient/react.ts';
import { createAppTransport } from '../../overlayClient/appTransport.ts';
import type { EngineEvent, EngineOptions } from '../../overlayClient/engineTypes.ts';
import { type Command, addElementsCmd, editElements, editorReducer, initEditor, removeElementsCmd, setDocFieldCmd } from './store.ts';
import { newId } from './ids.ts';
import { isTypingTarget } from './useEditorHotkeys.ts';
import { addAtCanvasCmd, duplicateCmd, groupCmd, insertionTarget, moveToParentCmd, nudgeCmd, patchCmd, regroupTargets, reorderCmd, ungroupCmd } from './ops.ts';
import { absoluteOrigin, allIds, childrenOf, locate } from './tree.ts';
import { createSimulation, SIM_ROUND_ID, SIM_TOURNAMENT_ID, type Simulation } from './simulation.ts';
import { canvasSampleEvent } from './scope.ts';
import { EMPTY_FEED, feedReducer, type FeedState } from '../bindings/index.ts';
import { Canvas } from './Canvas.tsx';
import type { DrawTool, DrawnShape } from './ToolLayer.tsx';
import { createElement, type InsertKind } from './elementFactory.ts';
import { copyLayers, pasteLayersCmd } from './clipboard.ts';
import { ShortcutsPanel } from './ShortcutsPanel.tsx';
import { alignCmd, distributeCmd } from './align.ts';
import { cloneWithNewIds } from './ids.ts';
import { createPreviewStore } from '../renderer/useTimeline.ts';
import { toElementPath, type Anchor } from './pathTools.ts';
import { copyStyle, pasteStyle, hasCopiedStyle } from './StylePanels.tsx';
import { buildScope, resolveStyleValue } from '../bindings/index.ts';
import { TimelinePanel, type TimelineUiState } from './TimelinePanel.tsx';
import { AnimatePanel } from './AnimatePanel.tsx';
import { InfoButton, QuickStart, guideSeen, markGuideSeen } from './Help.tsx';
import { anchorScrollDelta, clampZoom, wheelZoom } from './zoom.ts';
import { CACHE_KEYS, cached, invalidate } from '../requestCache.ts';
import { clipsOf, upsertKeyframe } from './timelineOps.ts';
import { scopeForElement } from './scope.ts';
import { InsertPanel } from './InsertPanel.tsx';
import { BuiltinBrowser } from './BuiltinBrowser.tsx';
import { LayersPanel } from './LayersPanel.tsx';
import { Inspector } from './Inspector.tsx';
import { useFontLibrary } from './FontPicker.tsx';
import { HistoryPanel } from './HistoryPanel.tsx';
import { ConflictDialog, PublishDialog, elementIdAtPath } from './dialogs.tsx';
import { exportLayoutFile } from './ImportThemeDialog.tsx';
import { SAVE_LABEL, saveStatusColor, useAutosave, type SavePatch } from './autosave.ts';
import { useEditorHotkeys } from './useEditorHotkeys.ts';
import { Btn, Tabs, cx } from './ui.tsx';
import { useAssetLibrary } from './useAssets.ts';
import { AssetGrid, AssetPickerDialog } from './AssetLibrary.tsx';
import { SwatchContext } from './ColorPicker.tsx';
import { CanvasMenu, type MenuEntry, ToolbarMenu } from './CanvasMenu.tsx';
import { LiveSourceBar } from './LiveSourceBar.tsx';
import { acceptsImage, createImageElement, isFrame, removeFrameImageCmd, setLayerImageCmd, type AssetLike } from './imageOps.ts';
import { SHAPE_PRESETS, polygonFields, shapePreset } from './shapes.ts';
import { assetIdOf, assetRef } from '../renderer/assets.ts';
import type { CanvasDropTarget } from './Canvas.tsx';
import type { BindableProp, ImageFill } from '../schema/layoutTypes.ts';
import { DataPanel } from './DataPanel.tsx';
import { CssImportDialog } from './CssImportDialog.tsx';
import { bindablePropsFor } from './Inspector.tsx';
import { defaultPropFor, propLabel, valueKind } from '../bindings/compat.ts';
import { resolvePathDetailed } from '../bindings/index.ts';
import { SIM_SCENARIOS } from './simulation.ts';

type PreviewMode = 'live' | 'sim';
const EVENT_TYPES = new Set(['kill', 'elimination', 'milestone', 'recall', 'matchStart', 'matchEnd', 'rankChange', 'killsChange', 'knock', 'revive', 'playerDeath']);
const ZOOM_STEPS = [0.1, 0.15, 0.2, 0.25, 0.33, 0.4, 0.5, 0.6, 0.75, 1, 1.25, 1.5, 2, 3, 4];

/** A failing panel shows a retry card instead of taking the editor down. */
class PanelBoundary extends React.Component<{ name: string; children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(`[designer] ${this.props.name} crashed:`, error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="m-3 rounded border border-red-500/30 bg-red-500/10 p-3 text-[11px] text-red-200">
        <div className="mb-2">{this.props.name} hit an error: {this.state.error.message}</div>
        <Btn small onClick={() => this.setState({ error: null })}>Retry</Btn>
      </div>
    );
  }
}

/** Route entry: re-mount per layout id so /designer/a -> /designer/b starts clean. */
export default function DesignerEditorPage() {
  const { id = '' } = useParams<{ id: string }>();
  return <DesignerEditor key={id} id={id} />;
}

type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'notFound' } | { kind: 'error'; message: string };

function DesignerEditor({ id }: { id: string }) {
  const navigate = useNavigate();
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [mode, setMode] = useState<PreviewMode>('sim');
  const [meta, setMeta] = useState<LayoutSummary | null>(null);
  const [st, dispatch] = useReducer(editorReducer, undefined, () => initEditor(createEmptyLayout() as LayoutDocument));
  const stRef = useRef(st);
  stRef.current = st;
  const [conflictRev, setConflictRev] = useState<number | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rightTab, setRightTab] = useState<'inspect' | 'history'>('inspect');
  const [leftTab, setLeftTab] = useState<'insert' | 'layers' | 'graphics' | 'assets' | 'dataPanel'>('layers');
  const [cssOpen, setCssOpen] = useState(false);
  const assets = useAssetLibrary();
  // The frame whose picture is being repositioned on the canvas.
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ id: string | null; clientX: number; clientY: number; point: { x: number; y: number } } | null>(null);
  // The Image tool drew a box and is waiting for a picture; "Replace image…" waits the same way for a layer.
  const [imageBox, setImageBox] = useState<DrawnShape | null>(null);
  const [replaceFor, setReplaceFor] = useState<string | null>(null);
  const [polygonShape, setPolygonShape] = useState('hexagon');
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const customThemes = useCustomThemes();
  const fontLibrary = useFontLibrary();
  const themeSlot = customThemes.themes ? findThemeSlot(customThemes.themes, id) : null;

  const locked = !!meta?.productionLocked;
  const readOnly = locked || load.kind !== 'ready';
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  // ── persistence ──────────────────────────────────────────────────────────
  const save = useCallback(async (expectedRev: number, patch: SavePatch) => {
    const res = await layoutsApi.save(id, expectedRev, patch);
    setMeta((m) => (m ? { ...m, ...summaryOf(res) } : m));
    invalidate(CACHE_KEYS.layouts); // the list page's cached copy is now out of date
    return res;
  }, [id]);

  const autosave = useAutosave({
    layoutId: load.kind === 'ready' ? id : null,
    initialRev: meta?.draftRev ?? null,
    doc: st.doc,
    version: st.version,
    save,
    onConflict: (rev) => { setConflictRev(rev); setConflictOpen(true); },
  });
  const ctl = autosave.controller;

  const applyServer = useCallback((full: LayoutFull) => {
    autosave.ignoreVersion(stRef.current.version + 1);
    dispatch({ type: 'load', doc: full.draft });
    setMeta(summaryOf(full));
  }, [autosave]);

  useEffect(() => {
    let alive = true;
    // ttl 0 = never served from cache, but two mounts in the same tick (dev StrictMode) share one request.
    cached(`layout:${id}`, () => layoutsApi.get(id), { ttlMs: 0 })
      .then((full) => {
        if (!alive) return;
        autosave.ignoreVersion(stRef.current.version + 1);
        dispatch({ type: 'load', doc: full.draft });
        setMeta(summaryOf(full));
        setMode(full.defaults?.tournamentId && full.defaults?.roundId ? 'live' : 'sim');
        setLoad({ kind: 'ready' });
      })
      .catch((err) => {
        if (!alive) return;
        const status = err?.response?.status;
        if (status === 404 || status === 403 || status === 400) setLoad({ kind: 'notFound' });
        else setLoad({ kind: 'error', message: apiErrorMessage(err, 'Could not load the layout') });
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // A 423 from autosave means someone locked it: reflect the server's truth.
  useEffect(() => {
    if (autosave.status !== 'locked') return;
    layoutsApi.get(id).then((full) => setMeta(summaryOf(full))).catch(() => {});
  }, [autosave.status, id]);

  // ── preview engines ──────────────────────────────────────────────────────
  const simRef = useRef<Simulation | null>(null);
  if (!simRef.current) simRef.current = createSimulation();
  const defaults = meta?.defaults;
  const liveReady = !!(defaults?.tournamentId && defaults?.roundId);
  // Preview-only: one pinned match, or null = follow the operator's selection (what a published overlay does).
  const [previewMatchId, setPreviewMatchId] = useState<string | null>(null);
  const liveOptions = useMemo<EngineOptions | null>(() => (
    mode === 'live' && liveReady
      ? { tournamentId: defaults!.tournamentId!, roundId: defaults!.roundId!, matchId: previewMatchId, followSelected: !previewMatchId, view: null }
      : null
  ), [mode, liveReady, defaults, previewMatchId]);
  const simOptions = useMemo<EngineOptions | null>(() => (
    mode === 'sim' ? { tournamentId: SIM_TOURNAMENT_ID, roundId: SIM_ROUND_ID, matchId: null, followSelected: true, view: null } : null
  ), [mode]);
  const makeLive = useCallback(() => createAppTransport(), []);
  const makeSim = useCallback(() => simRef.current!.transport, []);
  const live = useOverlayEngine(liveOptions, makeLive);
  const sim = useOverlayEngine(simOptions, makeSim);
  const engineState = mode === 'live' ? live.state : sim.state;
  const engine = mode === 'live' ? live.engine : sim.engine;

  const [lastEvents, setLastEvents] = useState<Partial<Record<string, EngineEvent>>>({});
  const [feed, setFeed] = useState<FeedState>(EMPTY_FEED);
  useEngineEvent(engine, '*', (ev) => {
    if (EVENT_TYPES.has(ev.type)) setLastEvents((prev) => ({ ...prev, [ev.type]: ev }));
    setFeed((f) => feedReducer(f, ev));
  });
  useEffect(() => { setLastEvents({}); setFeed(EMPTY_FEED); }, [mode]);
  // The data a drop / a check resolves against, readable from stable callbacks.
  const dataRef = useRef({ state: engineState, lastEvents, feed });
  dataRef.current = { state: engineState, lastEvents, feed };
  const [previewEvents, setPreviewEvents] = useState(true);
  // Canvas tools (V select, A direct, P pen, N pencil, H hand, I eyedropper); Space = temporary hand.
  const [tool, setTool] = useState<DrawTool>('select');
  const [spaceHand, setSpaceHand] = useState(false);
  // Timeline dock: which clip is open, the playhead, record mode.
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [playTimelines, setPlayTimelines] = useState(true);
  const [tlUi, setTlUiState] = useState<TimelineUiState>({ clipId: null, playhead: 0, recording: false });
  const setTlUi = useCallback((patch: Partial<TimelineUiState>) => setTlUiState((s) => ({ ...s, ...patch })), []);
  const [tlPreviewing, setTlPreviewing] = useState(false);
  // The dock shows the same clips two ways: plain rules (Animate) or keyframes.
  const [dockView, setDockView] = useState<'animate' | 'keyframes'>('animate');
  // Scrub / preview frames go straight to the previewed layer's DOM node: no React render per frame.
  const previewStore = useMemo(() => createPreviewStore(), []);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [rulersHidden, setRulersHidden] = useState(false);
  const [renameRequest, setRenameRequest] = useState<{ id: string; n: number } | null>(null);
  const keyframesOpen = timelineOpen && dockView === 'keyframes';
  const [guideOpen, setGuideOpen] = useState(() => !guideSeen());
  const closeGuide = useCallback(() => { markGuideSeen(); setGuideOpen(false); }, []);
  const tlRef = useRef({ tlUi, timelineOpen: keyframesOpen });
  tlRef.current = { tlUi, timelineOpen: keyframesOpen };
  const tlElementId = st.selected.length === 1 ? st.selected[0] : null;
  // Nothing is being previewed once the dock is closed.
  useEffect(() => { if (!timelineOpen) previewStore.set(null); }, [timelineOpen, previewStore]);
  const timelineScope = useMemo(
    () => scopeForElement(st.doc, tlElementId, engineState, lastEvents, feed),
    [st.doc, tlElementId, engineState, lastEvents, feed]
  );
  const sampleTeamId = engineState?.derived?.teams?.[0]?.teamId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sample = useMemo(() => canvasSampleEvent(engineState), [sampleTeamId, mode]);

  // ── document commands ────────────────────────────────────────────────────
  const exec = useCallback((cmd: Command | null) => {
    if (!cmd || readOnlyRef.current) return;
    dispatch({ type: 'exec', cmd });
  }, []);
  const select = useCallback((ids: string[]) => dispatch({ type: 'select', ids }), []);
  const selectOne = useCallback((id: string) => dispatch({ type: 'select', ids: [id] }), []);

  const onGeometry = useCallback((changes: Array<{ id: string; patch: Partial<LayoutElement> }>, key: string) => {
    if (readOnlyRef.current) return;
    ctl?.hold(true);
    const byId = new Map(changes.map((c) => [c.id, c.patch]));
    const { tlUi: t, timelineOpen: open } = tlRef.current;
    const one = changes.length === 1 ? locate(stRef.current.doc.elements, changes[0].id)?.el : null;
    if (open && t.recording && t.clipId && one && clipsOf(one).some((c) => c.id === t.clipId)) {
      // Record mode: the gesture writes keyframes at the playhead instead of moving the base.
      const patch = changes[0].patch;
      exec(editElements(stRef.current.doc, [one.id], (el) => (Object.keys(patch) as Array<keyof LayoutElement>).reduce((acc, k) => {
        const prop = ({ x: 'x', y: 'y', w: 'w', h: 'h', rotation: 'rotation' } as Record<string, TimelineProp>)[k as string];
        return prop ? upsertKeyframe(acc, t.clipId!, prop, t.playhead, Number(patch[k])) : acc;
      }, el), 'Record keyframe', key));
      return;
    }
    exec(editElements(stRef.current.doc, Array.from(byId.keys()), (el) => ({ ...el, ...byId.get(el.id) }), 'Transform', key));
  }, [ctl, exec]);
  const onGestureEnd = useCallback(() => {
    dispatch({ type: 'endGesture' });
    ctl?.hold(false);
  }, [ctl]);
  /** Esc mid-drag: stop, and take back what the drag had already changed (it is one history step). */
  const onGestureCancel = useCallback((changed: boolean) => {
    dispatch({ type: 'endGesture' });
    ctl?.hold(false);
    if (changed) dispatch({ type: 'undo' });
  }, [ctl]);

  // ── images ───────────────────────────────────────────────────────────────
  /** Use an image: into the target layer when it can hold one (a frame, an image layer), else as a new layer. */
  const applyAsset = useCallback((asset: AssetLike, target: { id: string | null; point?: { x: number; y: number } }) => {
    if (readOnlyRef.current) return;
    const d = stRef.current.doc;
    const el = target.id ? locate(d.elements, target.id)?.el : null;
    if (el && acceptsImage(el) && !el.locked) {
      exec(setLayerImageCmd(d, el.id, assetRef(asset._id)));
      select([el.id]);
      return;
    }
    const img = createImageElement(d, asset, target.point);
    // Dropped at a point: into the group under it. Picked from the library: next to the selection.
    exec(addAtCanvasCmd(d, [img], target.point ? undefined : insertionTarget(d, stRef.current.selected)).cmd);
    select([img.id]);
  }, [exec, select]);

  const onDropFiles = useCallback(async (files: File[], target: CanvasDropTarget) => {
    if (readOnlyRef.current) return;
    if (!files.length) { setBanner('Only PNG, JPEG, WebP and SVG images can be dropped on the canvas.'); return; }
    setLeftTab('assets'); // upload progress and any error show there
    setPanelsHidden(false);
    const made = await assets.upload(files);
    made.forEach((a, i) => applyAsset(a, i === 0 ? target : { id: null, point: { x: target.point.x + i * 40, y: target.point.y + i * 40 } }));
    if (made.length < files.length) setBanner(`${files.length - made.length} of ${files.length} image${files.length === 1 ? '' : 's'} could not be uploaded. The reason is in the Assets tab.`);
  }, [assets, applyAsset]);

  // ── data ─────────────────────────────────────────────────────────────────
  /** Connect one property of a layer to a data field (formatter / fallback of an existing binding are kept). */
  const bindField = useCallback((eid: string, prop: BindableProp, path: string) => {
    if (readOnlyRef.current) return;
    exec(editElements(stRef.current.doc, [eid], (el) => ({ ...el, bind: { ...(el.bind || {}), [prop]: { ...(el.bind?.[prop] || {}), path } } }), `Bind ${prop}`));
    select([eid]);
  }, [exec, select]);

  /** A field dragged from the Data tab onto a layer: bind the property that fits what the field holds. */
  const onDropField = useCallback((path: string, target: CanvasDropTarget) => {
    if (readOnlyRef.current) return;
    const d = stRef.current.doc;
    const el = target.id ? locate(d.elements, target.id)?.el : null;
    if (!el) { setBanner('Drop the field on a layer to connect that layer to it.'); return; }
    const found = resolvePathDetailed(scopeForElement(d, el.id, dataRef.current.state, dataRef.current.lastEvents, dataRef.current.feed), path);
    const kind = valueKind(found.found ? found.value : undefined);
    const prop = defaultPropFor(bindablePropsFor(el.type), kind);
    if (!prop) { setBanner(`“${el.name || el.type}” has no property that ${path} can drive. Select the layer and use the Data section on the right to choose one.`); return; }
    bindField(el.id, prop, path);
    setBanner(`Connected ${propLabel(prop)} of “${el.name || el.type}” to ${path}.`);
  }, [bindField]);

  const onDropAsset = useCallback((assetId: string, target: CanvasDropTarget) => {
    const a = assets.assets?.find((x) => x._id === assetId);
    if (a) applyAsset(a, target);
  }, [assets.assets, applyAsset]);

  const onAdjustImage = useCallback((eid: string, fill: ImageFill, key: string) => {
    if (readOnlyRef.current) return;
    ctl?.hold(true);
    exec(editElements(stRef.current.doc, [eid], (el) => ({ ...el, imageFill: fill }), 'Reposition image', key));
  }, [ctl, exec]);
  const endAdjust = useCallback(() => { setAdjustId(null); dispatch({ type: 'endGesture' }); ctl?.hold(false); }, [ctl]);
  /** Start repositioning, if that layer is a frame with a picture in it. */
  const startAdjust = useCallback((eid: string | null | undefined) => {
    const el = eid ? locate(stRef.current.doc.elements, eid)?.el : null;
    if (el && isFrame(el) && el.imageFill?.src && !el.locked && !readOnlyRef.current) { select([el.id]); setTool('select'); setAdjustId(el.id); return true; }
    return false;
  }, [select]);

  const insert = useCallback((els: LayoutElement[], parentId: string | null, index: number | null = null) => {
    if (readOnlyRef.current || !els.length) return;
    exec(addElementsCmd(els, parentId, index));
    select(els.map((e) => e.id));
    setLeftTab('layers');
  }, [exec, select]);

  const insertBuiltin = useCallback((el: LayoutElement) => insert([el], null), [insert]);
  const onLayerToggle = useCallback((eid: string, key: 'hidden' | 'locked' | 'clipToBelow') => {
    const el = locate(stRef.current.doc.elements, eid)?.el;
    if (el) exec(patchCmd(stRef.current.doc, [eid], { [key]: el[key] ? undefined : true }, key === 'hidden' ? 'Toggle visibility' : key === 'locked' ? 'Toggle lock' : 'Clipping mask'));
  }, [exec]);
  const onLayerRename = useCallback((eid: string, name: string) => exec(patchCmd(stRef.current.doc, [eid], { name: name || undefined }, 'Rename')), [exec]);
  const onLayerDelete = useCallback((ids: string[]) => exec(removeElementsCmd(stRef.current.doc, ids)), [exec]);
  const onLayerReorder = useCallback((eid: string, move: 1 | -1) => exec(reorderCmd(stRef.current.doc, eid, move)), [exec]);

  const selected = st.selected;
  const deleteSel = useCallback(() => exec(removeElementsCmd(stRef.current.doc, stRef.current.selected)), [exec]);
  /** Move layers into / out of a group (Layers drag, right-click menu), keeping them where they are on screen. */
  const moveLayers = useCallback((ids: string[], parentId: string | null, index: number | null) => {
    if (readOnlyRef.current) return;
    const cmd = moveToParentCmd(stRef.current.doc, ids, parentId, index);
    if (cmd) { exec(cmd); select(ids); }
  }, [exec, select]);
  const duplicate = useCallback(() => {
    if (readOnlyRef.current) return;
    const r = duplicateCmd(stRef.current.doc, stRef.current.selected);
    if (r) { exec(r.cmd); select(r.newIds); }
  }, [exec, select]);
  const group = useCallback(() => {
    if (readOnlyRef.current) return;
    const r = groupCmd(stRef.current.doc, stRef.current.selected);
    if (r) { exec(r.cmd); select([r.groupId]); }
  }, [exec, select]);
  const ungroup = useCallback(() => {
    if (readOnlyRef.current || stRef.current.selected.length !== 1) return;
    const r = ungroupCmd(stRef.current.doc, stRef.current.selected[0]);
    if (r) { exec(r.cmd); select(r.childIds); }
  }, [exec, select]);

  const canGroup = useMemo(() => {
    if (selected.length < 2) return false;
    const parents = new Set(selected.map((sid) => locate(st.doc.elements, sid)?.parentId ?? '∅'));
    return parents.size === 1;
  }, [selected, st.doc.elements]);
  const canUngroup = selected.length === 1 && locate(st.doc.elements, selected[0])?.el.type === 'group';

  // ── zoom ─────────────────────────────────────────────────────────────────
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.5);
  const [fitMode, setFitMode] = useState(true);
  const [safeZones, setSafeZones] = useState(false);
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !fitMode) return;
    const fit = () => {
      const r = vp.getBoundingClientRect();
      const z = Math.min((r.width - 64) / st.doc.stage.width, (r.height - 64) / st.doc.stage.height);
      if (z > 0) setZoom(Math.max(0.05, Math.round(z * 1000) / 1000));
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(vp);
    return () => ro?.disconnect();
  }, [fitMode, st.doc.stage.width, st.doc.stage.height, load.kind]);
  // Wheel over the canvas zooms the CANVAS (toward the cursor) and nothing else:
  // the page neither scrolls nor browser-zooms (Ctrl+wheel / pinch). Shift+wheel pans sideways.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const zoomAnchor = useRef<{ pointer: { x: number; y: number }; before: { left: number; top: number; zoom: number } } | null>(null);
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) { vp.scrollLeft += e.deltaY || e.deltaX; return; }
      const cur = zoomRef.current;
      const next = wheelZoom(cur, e.deltaY, { deltaMode: e.deltaMode, pinch: e.ctrlKey || e.metaKey });
      if (next === cur) return;
      const stage = vp.querySelector('[data-stage]')?.getBoundingClientRect();
      zoomAnchor.current = stage ? { pointer: { x: e.clientX, y: e.clientY }, before: { left: stage.left, top: stage.top, zoom: cur } } : null;
      zoomRef.current = next;
      setFitMode(false);
      setZoom(next);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, []);
  // After the zoom has been laid out: scroll so the point under the cursor has not moved.
  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    const vp = viewportRef.current;
    zoomAnchor.current = null;
    if (!a || !vp) return;
    const stage = vp.querySelector('[data-stage]')?.getBoundingClientRect();
    if (!stage) return;
    const { dx, dy } = anchorScrollDelta({ pointer: a.pointer, before: a.before, after: { left: stage.left, top: stage.top, zoom } });
    vp.scrollLeft += dx;
    vp.scrollTop += dy;
  }, [zoom]);
  /** Shift+2: fill the viewport with the selected layers (the whole stage when nothing is selected). */
  function zoomToSelection() {
    const vp = viewportRef.current;
    const d = stRef.current.doc;
    const boxes = stRef.current.selected
      .map((id) => { const loc = locate(d.elements, id); const o = absoluteOrigin(d.elements, id); return loc && o ? { x: o.x, y: o.y, w: loc.el.w, h: loc.el.h } : null; })
      .filter(Boolean) as Array<{ x: number; y: number; w: number; h: number }>;
    if (!vp || !boxes.length) { setFitMode(true); return; }
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.w));
    const y1 = Math.max(...boxes.map((b) => b.y + b.h));
    const r = vp.getBoundingClientRect();
    const next = clampZoom(Math.min((r.width - 120) / Math.max(1, x1 - x0), (r.height - 120) / Math.max(1, y1 - y0)));
    setFitMode(false);
    setZoom(Math.round(next * 1000) / 1000);
    // once laid out at the new zoom, centre the selection
    requestAnimationFrame(() => {
      const stage = vp.querySelector('[data-stage]')?.getBoundingClientRect();
      if (!stage) return;
      vp.scrollLeft += stage.left + ((x0 + x1) / 2) * next - (r.left + r.width / 2);
      vp.scrollTop += stage.top + ((y0 + y1) / 2) * next - (r.top + r.height / 2);
    });
  }
  const stepZoom = (dir: 1 | -1) => {
    setFitMode(false);
    setZoom((z) => {
      const next = dir > 0 ? ZOOM_STEPS.find((s) => s > z + 0.001) : [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001);
      return next ?? z;
    });
  };

  // ── hotkeys ──────────────────────────────────────────────────────────────
  useEditorHotkeys({
    deleteSelection: deleteSel,
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    save: () => { void ctl?.flush(); },
    duplicate,
    clearSelection: () => select([]),
    nudge: (dx, dy) => exec(nudgeCmd(stRef.current.doc, stRef.current.selected, dx, dy)),
    group,
    ungroup,
    selectAll: () => select(stRef.current.doc.elements.filter((e) => !e.locked && !e.hidden).map((e) => e.id)),
    setTool,
    setOpacity: (pct) => exec(editElements(stRef.current.doc, stRef.current.selected, (el) => { const next = { ...el }; if (pct >= 100) delete next.opacity; else next.opacity = pct / 100; return next; }, 'Opacity', `opacity:${stRef.current.selected.join(',')}`)),
    copy: () => { const n = copyLayers(stRef.current.doc, stRef.current.selected); if (n) setBanner(`Copied ${n} layer${n > 1 ? 's' : ''} — Ctrl+V pastes.`); },
    cut: () => { if (copyLayers(stRef.current.doc, stRef.current.selected)) deleteSel(); },
    paste: () => { const r = pasteLayersCmd(stRef.current.doc, stRef.current.selected); if (r) { exec(r.cmd); select(r.newIds); } },
    rename: () => { const id = stRef.current.selected[0]; if (id) { setLeftTab('layers'); setPanelsHidden(false); setRenameRequest((r) => ({ id, n: (r?.n ?? 0) + 1 })); } },
    reorder: (move) => { for (const id of stRef.current.selected) exec(reorderCmd(stRef.current.doc, id, move)); },
    align: (mode) => exec(alignCmd(stRef.current.doc, stRef.current.selected, mode, stRef.current.selected.length < 2)),
    distribute: (axis) => exec(distributeCmd(stRef.current.doc, stRef.current.selected, axis)),
    selectChildren: () => { const el = stRef.current.selected.length === 1 ? locate(stRef.current.doc.elements, stRef.current.selected[0])?.el : null; if (el?.children?.length) select(el.children.map((c) => c.id)); },
    selectParent: () => { const loc = stRef.current.selected.length ? locate(stRef.current.doc.elements, stRef.current.selected[0]) : null; if (loc?.parentId) select([loc.parentId]); },
    selectSibling: (dir) => {
      const d = stRef.current.doc;
      const loc = stRef.current.selected.length ? locate(d.elements, stRef.current.selected[0]) : null;
      const sibs = loc ? childrenOf(d.elements, loc.parentId) : d.elements;
      if (!sibs.length) return;
      // the list reads top-most first, so "next" walks down the stack
      const i = loc ? sibs.findIndex((e) => e.id === loc.el.id) : dir > 0 ? sibs.length : -1;
      select([sibs[(i - dir + sibs.length) % sibs.length].id]);
    },
    zoomFit: () => setFitMode(true),
    zoom100: () => { setFitMode(false); setZoom(1); },
    zoomStep: (dir) => stepZoom(dir),
    zoomSelection: () => zoomToSelection(),
    toggleRulers: () => setRulersHidden((v) => !v),
    togglePanels: () => setPanelsHidden((v) => !v),
    toggleHidden: () => { const ids = stRef.current.selected; const any = ids.some((id) => !locate(stRef.current.doc.elements, id)?.el.hidden); exec(patchCmd(stRef.current.doc, ids, { hidden: any ? true : undefined }, 'Toggle visibility')); },
    toggleLocked: () => { const ids = stRef.current.selected; const any = ids.some((id) => !locate(stRef.current.doc.elements, id)?.el.locked); exec(patchCmd(stRef.current.doc, ids, { locked: any ? true : undefined }, 'Toggle lock')); },
    showShortcuts: () => setShortcutsOpen(true),
    adjustImage: () => { if (stRef.current.selected.length === 1) startAdjust(stRef.current.selected[0]); },
    copyStyle: () => { const el = stRef.current.selected.length === 1 ? locate(stRef.current.doc.elements, stRef.current.selected[0])?.el : null; if (el) { copyStyle(el); setBanner('Style copied — Ctrl+Alt+V pastes it onto other layers.'); } },
    pasteStyle: () => { if (hasCopiedStyle()) exec(editElements(stRef.current.doc, stRef.current.selected, pasteStyle, 'Paste style')); },
    toggleGrid: () => setEditorMeta({ grid: { ...(stRef.current.doc.editor?.grid || { size: 20 }), show: !stRef.current.doc.editor?.grid?.show } }, 'Grid'),
  }, readOnly, load.kind === 'ready' && !publishOpen && !conflictOpen && !previewOpen && !shortcutsOpen && !guideOpen && !adjustId && !imageBox && !replaceFor && !cssOpen);

  // ── freeform tools ───────────────────────────────────────────────────────
  /** Guides / grid live in doc.editor (undoable, saved with the layout, ignored by OBS). */
  function setEditorMeta(patch: Partial<NonNullable<LayoutDocument['editor']>>, label: string) {
    const d = stRef.current.doc;
    exec(setDocFieldCmd(d, 'editor', { ...(d.editor || {}), ...patch }, label));
  }

  const onCreatePath = useCallback((anchors: Anchor[], closed: boolean) => {
    if (readOnlyRef.current) return;
    const d = stRef.current.doc;
    const fields = toElementPath(anchors, closed);
    const el: LayoutElement = {
      id: newId('path', allIds(d.elements)),
      type: 'path',
      name: closed ? 'Shape' : 'Path',
      ...fields,
      style: closed ? { fill: { ref: 'theme.colors.primary' }, stroke: '#ffffff', strokeWidth: 2 } : { stroke: '#ffffff', strokeWidth: 4 },
    };
    exec(addAtCanvasCmd(d, [el]).cmd);
    select([el.id]);
  }, [exec, select]);

  /** R / O / L / T: a shape tool finished a drag (or a click). */
  const onCreateShape = useCallback((shape: DrawnShape) => {
    if (readOnlyRef.current) return;
    const d = stRef.current.doc;
    // The Image tool only marks where the picture goes: the library opens next.
    if (shape.tool === 'image') { setImageBox(shape); return; }
    let el: LayoutElement;
    if (shape.tool === 'polygon') {
      const preset = shapePreset(polygonShape) || SHAPE_PRESETS[0];
      el = {
        id: newId('polygon', allIds(d.elements)), name: preset.label, x: shape.x, y: shape.y, w: shape.w, h: shape.h,
        ...polygonFields(preset.points(shape.w, shape.h), shape.w, shape.h),
        style: { fill: { ref: 'theme.colors.primary' } },
      } as LayoutElement;
    } else if (shape.tool === 'frame') {
      // A frame is a group that clips: what is put inside never shows past its edge.
      el = { id: newId('frame', allIds(d.elements)), type: 'group', name: 'Frame', x: shape.x, y: shape.y, w: shape.w, h: shape.h, mask: { shape: 'rect' }, children: [] };
    } else {
      const kind: InsertKind = shape.tool === 'ellipse' ? 'circle' : shape.tool === 'roundRect' ? 'rect' : shape.tool;
      el = createElement(kind, d);
      el.x = shape.x; el.y = shape.y; el.w = shape.w; el.h = shape.h;
      if (shape.tool === 'roundRect') { el.name = 'Rounded rectangle'; el.style = { ...(el.style || {}), radius: Math.max(4, Math.round(Math.min(shape.w, shape.h) * 0.18)) }; }
    }
    if (shape.rotation) el.rotation = shape.rotation;
    // Drawn over a template (any group): the new layer goes inside it.
    exec(addAtCanvasCmd(d, [el]).cmd);
    select([el.id]);
  }, [exec, select, polygonShape]);

  /** The Image tool's box got its picture: fitted inside a drawn box, or at its own size where the canvas was clicked. */
  const placeImageInBox = useCallback((asset: AssetLike, box: DrawnShape) => {
    const d = stRef.current.doc;
    const img = createImageElement(d, asset, { x: box.x + box.w / 2, y: box.y + box.h / 2 });
    if (!box.clicked) {
      const k = Math.min(box.w / Math.max(1, asset.width || img.w), box.h / Math.max(1, asset.height || img.h));
      img.w = Math.max(1, Math.round((asset.width || img.w) * k));
      img.h = Math.max(1, Math.round((asset.height || img.h) * k));
      img.x = Math.round(box.x + (box.w - img.w) / 2);
      img.y = Math.round(box.y + (box.h - img.h) / 2);
    }
    exec(addAtCanvasCmd(d, [img]).cmd);
    select([img.id]);
  }, [exec, select]);

  /** Alt+drag: a copy stays behind (same place, just below in the stack); the drag moves the originals. */
  const onAltDuplicate = useCallback((ids: string[]) => {
    if (readOnlyRef.current) return;
    let d = stRef.current.doc;
    const cmds: Command[] = [];
    for (const id of ids) {
      const loc = locate(d.elements, id);
      if (!loc) continue;
      const [copy] = cloneWithNewIds([loc.el], d.elements);
      const index = childrenOf(d.elements, loc.parentId).findIndex((e) => e.id === id);
      const c = addElementsCmd([copy], loc.parentId, Math.max(0, index));
      d = c.apply(d);
      cmds.push(c);
    }
    if (cmds.length) exec({ label: 'Duplicate (Alt+drag)', apply: (x) => cmds.reduce((a, c) => c.apply(a), x), revert: (x) => cmds.reduceRight((a, c) => c.revert(a), x) });
  }, [exec]);

  const onPathEdit = useCallback((id: string, patch: Partial<LayoutElement>, key: string) => {
    if (readOnlyRef.current) return;
    ctl?.hold(true);
    exec(editElements(stRef.current.doc, [id], (el) => ({ ...el, ...patch }), 'Edit points', key));
  }, [ctl, exec]);

  /** Eyedropper: take the clicked layer's color (fill, or text color) onto the selection. */
  const onEyedrop = useCallback((sourceId: string) => {
    const d = stRef.current.doc;
    const src = locate(d.elements, sourceId)?.el;
    if (!src) return;
    const scope = buildScope(engineState, d, null, { sampleLocal: true });
    const pick = (v: unknown) => { const r = resolveStyleValue(v as any, scope); return typeof r === 'string' && r ? r : null; };
    const color = pick(src.type === 'text' ? src.style?.color : src.style?.fill) || pick(src.style?.color) || pick(src.style?.stroke);
    const targets = stRef.current.selected.filter((id) => id !== sourceId);
    if (!color) { setBanner('That layer has no solid color to pick.'); return; }
    if (!targets.length) { setBanner(`Picked ${color} — select the layer(s) to color first, then click with the eyedropper.`); return; }
    exec(editElements(d, targets, (el) => ({ ...el, style: { ...(el.style || {}), [el.type === 'text' ? 'color' : 'fill']: color } }), 'Eyedropper'));
    setBanner(`Applied ${color}.`);
  }, [engineState, exec]);

  // Space held = temporary hand tool; the hand drags the canvas viewport.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e.target) && !e.repeat) { setSpaceHand(true); e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceHand(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);
  const handActive = tool === 'hand' || spaceHand;
  const onViewportPointerDown = (e: React.PointerEvent) => {
    if (!handActive || !viewportRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const vp = viewportRef.current;
    const start = { x: e.clientX, y: e.clientY, sl: vp.scrollLeft, st: vp.scrollTop };
    const move = (ev: PointerEvent) => { vp.scrollLeft = start.sl - (ev.clientX - start.x); vp.scrollTop = start.st - (ev.clientY - start.y); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true });
  };

  // ── layout-record actions ────────────────────────────────────────────────
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const rename = useCallback((name: string) => {
    setMeta((m) => (m ? { ...m, name } : m));
    ctl?.changeMeta({ name });
  }, [ctl]);
  const setDefaults = useCallback((patch: Partial<LayoutDefaults>) => {
    const m = metaRef.current;
    if (!m) return;
    const next = { ...m.defaults, ...patch };
    setMeta({ ...m, defaults: next });
    ctl?.changeMeta({ defaults: next });
  }, [ctl]);
  const openAnimate = useCallback(() => { setTimelineOpen(true); setDockView('animate'); }, []);
  const editKeyframes = useCallback((clipId: string) => { setTlUi({ clipId, playhead: 0 }); setDockView('keyframes'); }, [setTlUi]);

  const toggleLock = async () => {
    if (!meta) return;
    try {
      if (meta.productionLocked) {
        const s = await layoutsApi.unlock(id);
        invalidate(CACHE_KEYS.layouts);
        setMeta((m) => (m ? { ...m, ...s } : s));
        ctl?.resume(s.draftRev);
        setBanner(null);
      } else {
        await ctl?.flush();
        const s = await layoutsApi.lock(id);
        invalidate(CACHE_KEYS.layouts);
        setMeta((m) => (m ? { ...m, ...s } : s));
        ctl?.pause('locked');
      }
    } catch (err: any) {
      setBanner(apiErrorMessage(err, 'Lock change failed'));
    }
  };
  // Keep autosave paused while locked (e.g. locked on load).
  useEffect(() => { if (locked) ctl?.pause('locked'); }, [locked, ctl]);

  const createNewDraft = async () => {
    try {
      const copy = await layoutsApi.duplicate(id);
      invalidate(CACHE_KEYS.layouts);
      navigate(`/designer/${copy._id}`);
    } catch (err: any) {
      setBanner(apiErrorMessage(err, 'Could not create a draft copy'));
    }
  };

  const restore = async (rev: number) => {
    if (!ctl) return;
    // Restoring replaces the draft, so unsaved local edits are dropped, not saved first.
    const full = await layoutsApi.restore(id, rev, ctl.rev);
    applyServer(full);
    ctl.resume(full.draftRev, false);
    setBanner(`Revision ${rev} restored into the draft.`);
  };

  // ── conflict resolution ──────────────────────────────────────────────────
  const reloadServer = async () => {
    try {
      const full = await layoutsApi.get(id);
      applyServer(full);
      ctl?.resume(full.draftRev, false);
      setConflictOpen(false);
      setConflictRev(null);
    } catch (err: any) {
      setBanner(apiErrorMessage(err, 'Could not load the server version'));
    }
  };
  const keepMine = () => {
    ctl?.resume(conflictRev ?? ctl.rev, true);
    ctl?.change(stRef.current.doc); // make sure the whole current document is what gets written
    void ctl?.flush(); // the user chose to overwrite the other version: that is a save
    setConflictOpen(false);
    setConflictRev(null);
  };

  /** Download the layout as a theme file. The file is built from the SAVED draft, so unsaved edits are saved first. */
  const exportFile = async () => {
    if (!ctl || !meta) return;
    try {
      if (ctl.dirty && !readOnly) {
        await ctl.flush();
        if (ctl.dirty || ctl.status !== 'saved') { setBanner('Export needs the layout saved first — the save did not go through.'); return; }
      }
      setBanner(await exportLayoutFile({ _id: id, name: meta.name }));
    } catch (err: any) {
      setBanner(apiErrorMessage(err, 'Export failed'));
    }
  };

  const publish = async () => {
    if (!ctl) throw new Error('Not ready');
    const s = await layoutsApi.publish(id, ctl.rev);
    invalidate(CACHE_KEYS.layouts);
    invalidate(CACHE_KEYS.revisions(id));
    setMeta((m) => (m ? { ...m, ...s } : s));
    setHistoryKey((k) => k + 1);
    return { publishedRev: s.publishedRev };
  };
  const publishFlush = async () => {
    if (!ctl) return;
    await ctl.flush();
    if (ctl.status === 'conflict') throw new ConflictError(ctl.rev);
    if (ctl.status === 'locked') throw new LockedError();
    if (ctl.status === 'error') throw new Error('Save failed — check your connection and retry');
  };

  // The design's own colours, offered as swatches in every colour picker.
  const themeColors = st.doc.theme?.colors;
  const swatches = useMemo(
    () => Object.entries((themeColors || {}) as Record<string, unknown>).filter(([, c]) => typeof c === 'string').map(([label, color]) => ({ label, color: color as string })),
    [themeColors]
  );
  // Browser Back with unsaved changes: one extra history entry absorbs it and the "unsaved changes" dialog opens instead.
  const guardDirty = (autosave.status === 'dirty' || autosave.status === 'error' || autosave.status === 'saving') && !locked;
  useEffect(() => {
    if (!guardDirty || typeof window === 'undefined' || typeof window.history?.pushState !== 'function') return;
    window.history.pushState({ ...(window.history.state || {}), designerGuard: true }, '');
    const onPop = () => {
      window.history.pushState({ ...(window.history.state || {}), designerGuard: true }, '');
      setLeaveOpen(true);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Saved (or leaving through the dialog): drop the extra entry if it is still the current one.
      if (window.history.state?.designerGuard) window.history.back();
    };
  }, [guardDirty]);

  // What the publish checks compare the design against (stable while nothing relevant changed).
  const assetList = assets.assets;
  const publishCheck = useMemo(
    () => ({ state: engineState, lastEvents, feed, assetIds: assetList ? new Set(assetList.map((a) => a._id)) : null }),
    [engineState, lastEvents, feed, assetList]
  );

  const reloadThemes = customThemes.reload;
  const documentExtra = useMemo(() => (customThemes.themes && meta ? (
    <ThemeSection
      key={themeSlot ? `${themeSlot.theme._id}:${themeSlot.slot.viewKey}` : 'none'}
      themes={customThemes.themes}
      layoutId={id}
      layoutName={meta.name}
      published={meta.publishedRev > 0}
      disabled={readOnly}
      onChanged={() => void reloadThemes()}
    />
  ) : null), [customThemes.themes, themeSlot, id, meta?.name, meta?.publishedRev, readOnly, reloadThemes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── render ───────────────────────────────────────────────────────────────
  if (load.kind === 'notFound') {
    return <FullMessage title="Layout not found" body="It may have been deleted, or it belongs to another account." />;
  }
  if (load.kind === 'error') {
    return <FullMessage title="Could not load the layout" body={load.message} retry={() => window.location.reload()} />;
  }

  const phase = engineState?.status?.phase;
  const selEl = selected.length === 1 ? locate(st.doc.elements, selected[0])?.el : null;
  const ctxEl = ctxMenu?.id ? locate(st.doc.elements, ctxMenu.id)?.el ?? null : null;
  const ctxRegroup = ctxEl ? regroupTargets(st.doc, ctxEl.id) : null;
  const menuItems: MenuEntry[] = ctxMenu ? (ctxEl ? [
    { label: 'Copy', keys: 'Ctrl+C', onClick: () => { copyLayers(st.doc, stRef.current.selected); } },
    { label: 'Cut', keys: 'Ctrl+X', disabled: readOnly, onClick: () => { if (copyLayers(st.doc, stRef.current.selected)) deleteSel(); } },
    { label: 'Paste', keys: 'Ctrl+V', disabled: readOnly, onClick: () => { const r = pasteLayersCmd(stRef.current.doc, stRef.current.selected); if (r) { exec(r.cmd); select(r.newIds); } } },
    { label: 'Duplicate', keys: 'Ctrl+D', disabled: readOnly, onClick: duplicate },
    null,
    ...(acceptsImage(ctxEl) ? [
      { label: (ctxEl.imageFill?.src || ctxEl.src) ? 'Replace image…' : 'Put an image in this shape…', disabled: readOnly, onClick: () => setReplaceFor(ctxEl.id) },
      ...(isFrame(ctxEl) && ctxEl.imageFill?.src ? [
        { label: 'Reposition image', keys: 'C', disabled: readOnly, onClick: () => { startAdjust(ctxEl.id); } },
        { label: 'Remove image from frame', disabled: readOnly, onClick: () => exec(removeFrameImageCmd(stRef.current.doc, ctxEl.id)) },
      ] : []),
      null,
    ] as MenuEntry[] : []),
    { label: 'Bring to front', keys: ']', disabled: readOnly, onClick: () => exec(reorderCmd(stRef.current.doc, ctxEl.id, 'front')) },
    { label: 'Bring forward', keys: 'Ctrl+]', disabled: readOnly, onClick: () => exec(reorderCmd(stRef.current.doc, ctxEl.id, 1)) },
    { label: 'Send backward', keys: 'Ctrl+[', disabled: readOnly, onClick: () => exec(reorderCmd(stRef.current.doc, ctxEl.id, -1)) },
    { label: 'Send to back', keys: '[', disabled: readOnly, onClick: () => exec(reorderCmd(stRef.current.doc, ctxEl.id, 'back')) },
    null,
    { label: 'Group', keys: 'Ctrl+G', disabled: readOnly || !canGroup, onClick: group },
    { label: 'Ungroup', keys: 'Ctrl+Shift+G', disabled: readOnly || !canUngroup, onClick: ungroup },
    ...(ctxRegroup?.into ? [{ label: `Move into “${ctxRegroup.into.name}”`, disabled: readOnly, onClick: () => moveLayers(stRef.current.selected.includes(ctxEl.id) ? stRef.current.selected : [ctxEl.id], ctxRegroup.into!.id, null) }] : []),
    ...(ctxRegroup?.out ? [{ label: 'Move out of group', disabled: readOnly, onClick: () => moveLayers([ctxEl.id], ctxRegroup.out!.parentId, ctxRegroup.out!.index) }] : []),
    null,
    { label: ctxEl.locked ? 'Unlock' : 'Lock', keys: 'Ctrl+Shift+L', disabled: readOnly, onClick: () => onLayerToggle(ctxEl.id, 'locked') },
    { label: ctxEl.hidden ? 'Show' : 'Hide', keys: 'Ctrl+Shift+H', disabled: readOnly, onClick: () => onLayerToggle(ctxEl.id, 'hidden') },
    { label: 'Rename', keys: 'Ctrl+R', disabled: readOnly, onClick: () => { setLeftTab('layers'); setPanelsHidden(false); setRenameRequest((r) => ({ id: ctxEl.id, n: (r?.n ?? 0) + 1 })); } },
    null,
    { label: 'Delete', keys: 'Del', danger: true, disabled: readOnly, onClick: deleteSel },
  ] : [
    { label: 'Paste', keys: 'Ctrl+V', disabled: readOnly, onClick: () => { const r = pasteLayersCmd(stRef.current.doc, stRef.current.selected); if (r) { exec(r.cmd); select(r.newIds); } } },
    { label: 'Add an image here…', disabled: readOnly, onClick: () => setImageBox({ tool: 'image', x: ctxMenu.point.x, y: ctxMenu.point.y, w: 0, h: 0, clicked: true }) },
    null,
    { label: 'Select all', keys: 'Ctrl+A', onClick: () => select(stRef.current.doc.elements.filter((e) => !e.locked && !e.hidden).map((e) => e.id)) },
    { label: 'Zoom to fit', keys: 'Shift+1', onClick: () => setFitMode(true) },
    { label: 'Zoom to 100 %', keys: 'Ctrl+0', onClick: () => { setFitMode(false); setZoom(1); } },
  ]) : [];
  const animatedCount = flattenAll(st.doc.elements).filter((e) => (e.timeline?.clips.length || 0) > 0 || !!e.anim).length;
  const boundCount = flattenAll(st.doc.elements).filter((e) => e.bind && Object.keys(e.bind).length > 0).length;
  // Live = the socket is up and no error is being reported; anything else may be showing old values.
  const connected = !!engineState?.status && engineState.status.socketConnected !== false && !engineState.status.error;
  const dataLabel = mode === 'sim' ? 'Sample data' : !liveReady ? 'No round chosen' : connected ? 'Live' : 'Live data lost';
  const fitWidth = () => {
    const vp = viewportRef.current;
    if (!vp) return;
    setFitMode(false);
    setZoom(clampZoom(Math.round(((vp.getBoundingClientRect().width - 64) / st.doc.stage.width) * 1000) / 1000));
  };
  const centerCanvas = () => {
    const vp = viewportRef.current;
    if (!vp) return;
    vp.scrollLeft = (vp.scrollWidth - vp.clientWidth) / 2;
    vp.scrollTop = (vp.scrollHeight - vp.clientHeight) / 2;
  };
  const commitName = () => {
    const next = (nameEdit || '').trim().slice(0, 120);
    setNameEdit(null);
    if (next && meta && next !== meta.name) rename(next);
  };
  const elementCount = countElements(st.doc) as number;
  const status = autosave.status;
  const unsaved = status === 'dirty' || status === 'error';

  return (
    <SwatchContext.Provider value={swatches}>
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-950 text-slate-200" data-testid="designer-editor">
      {/* toolbar */}
      {/* One line, never wraps: on a narrow window it scrolls sideways instead of spilling over the canvas. */}
      <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap border-b border-white/10 bg-neutral-900 px-3 [&>*]:shrink-0">
        <Link
          to="/designer"
          className="text-xs text-slate-400 hover:text-slate-100"
          onClick={(e) => { if (ctl?.dirty && !locked) { e.preventDefault(); setLeaveOpen(true); } }}
        >← Layouts</Link>
        <div className="mx-1 h-5 w-px bg-white/10" />
        {nameEdit !== null ? (
          <input
            autoFocus
            aria-label="Design name"
            className="w-[240px] rounded border border-amber-400/50 bg-black/40 px-1.5 py-0.5 text-sm font-semibold text-slate-100 outline-none"
            value={nameEdit}
            maxLength={120}
            onChange={(e) => setNameEdit(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setNameEdit(null); }}
          />
        ) : (
          <button
            type="button"
            disabled={readOnly || !meta}
            onClick={() => setNameEdit(meta?.name || '')}
            className="max-w-[170px] truncate rounded px-1 text-left 2xl:max-w-[260px] text-sm font-semibold text-slate-100 hover:bg-white/5 disabled:hover:bg-transparent"
            title={meta ? `${meta.name} (click to rename)` : undefined}
            data-testid="design-name"
          >
            {meta?.name || '…'}
          </button>
        )}
        {locked && <span className="rounded bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-200">🔒 Production Locked</span>}
        {themeSlot && (
          <span className="hidden max-w-[160px] truncate rounded bg-emerald-500/15 2xl:inline px-2 py-0.5 text-[11px] font-semibold text-emerald-200" data-testid="theme-chip" title={themeSlot.theme.name}>
            {themeSlot.theme.label} · {viewLabel(themeSlot.slot.viewKey)}
          </span>
        )}
        <span className={cx('text-[11px]', saveStatusColor(status))} data-testid="save-status">
          {load.kind === 'loading' ? 'Loading…' : locked ? 'Read-only' : SAVE_LABEL[status]}
        </span>
        {status === 'conflict' && !conflictOpen && <Btn small danger onClick={() => setConflictOpen(true)}>Resolve</Btn>}
        {!readOnly && (
          <label className="flex items-center gap-1 text-[11px] text-slate-400" title="Save automatically 2 s after you stop editing; failed saves are retried. Off = save with the Save button or Ctrl+S.">
            <input type="checkbox" checked={autosave.auto} onChange={(e) => autosave.setAuto(e.target.checked)} data-testid="autosave-toggle" />
            Autosave
          </label>
        )}

        <div className="ml-3 flex items-center gap-1">
          <Btn small disabled={readOnly || !st.past.length} onClick={() => dispatch({ type: 'undo' })} title="Undo (Ctrl+Z)">↶</Btn>
          <Btn small disabled={readOnly || !st.future.length} onClick={() => dispatch({ type: 'redo' })} title="Redo (Ctrl+Shift+Z)">↷</Btn>
        </div>

        <div className="ml-3 flex overflow-hidden rounded border border-white/10" role="group" aria-label="Preview data source">
          {(['live', 'sim'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cx('px-3 py-1 text-[11px] font-semibold tracking-wide', mode === m ? (m === 'live' ? 'bg-red-500/80 text-white' : 'bg-violet-500/70 text-white') : 'text-slate-400 hover:bg-white/5')}
            >
              {m === 'live' ? 'LIVE' : 'SIMULATION'}
            </button>
          ))}
        </div>

        <span
          className={cx('ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold', mode === 'sim' ? 'bg-violet-500/15 text-violet-200' : connected && liveReady ? 'bg-red-500/15 text-red-200' : 'bg-amber-500/15 text-amber-200')}
          title={mode === 'sim' ? 'The canvas shows made-up sample data, not a real match' : connected && liveReady ? 'The canvas follows the live match' : liveReady ? 'The live connection dropped: the canvas may show old values until it is back' : 'Choose a tournament and round under Live data (click the empty canvas)'}
          data-testid="data-indicator"
        >
          {dataLabel}{boundCount ? ` · ${boundCount} bound` : ''}
        </span>
        <span className="hidden rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400 2xl:inline" title="Layers that have an animation" data-testid="animation-indicator">{animatedCount} animated</span>

        <div className="ml-auto flex items-center gap-1">
          <Btn small onClick={() => setGuideOpen(true)} title="How to build an overlay, step by step" data-testid="guide-button" aria-label="Guide">?<span className="hidden 2xl:inline"> Guide</span></Btn>
          <div className="mx-1 h-5 w-px bg-white/10" />
          <Btn small onClick={() => stepZoom(-1)} title="Zoom out (or scroll down over the canvas)">−</Btn>
          <Btn small active={fitMode} onClick={() => setFitMode(true)} title="Fit to screen">{Math.round(zoom * 100)}%</Btn>
          <Btn small onClick={() => stepZoom(1)} title="Zoom in (or scroll up over the canvas)">+</Btn>
          <ToolbarMenu
            label="View"
            testId="view-menu-button"
            title="Zoom, guides, grid and canvas preview options"
            items={[
              { label: 'Fit to screen', keys: 'Shift+1', onClick: () => setFitMode(true) },
              { label: 'Fit width', onClick: fitWidth },
              { label: 'Actual size (100 %)', keys: 'Ctrl+0', onClick: () => { setFitMode(false); setZoom(1); } },
              { label: 'Centre canvas', onClick: centerCanvas },
              null,
              { label: 'Grid', keys: "Ctrl+'", checked: !!st.doc.editor?.grid?.show, disabled: readOnly, onClick: () => setEditorMeta({ grid: { size: 20, ...(st.doc.editor?.grid || {}), show: !st.doc.editor?.grid?.show } }, 'Grid') },
              { label: 'Snap to grid', checked: !!st.doc.editor?.grid?.snap, disabled: readOnly, onClick: () => setEditorMeta({ grid: { size: 20, ...(st.doc.editor?.grid || {}), snap: !st.doc.editor?.grid?.snap } }, 'Grid snap') },
              { label: 'Safe zones', title: 'Title-safe and action-safe guides', checked: safeZones || !!st.doc.editor?.safeArea, onClick: () => setSafeZones(!safeZones) },
              null,
              { label: 'Event popups (sample data)', title: 'Show event popups with sample data while idle', checked: previewEvents, onClick: () => setPreviewEvents(!previewEvents) },
              { label: 'Autoplay animations', title: 'Play animations live on the canvas while you design (turn off to work on a still layout)', checked: playTimelines, onClick: () => setPlayTimelines(!playTimelines) },
              null,
              { label: 'Keyboard shortcuts', keys: '?', testId: 'shortcuts-button', onClick: () => setShortcutsOpen(true) },
            ]}
          />
          <Btn small active={timelineOpen} onClick={() => setTimelineOpen(!timelineOpen)} title="Show the Animate panel (rules and keyframes)">Animate</Btn>
          <div className="mx-1 h-5 w-px bg-white/10" />
          <Btn small active={unsaved} disabled={readOnly || status === 'saving'} onClick={() => void ctl?.flush()} title="Save (Ctrl+S). Nothing is saved until you do." data-testid="save-button">
            {status === 'saving' ? 'Saving…' : status === 'error' ? '● Retry save' : unsaved ? '● Save' : 'Save'}
          </Btn>
          <Btn small onClick={() => setPreviewOpen(true)} title="Full-screen preview of the draft">Preview</Btn>
          <ToolbarMenu
            label="More"
            testId="more-menu-button"
            active={rightTab === 'history' || locked}
            items={[
              { label: 'Version history', checked: rightTab === 'history', onClick: () => setRightTab(rightTab === 'history' ? 'inspect' : 'history') },
              { label: locked ? 'Unlock for editing' : 'Lock for production', title: locked ? 'Unlock for editing' : 'Blocks edits, publish and delete', disabled: !meta, onClick: toggleLock },
              { label: 'Export theme file (.sstheme)', title: 'Download this layout as a theme file another account can import', testId: 'export-button', disabled: !meta || status === 'saving', onClick: () => void exportFile() },
            ]}
          />
          <Btn active disabled={readOnly} onClick={() => setPublishOpen(true)}>Publish</Btn>
        </div>
      </div>

      {locked && (
        <div className="flex shrink-0 items-center gap-3 border-b border-sky-500/20 bg-sky-500/10 px-4 py-2 text-xs text-sky-100">
          <span>This layout is locked for production. Editing, publishing and deleting are blocked.</span>
          <Btn small onClick={createNewDraft}>Create new draft</Btn>
          <Btn small onClick={toggleLock}>Unlock</Btn>
        </div>
      )}
      {banner && (
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-100">
          <span>{banner}</span>
          <button type="button" className="ml-auto text-amber-200/70 hover:text-amber-100" onClick={() => setBanner(null)}>✕</button>
        </div>
      )}
      {mode === 'live' && load.kind === 'ready' && meta && (
        <LiveSourceBar
          defaults={meta.defaults}
          onDefaults={setDefaults}
          matchId={previewMatchId}
          onMatch={setPreviewMatchId}
          phase={live.state?.status.phase}
          readOnly={readOnly}
        />
      )}

      <div className="flex min-h-0 flex-1">
        {/* left */}
        <div className={cx('w-64 shrink-0 flex-col border-r border-white/10 bg-neutral-900/60', panelsHidden ? 'hidden' : 'flex')}>
          <div className="flex items-stretch">
            <div className="min-w-0 flex-1"><Tabs tabs={[{ id: 'layers', label: 'Layers' }, { id: 'insert', label: 'Insert' }, { id: 'assets', label: 'Assets' }, { id: 'dataPanel', label: 'Data' }, { id: 'graphics', label: 'Graphics' }] as const} value={leftTab} onChange={setLeftTab} /></div>
            <div className="flex items-center border-b border-white/5 pr-2 pt-2"><InfoButton topic={leftTab} /></div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <PanelBoundary name="Left panel">
              {leftTab === 'graphics' ? (
                <BuiltinBrowser doc={st.doc} state={engineState} disabled={readOnly} onInsert={insertBuiltin} />
              ) : leftTab === 'dataPanel' ? (
                <DataPanel
                  doc={st.doc}
                  selected={selEl ?? null}
                  scope={timelineScope}
                  state={engineState}
                  lastEvents={lastEvents}
                  feed={feed}
                  status={{ mode, ready: liveReady, connected, phase: phase || undefined, staleForMs: engineState?.status?.staleForMs }}
                  disabled={readOnly}
                  onBind={bindField}
                  onSelect={select}
                  onMode={setMode}
                />
              ) : leftTab === 'assets' ? (
                <>
                  {selEl && acceptsImage(selEl) && (
                    <div className="border-b border-white/5 px-3 py-2 text-[10px] text-emerald-200/90">Click an image to put it in “{selEl.name || selEl.type}”.</div>
                  )}
                  <AssetGrid
                    library={assets}
                    manage
                    disabled={readOnly}
                    currentId={assetIdOf(selEl?.imageFill?.src) || assetIdOf(selEl?.src)}
                    onPick={(a) => applyAsset(a, { id: selEl && acceptsImage(selEl) ? selEl.id : null })}
                  />
                </>
              ) : leftTab === 'insert' ? (
                <InsertPanel doc={st.doc} selected={selected} disabled={readOnly} onInsert={insert} />
              ) : (
                <LayersPanel
                  elements={st.doc.elements}
                  selected={selected}
                  disabled={readOnly}
                  onSelect={select}
                  onToggle={onLayerToggle}
                  onRename={onLayerRename}
                  onDelete={onLayerDelete}
                  onReorder={onLayerReorder}
                  onMoveToParent={(lid, pid, index) => moveLayers([lid], pid, index)}
                  onGroup={group}
                  onUngroup={ungroup}
                  canGroup={canGroup}
                  canUngroup={canUngroup}
                  renameRequest={renameRequest}
                />
              )}
            </PanelBoundary>
          </div>
        </div>

        {/* canvas */}
        <ToolPalette tool={tool} setTool={setTool} disabled={readOnly} polygonShape={polygonShape} setPolygonShape={setPolygonShape} />
        <div
          ref={viewportRef}
          className="relative min-w-0 flex-1 overflow-auto bg-[#0d0d11]"
          style={{ cursor: handActive ? 'grab' : undefined }}
          onPointerDownCapture={onViewportPointerDown}
        >
          <div className="flex min-h-full min-w-full items-center justify-center p-8" style={{ width: 'max-content', height: 'max-content' }}>
            <PanelBoundary name="Canvas">
              {load.kind === 'loading' ? (
                <div className="text-xs text-slate-500">Loading layout…</div>
              ) : (
                <Canvas
                  doc={st.doc}
                  selected={selected}
                  state={engineState}
                  events={engine}
                  previewEvents={previewEvents}
                  sampleEvent={sample}
                  assetBase={meta?.assetBase || undefined}
                  zoom={zoom}
                  showSafeZones={safeZones || !!st.doc.editor?.safeArea}
                  margin={st.doc.editor?.margin}
                  onGestureCancel={onGestureCancel}
                  onContextMenu={setCtxMenu}
                  onDropFiles={readOnly ? undefined : (files, target) => void onDropFiles(files, target)}
                  onDropAsset={readOnly ? undefined : onDropAsset}
                  onDropField={readOnly ? undefined : onDropField}
                  adjustId={adjustId}
                  onAdjustImage={onAdjustImage}
                  onAdjustEnd={endAdjust}
                  onSelect={select}
                  onGeometry={onGeometry}
                  onGestureEnd={onGestureEnd}
                  playTimelines={playTimelines && !(keyframesOpen && tlPreviewing)}
                  previewStore={previewStore}
                  hideRulers={rulersHidden}
                  onCreateShape={onCreateShape}
                  onAltDuplicate={onAltDuplicate}
                  tool={readOnly ? 'select' : tool}
                  docGuides={st.doc.editor?.guides || { v: [], h: [] }}
                  grid={st.doc.editor?.grid || {}}
                  onGuidesChange={(g) => setEditorMeta({ guides: g }, 'Guides')}
                  onCreatePath={onCreatePath}
                  onPathEdit={onPathEdit}
                  onEyedrop={onEyedrop}
                  onElementDoubleClick={(id) => {
                    // A frame with a picture: move the picture inside it. A drawn path without one: edit its points.
                    if (startAdjust(id)) return;
                    if (locate(st.doc.elements, id)?.el.type === 'path') setTool('direct');
                  }}
                  onToolExit={() => setTool('select')}
                />
              )}
            </PanelBoundary>
          </div>
        </div>

        {/* right */}
        <div className={cx('w-80 shrink-0 overflow-y-auto border-l border-white/10 bg-neutral-900/60', panelsHidden && 'hidden')}>
          <PanelBoundary name="Inspector">
            {rightTab === 'history' && meta ? (
              <HistoryPanel
                layoutId={id}
                draftRev={ctl?.rev ?? meta.draftRev}
                publishedRev={meta.publishedRev}
                updatedAt={meta.updatedAt}
                disabled={readOnly}
                refreshKey={historyKey}
                onRestore={restore}
              />
            ) : meta ? (
              <Inspector
                doc={st.doc}
                selected={selected}
                state={engineState}
                lastEvents={lastEvents}
                feed={feed}
                disabled={readOnly}
                exec={exec}
                onSelect={select}
                name={meta.name}
                onRename={rename}
                defaults={meta.defaults}
                onDefaults={setDefaults}
                fontLibrary={fontLibrary}
                onOpenAnimate={openAnimate}
                documentExtra={documentExtra}
                assets={assets}
                assetBase={meta.assetBase || undefined}
                onAdjustImage={startAdjust}
              />
            ) : null}
          </PanelBoundary>
        </div>
      </div>

      {timelineOpen && !panelsHidden && load.kind === 'ready' && (
        <div className="flex h-64 shrink-0 flex-col border-t border-white/10 bg-neutral-900/80" data-testid="animate-dock">
          <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-1 text-[11px]">
            <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Animate</span>
            <div className="flex overflow-hidden rounded border border-white/10" role="group" aria-label="Animation editor">
              {([['animate', 'Simple rules'], ['keyframes', 'Keyframes']] as const).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={dockView === v} onClick={() => { previewStore.set(null); setDockView(v); }}
                  className={cx('px-2.5 py-0.5', dockView === v ? 'bg-amber-400/20 text-amber-100' : 'text-slate-400 hover:bg-white/5')}>{label}</button>
              ))}
            </div>
            {dockView === 'keyframes' && <InfoButton topic="keyframes" label="How keyframes work" />}
            <Btn small disabled={readOnly} onClick={() => setCssOpen(true)} title="Paste CSS @keyframes and use them on a layer" data-testid="css-import-button">Import CSS…</Btn>
            <button type="button" className="ml-auto text-slate-500 hover:text-slate-200" title="Hide the Animate panel" onClick={() => setTimelineOpen(false)}>✕</button>
          </div>
          <div className="min-h-0 flex-1">
          <PanelBoundary name="Animate">
            {dockView === 'animate' ? (
              <AnimatePanel
                doc={st.doc}
                selectedId={selected.length === 1 ? selected[0] : null}
                disabled={readOnly}
                exec={exec}
                scope={timelineScope}
                sim={mode === 'sim' ? simRef.current?.controls ?? null : null}
                onPreview={previewStore.set}
                onEditKeyframes={editKeyframes}
              />
            ) : (
            <TimelinePanel
              doc={st.doc}
              selectedId={selected.length === 1 ? selected[0] : null}
              disabled={readOnly}
              exec={exec}
              scope={timelineScope}
              sim={mode === 'sim' ? simRef.current?.controls ?? null : null}
              ui={tlUi}
              setUi={setTlUi}
              onPreviewChange={setTlPreviewing}
              previewStore={previewStore}
              onSelectLayer={selectOne}
            />
            )}
          </PanelBoundary>
          </div>
        </div>
      )}

      {/* status bar */}
      <div className="flex h-8 shrink-0 items-center gap-3 border-t border-white/10 bg-neutral-900 px-3 text-[11px] text-slate-400">
        <span className={cx('font-semibold', mode === 'live' ? 'text-red-300' : 'text-violet-300')}>{mode === 'live' ? 'LIVE' : 'SIMULATION'}</span>
        <span data-testid="engine-phase">{phase ? phase.replace(/_/g, ' ').toLowerCase() : mode === 'live' && !liveReady ? 'no round selected' : 'idle'}</span>
        {mode === 'sim' && simRef.current && <SimControls sim={simRef.current} />}
        <span className="ml-auto">{Math.round(zoom * 100)}%</span>
        <span>
          {selEl ? `${selEl.name || selEl.type} · ${Math.round(selEl.x)},${Math.round(selEl.y)} · ${Math.round(selEl.w)}×${Math.round(selEl.h)}` : selected.length ? `${selected.length} selected` : 'nothing selected'}
        </span>
        <span>{elementCount} elements</span>
        {meta && meta.publishedRev > 0 && <span className="text-emerald-300/80">published rev {meta.publishedRev}</span>}
      </div>

      {ctxMenu && <CanvasMenu x={ctxMenu.clientX} y={ctxMenu.clientY} items={menuItems} onClose={() => setCtxMenu(null)} />}
      {imageBox && (
        <AssetPickerDialog library={assets} title="Choose the image to place" onPick={(a) => placeImageInBox(a, imageBox)} onClose={() => setImageBox(null)} />
      )}
      {replaceFor && (
        <AssetPickerDialog
          library={assets}
          currentId={assetIdOf(locate(st.doc.elements, replaceFor)?.el.imageFill?.src) || assetIdOf(locate(st.doc.elements, replaceFor)?.el.src)}
          title="Choose the image"
          onPick={(a) => applyAsset(a, { id: replaceFor })}
          onClose={() => setReplaceFor(null)}
        />
      )}
      {guideOpen && load.kind === 'ready' && <QuickStart onClose={closeGuide} />}
      {shortcutsOpen && <ShortcutsPanel onClose={() => setShortcutsOpen(false)} />}
      {leaveOpen && (
        <div className="fixed inset-0 z-[116] flex items-center justify-center bg-black/60 p-4" data-testid="leave-dialog">
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-neutral-900 p-5 text-slate-200 shadow-2xl" role="dialog" aria-label="Unsaved changes">
            <div className="mb-1 text-sm font-semibold text-slate-100">You have unsaved changes</div>
            <p className="mb-4 text-xs text-slate-400">This layout is only saved when you press Save. Leave now and the changes since your last save are lost.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Btn onClick={() => setLeaveOpen(false)}>Stay</Btn>
              <Btn danger onClick={() => navigate('/designer')}>Leave without saving</Btn>
              <Btn active onClick={async () => { await ctl?.flush(); if (ctl && !ctl.dirty && ctl.status === 'saved') navigate('/designer'); else setLeaveOpen(false); }}>Save and leave</Btn>
            </div>
          </div>
        </div>
      )}
      {conflictOpen && (
        <ConflictDialog
          mine={st.doc}
          loadServer={() => layoutsApi.get(id).then((f) => f.draft)}
          onReload={reloadServer}
          onKeepMine={keepMine}
          onKeepEditing={() => setConflictOpen(false)}
        />
      )}
      {publishOpen && meta && (
        <PublishDialog
          doc={st.doc}
          publicId={meta.publicId}
          publishedRev={meta.publishedRev}
          defaults={meta.defaults}
          layoutId={id}
          layoutName={meta.name}
          themes={customThemes.themes}
          onThemesChanged={() => void customThemes.reload()}
          flush={publishFlush}
          publish={publish}
          onClose={() => setPublishOpen(false)}
          onSelectPath={(p) => {
            const eid = elementIdAtPath(st.doc, p);
            if (eid) { select([eid]); setRightTab('inspect'); setPublishOpen(false); }
          }}
          check={publishCheck}
          onSelectElement={(eid) => { select([eid]); setRightTab('inspect'); setPanelsHidden(false); setPublishOpen(false); }}
        />
      )}
      {cssOpen && (
        <CssImportDialog
          doc={st.doc}
          selectedId={selected.length === 1 ? selected[0] : null}
          state={engineState}
          assetBase={meta?.assetBase || undefined}
          disabled={readOnly}
          exec={exec}
          onClose={() => setCssOpen(false)}
          onAssigned={() => { setTimelineOpen(true); setDockView('animate'); }}
        />
      )}
      {previewOpen && (
        <PreviewOverlay
          doc={st.doc}
          state={engineState}
          engine={engine}
          mode={mode}
          liveReady={liveReady}
          onMode={setMode}
          assetBase={meta?.assetBase || undefined}
          publishedUrl={meta && meta.publishedRev > 0 ? overlayUrl(meta.publicId, { t: meta.defaults.tournamentId, r: meta.defaults.roundId, mode: meta.defaults.matchMode }) : null}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
    </SwatchContext.Provider>
  );
}

/** Every layer at every depth. */
function flattenAll(list: LayoutElement[], out: LayoutElement[] = []): LayoutElement[] {
  for (const el of list) { out.push(el); if (el.children) flattenAll(el.children, out); }
  return out;
}

/** Document panel: which custom theme (Theme9+) and view this layout fills. */
function ThemeSection({ themes, layoutId, layoutName, published, disabled, onChanged }: {
  themes: CustomTheme[];
  layoutId: string;
  layoutName: string;
  published: boolean;
  disabled?: boolean;
  onChanged(): void;
}) {
  const current = findThemeSlot(themes, layoutId);
  const initial: ThemeChoice = current ? { themeId: current.theme._id, viewKey: current.slot.viewKey } : { ...defaultThemeChoice(themes, layoutId, layoutName), themeId: 'none' };
  const [choice, setChoice] = useState<ThemeChoice>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = choice.themeId !== initial.themeId || (choice.themeId !== 'none' && choice.viewKey !== initial.viewKey);
  const apply = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const t = await applyThemeChoice(choice, layoutId, themes);
      setMsg({ ok: true, text: t ? `Now in ${t.label} as ${viewLabel(choice.viewKey)}.` : 'Removed from its theme.' });
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err, 'Could not update the theme') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-b border-white/5 px-3 py-3" data-testid="theme-section">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Custom theme <InfoButton topic="customTheme" /></div>
      <ThemeAssign themes={themes} layoutId={layoutId} value={choice} onChange={setChoice} disabled={disabled} />
      <div className="mt-2 flex items-center gap-2">
        <Btn small active={dirty} disabled={!dirty || busy || disabled} onClick={apply}>{busy ? 'Saving…' : 'Apply'}</Btn>
        {!published && choice.themeId !== 'none' && <span className="text-[10px] text-amber-200/80">Shows in DisplayHud once published.</span>}
      </div>
      {msg && <div className={cx('mt-1 text-[10px]', msg.ok ? 'text-emerald-300' : 'text-red-300')}>{msg.text}</div>}
    </div>
  );
}

function summaryOf(full: LayoutSummary & { draft?: unknown }): LayoutSummary {
  const { draft: _draft, ...rest } = full as LayoutFull;
  return rest;
}

function SimControls({ sim }: { sim: Simulation }) {
  const c = sim.controls;
  const [scenario, setScenario] = useState('');
  const b = (label: string, fn: () => void, title?: string) => (
    <button type="button" title={title} onClick={fn} className="rounded border border-violet-400/30 px-1.5 py-[1px] text-[10px] text-violet-200 hover:bg-violet-500/20">{label}</button>
  );
  return (
    <div className="flex items-center gap-1">
      <select
        aria-label="Sample situation"
        title="Jump the sample match to a typical moment, to see the design on it"
        className="rounded border border-violet-400/30 bg-transparent px-1 py-[1px] text-[10px] text-violet-200 outline-none"
        value={scenario}
        onChange={(e) => { const s = SIM_SCENARIOS.find((x) => x.id === e.target.value); setScenario(e.target.value); if (s) s.run(c); }}
      >
        <option value="" className="bg-neutral-900">Sample situation…</option>
        {SIM_SCENARIOS.map((s) => <option key={s.id} value={s.id} title={s.hint} className="bg-neutral-900">{s.label}</option>)}
      </select>
      {b('+Kill', () => c.kill())}
      {b('+Elim', () => c.eliminate())}
      {b('+Knock', () => c.knock(), 'Knock one player down')}
      {b('Revive', () => c.revive(), 'Pick a knocked player back up')}
      {b('Recall', () => c.recall())}
      {b('Milestone', () => c.milestone())}
      {b('HP 30%', () => c.setHealth(30))}
      {b('HP 100%', () => c.setHealth(100))}
      {b('Shuffle', () => c.rankShuffle(), 'Change points / rank order')}
      {b('Match start', () => c.matchStart())}
      {b('Match end', () => c.matchEnd())}
      {b('Reset', () => c.reset())}
    </div>
  );
}

type PreviewBackdrop = 'checker' | 'black' | 'white' | 'green';
const BACKDROPS: Record<PreviewBackdrop, { label: string; style: React.CSSProperties }> = {
  checker: { label: 'Transparent', style: { backgroundColor: '#1a1a1f', backgroundImage: 'linear-gradient(45deg,#232329 25%,transparent 25%),linear-gradient(-45deg,#232329 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#232329 75%),linear-gradient(-45deg,transparent 75%,#232329 75%)', backgroundSize: '24px 24px', backgroundPosition: '0 0,0 12px,12px -12px,-12px 0' } },
  black: { label: 'Black', style: { backgroundColor: '#000000' } },
  white: { label: 'White', style: { backgroundColor: '#ffffff' } },
  green: { label: 'Green', style: { backgroundColor: '#00b140' } },
};

/**
 * Full-window preview of the draft, with no editing chrome. "With animation"
 * is the runtime renderer (what OBS gets); "Still" is the same layout at rest.
 * The data is whatever the editor is on (live or simulation) and can be
 * switched here; simulated data is always labelled.
 */
function PreviewOverlay({ doc, state, engine, assetBase, publishedUrl, onClose, mode, liveReady, onMode }: {
  doc: LayoutDocument; state: any; engine: any; assetBase?: string; publishedUrl: string | null; onClose(): void;
  mode: PreviewMode; liveReady: boolean; onMode(m: PreviewMode): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [animated, setAnimated] = useState(true);
  const [backdrop, setBackdrop] = useState<PreviewBackdrop>('checker');
  const [actual, setActual] = useState(false);
  const [full, setFull] = useState(false);
  useEffect(() => {
    // Esc leaves full screen first (the browser does that itself), then closes the preview.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) onClose(); };
    const onFull = () => setFull(!!document.fullscreenElement);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFull);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFull);
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    };
  }, [onClose]);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    else void root.current?.requestFullscreen?.().catch(() => {});
  };
  const seg = 'px-2 py-0.5 text-[11px]';
  const on = 'bg-amber-400/20 text-amber-100';
  const off = 'text-slate-400 hover:bg-white/5';
  return (
    <div ref={root} className="fixed inset-0 z-[90] flex flex-col bg-black" data-testid="preview-overlay">
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 bg-neutral-900 px-3 py-1 text-xs text-slate-300">
        <span className="font-semibold text-slate-100">Preview</span>
        <div className="flex overflow-hidden rounded border border-white/10" role="group" aria-label="Animation">
          <button type="button" aria-pressed={animated} className={cx(seg, animated ? on : off)} onClick={() => setAnimated(true)} title="As OBS plays it: entrances, exits, event popups on real events">With animation</button>
          <button type="button" aria-pressed={!animated} className={cx(seg, !animated ? on : off)} onClick={() => setAnimated(false)} title="Every layer at rest, nothing moving">Still</button>
        </div>
        <div className="flex overflow-hidden rounded border border-white/10" role="group" aria-label="Data">
          <button type="button" aria-pressed={mode === 'sim'} className={cx(seg, mode === 'sim' ? 'bg-violet-500/60 text-white' : off)} onClick={() => onMode('sim')}>Simulation</button>
          <button type="button" aria-pressed={mode === 'live'} className={cx(seg, mode === 'live' ? 'bg-red-500/70 text-white' : off)} onClick={() => onMode('live')} title={liveReady ? 'The live match' : 'Choose a tournament and round first (Live data, in the Document panel)'}>Live</button>
        </div>
        <div className="flex overflow-hidden rounded border border-white/10" role="group" aria-label="Background">
          {(Object.keys(BACKDROPS) as PreviewBackdrop[]).map((b) => (
            <button key={b} type="button" aria-pressed={backdrop === b} className={cx(seg, backdrop === b ? on : off)} onClick={() => setBackdrop(b)}>{BACKDROPS[b].label}</button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded border border-white/10" role="group" aria-label="Size">
          <button type="button" aria-pressed={!actual} className={cx(seg, !actual ? on : off)} onClick={() => setActual(false)}>Fit</button>
          <button type="button" aria-pressed={actual} className={cx(seg, actual ? on : off)} onClick={() => setActual(true)} title={`Actual pixels: ${doc.stage.width} × ${doc.stage.height}`}>100 %</button>
        </div>
        <Btn small active={full} onClick={toggleFull}>{full ? 'Exit full screen' : 'Full screen'}</Btn>
        {mode === 'sim'
          ? <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-violet-200" data-testid="preview-data-label">SIMULATED DATA</span>
          : <span className={cx('rounded px-1.5 py-0.5 text-[10px] font-semibold', liveReady ? 'bg-red-500/20 text-red-200' : 'bg-amber-500/20 text-amber-200')} data-testid="preview-data-label">{liveReady ? 'LIVE DATA' : 'LIVE: NO ROUND CHOSEN'}</span>}
        {publishedUrl && <Btn small onClick={() => window.open(`${publishedUrl}${publishedUrl.includes('?') ? '&' : '?'}debug=1`, '_blank', 'noopener')}>Open published output</Btn>}
        <Btn small className="ml-auto" onClick={onClose}>Back to editing (Esc)</Btn>
      </div>
      <div className={cx('relative min-h-0 flex-1', actual && 'overflow-auto')} style={BACKDROPS[backdrop].style}>
        <div style={actual ? { width: doc.stage.width, height: doc.stage.height, position: 'relative' } : { position: 'absolute', inset: 0 }}>
          {animated
            ? <LayoutRenderer key="run" layout={doc} state={state} events={engine} assetBase={assetBase} fit={actual ? 1 : 'contain'} />
            : <LayoutRenderer key="still" layout={doc} state={state} events={null} mode="editor" playTimelines={false} assetBase={assetBase} fit={actual ? 1 : 'contain'} />}
        </div>
      </div>
    </div>
  );
}

function FullMessage({ title, body, retry }: { title: string; body: string; retry?(): void }) {
  return (
    <div className="flex h-screen items-center justify-center bg-neutral-950 px-6 text-slate-200">
      <div className="max-w-sm text-center">
        <p className="mb-2 text-lg font-semibold">{title}</p>
        <p className="mb-6 text-sm text-slate-400">{body}</p>
        <div className="flex justify-center gap-2">
          <Link to="/designer" className="rounded border border-white/10 px-4 py-2 text-sm hover:bg-white/5">Back to layouts</Link>
          {retry && <button type="button" onClick={retry} className="rounded border border-white/10 px-4 py-2 text-sm hover:bg-white/5">Retry</button>}
        </div>
      </div>
    </div>
  );
}


const TOOLS: Array<{ id: DrawTool; label: string; title: string }> = [
  { id: 'select', label: '↖', title: 'Select / move (V)' },
  { id: 'frame', label: '⌗', title: 'Frame: a box that clips whatever is put inside it. Drag to draw (K)' },
  { id: 'rect', label: '▭', title: 'Rectangle — drag to draw (R)' },
  { id: 'roundRect', label: '▢', title: 'Rounded rectangle — drag to draw (U)' },
  { id: 'ellipse', label: '◯', title: 'Ellipse — drag to draw (O)' },
  { id: 'polygon', label: '⬡', title: 'Polygon — drag to draw (Y). Click it again to choose the shape' },
  { id: 'line', label: '╱', title: 'Line — drag to draw (L)' },
  { id: 'text', label: 'T', title: 'Text — click or drag (T)' },
  { id: 'image', label: '▣', title: 'Image from your library: click, or drag a box for it (M). You can also drop a file on the canvas' },
  { id: 'direct', label: '⌖', title: 'Direct select — edit path points (A)' },
  { id: 'pen', label: '✒', title: 'Pen — click for corners, drag for curves (P)' },
  { id: 'pencil', label: '✎', title: 'Pencil — freehand (Shift+P)' },
  { id: 'hand', label: '✋', title: 'Hand — pan the canvas (H, or hold Space)' },
  { id: 'eyedropper', label: '💧', title: 'Eyedropper — click a layer to copy its color onto the selection (I)' },
];

function ToolPalette({ tool, setTool, disabled, polygonShape, setPolygonShape }: {
  tool: DrawTool; setTool(t: DrawTool): void; disabled?: boolean; polygonShape: string; setPolygonShape(id: string): void;
}) {
  return (
    <div className="relative flex w-10 shrink-0 flex-col items-center gap-1 overflow-visible border-r border-white/10 bg-neutral-900/80 py-2" data-testid="tool-palette">
      {tool === 'polygon' && !disabled && (
        <div className="absolute left-full top-2 z-30 ml-1 w-40 rounded border border-white/10 bg-neutral-950 p-1 shadow-2xl" role="listbox" aria-label="Polygon shape" data-testid="polygon-shapes">
          <div className="px-1.5 pb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Shape to draw</div>
          {SHAPE_PRESETS.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected={polygonShape === p.id} onClick={() => setPolygonShape(p.id)}
              className={cx('block w-full rounded px-1.5 py-1 text-left text-[11px]', polygonShape === p.id ? 'bg-amber-400/20 text-amber-100' : 'text-slate-300 hover:bg-white/10')}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.title}
          aria-pressed={tool === t.id}
          data-tool={t.id}
          disabled={disabled && t.id !== 'select' && t.id !== 'hand'}
          onClick={() => setTool(t.id)}
          className={cx('flex h-8 w-8 items-center justify-center rounded text-sm disabled:opacity-30', tool === t.id ? 'bg-amber-400/20 text-amber-100' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
