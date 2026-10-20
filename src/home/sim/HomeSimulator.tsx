// The home page simulation: a guided walk through setting up a tournament,
// with every overlay on a 1920×1080 stage. The data is the Designer's
// simulation (graphics/editor/simulation.ts) driving the REAL overlay engine,
// seeded with the event the site admin picked (showcase.ts) or the built-in
// sample. Nothing here touches the network apart from that one showcase fetch,
// and nothing a visitor types is saved.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SiteContent, SimStepId } from '../../content/siteContent.types.ts';
import { createSimulation, SIM_ROUND_ID, SIM_SCENARIOS, SIM_TOURNAMENT_ID, runScenario, type Simulation } from '../../graphics/editor/simulation.ts';
import { useOverlayEngine } from '../../overlayClient/react.ts';
import type { EngineOptions } from '../../overlayClient/engineTypes.ts';
import { AVAILABLE_THEMES } from '../../Themes/registry.ts';
import { VIEW_GROUPS, type OverlayView } from '../../dashboard/overlayViews.ts';
import { renderThemeView, themeHasView } from '../../dashboard/themeViews.tsx';
import { LayoutRenderer } from '../../graphics/renderer/LayoutRenderer.tsx';
import { DESKTOP_TEMPLATES } from '../../graphics/templates/desktop.ts';
import { createEmptyLayout } from '../../graphics/schema/layoutSchema.js';
import type { LayoutDocument } from '../../graphics/schema/layoutTypes.ts';
import { SimStage } from './SimStage.tsx';
import { loadShowcase, type HomeShowcase } from './showcase.ts';
import { localFromEngine } from './localFromEngine.ts';
import { startAutoplay } from './autoplay.ts';

type Text = SiteContent['simulator'];

const STEPS: SimStepId[] = ['tournament', 'round', 'teams', 'theme', 'overlays', 'live'];
const PLACE_POINTS = [10, 6, 5, 4, 3, 2, 1, 1];

/** Schedule tiles have their own keys on DisplayHud; the renderer knows them by these. */
const STAGE_VIEW: Record<string, string> = { __schedule: 'Schedule', __highlight: 'HighlightSchedule' };
const stageView = (key: string) => STAGE_VIEW[key] || key;
/** Match controls only make sense on a live view: from any other, they switch to this one. */
const ON_AIR = new Set(VIEW_GROUPS.find((g) => g.id === 'match')?.views.map((v) => v.key) || []);

interface Edits { tournamentName?: string; torLogo?: string; primaryColor?: string; secondaryColor?: string; roundName?: string; day?: string }

const viewOnTheme = (v: OverlayView, theme: string) => (!v.themes || v.themes.includes(theme)) && themeHasView(stageView(v.key), theme);
/** What the theme picker can preview, in order: the first the theme has is shown first. */
const PREVIEW_VIEWS: Array<{ key: string; label: string }> = [
  { key: 'Lower', label: 'Lower third' }, { key: 'OverAllData', label: 'Standings' }, { key: 'LiveStats', label: 'Live stats' }, { key: 'mvp', label: 'MVP' },
];
const ALL_VIEWS = VIEW_GROUPS.flatMap((g) => g.views);
const viewCount = (theme: string) => ALL_VIEWS.filter((v) => viewOnTheme(v, theme)).length;

function templateDoc(id: string, primary?: string, secondary?: string): LayoutDocument | null {
  const t = DESKTOP_TEMPLATES.find((x) => x.id === id);
  if (!t) return null;
  const doc = createEmptyLayout() as LayoutDocument;
  doc.elements = t.elements;
  doc.stage = { ...doc.stage, background: null };
  const colors = { ...(doc.theme?.colors || {}) };
  if (primary) colors.primary = primary;
  if (secondary) colors.secondary = secondary;
  doc.theme = { ...doc.theme, colors };
  return doc;
}

// ── small UI pieces ──────────────────────────────────────────────────────────

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block font-mono text-[10px] tracking-[0.18em] text-[#93959C] mb-1.5 uppercase">{label}</span>
    {children}
  </label>
);

const inputCls = 'w-full bg-[#0B0C0E] border border-[#24262B] px-3 py-2 text-sm text-[#F4F2EE] focus:outline-none focus:border-[#E11D2E]';

const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'ghost' | 'solid'; active?: boolean }> = ({ tone = 'ghost', active, className = '', ...rest }) => {
  const base = 'px-3 py-2 text-xs font-mono tracking-[0.08em] uppercase border transition-colors disabled:opacity-40';
  const look = tone === 'primary'
    ? 'bg-[#E11D2E] border-[#E11D2E] text-white hover:bg-[#8C1220] hover:border-[#8C1220]'
    : active
      ? 'bg-[#E11D2E]/15 border-[#E11D2E] text-[#F4F2EE]'
      : tone === 'solid'
        ? 'bg-[#17181D] border-[#24262B] text-[#F4F2EE] hover:border-[#E11D2E]'
        : 'bg-transparent border-[#24262B] text-[#93959C] hover:border-[#E11D2E] hover:text-[#F4F2EE]';
  return <button type="button" className={`${base} ${look} ${className}`} {...rest} />;
};

/** One card per built-in theme: its name, an optional one-liner and how many overlays it has. */
const ThemeCards: React.FC<{ themes: string[]; current: string; name: (t: string) => string; hint: (t: string) => string | undefined; onPick: (t: string) => void }> = ({ themes, current, name, hint, onPick }) => (
  <div className="grid grid-cols-2 gap-2">
    {themes.map((t) => {
      const on = t === current;
      return (
        <button
          key={t}
          type="button"
          aria-pressed={on}
          onClick={() => onPick(t)}
          className={`relative text-left px-3 py-3 border transition-colors ${on ? 'border-[#E11D2E] bg-[#E11D2E]/10' : 'border-[#24262B] bg-[#17181D] hover:border-[#E11D2E]'}`}
        >
          <span className="block font-display font-bold text-sm text-[#F4F2EE] uppercase">{name(t)}</span>
          {hint(t) && <span className="block mt-0.5 text-[11px] text-[#93959C] leading-snug">{hint(t)}</span>}
          <span className="block mt-1 font-mono text-[10px] tracking-[0.12em] text-[#55565C]">{viewCount(t)} OVERLAYS</span>
          {on && <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#E11D2E]" />}
        </button>
      );
    })}
  </div>
);

// ── the simulator ────────────────────────────────────────────────────────────

const HomeSimulator: React.FC<{ text: Text }> = ({ text }) => {
  // The showcase decides the teams, so the simulation starts once it is known
  // (or has failed, which falls back to the built-in sample).
  const [showcase, setShowcase] = useState<HomeShowcase | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadShowcase().then((s) => { if (alive) setShowcase(s); });
    return () => { alive = false; };
  }, []);

  const sim = useMemo<Simulation | null>(() => (showcase === undefined ? null : createSimulation(showcase?.seed)), [showcase]);
  const engineOptions = useMemo<EngineOptions | null>(
    () => (sim ? { tournamentId: SIM_TOURNAMENT_ID, roundId: SIM_ROUND_ID, matchId: null, followSelected: true, view: null } : null),
    [sim],
  );
  const makeTransport = useCallback(() => sim!.transport, [sim]);
  const { state, engine } = useOverlayEngine(engineOptions, makeTransport);

  // The visitor picks a theme first; the guided steps (and autoplay) start after.
  const [phase, setPhase] = useState<'pick' | 'run'>('pick');
  const [step, setStep] = useState(0);
  const [theme, setTheme] = useState('Theme1');
  const [view, setView] = useState('Lower');
  const [desktopTool, setDesktopTool] = useState<string | null>(null);
  const [overlayTab, setOverlayTab] = useState<'web' | 'desktop'>('web');
  const [edits, setEdits] = useState<Edits>({});
  const [autoplay, setAutoplay] = useState(false);
  const stopAutoplay = useRef<(() => void) | null>(null);

  useEffect(() => {
    const t = showcase?.defaultTheme;
    if (t && AVAILABLE_THEMES.includes(t)) setTheme(t);
  }, [showcase]);

  // Views a visitor may pick on this theme (the admin can narrow the list).
  const allowed = useMemo(() => new Set(showcase?.views?.length ? showcase.views : []), [showcase]);
  const groups = useMemo(
    () => VIEW_GROUPS
      .map((g) => ({ ...g, views: g.views.filter((v) => viewOnTheme(v, theme) && (!allowed.size || allowed.has(v.key))) }))
      .filter((g) => g.views.length),
    [theme, allowed],
  );
  const hasView = useCallback((key: string) => groups.some((g) => g.views.some((v) => v.key === key)), [groups]);

  // A theme without the current view falls back to the lower third.
  useEffect(() => { if (!hasView(view)) setView(groups[0]?.views[0]?.key || 'Lower'); }, [hasView, view, groups]);

  const halt = useCallback(() => {
    stopAutoplay.current?.();
    stopAutoplay.current = null;
    setAutoplay(false);
  }, []);

  const play = useCallback(() => {
    if (!sim) return;
    halt();
    setDesktopTool(null);
    setAutoplay(true);
    stopAutoplay.current = startAutoplay(sim.controls, setView, hasView, () => { stopAutoplay.current = null; setAutoplay(false); });
  }, [sim, halt, hasView]);

  // Play a match on its own the first time the data is in, so the stage moves
  // before anyone touches it. Any choice the visitor makes stops it.
  const started = useRef(false);
  useEffect(() => {
    if (phase !== 'run' || started.current || !state?.matchData?.teams?.length) return;
    started.current = true;
    play();
  }, [phase, state, play]);
  useEffect(() => () => stopAutoplay.current?.(), []);

  // The zone clock and player drift on the desktop tools: one tick a second, only while one is shown.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!desktopTool) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [desktopTool]);

  const tournament = useMemo(() => {
    if (!state?.tournament) return null;
    const t: any = { ...state.tournament, ...pick(edits, ['torLogo', 'primaryColor', 'secondaryColor']) };
    // A cleared name stays cleared while typing (pick() drops empty values).
    if (edits.tournamentName !== undefined) t.tournamentName = edits.tournamentName;
    return t;
  }, [state?.tournament, edits]);
  const round = useMemo(() => (state?.round ? { ...state.round, ...pick(edits, ['roundName', 'day']) } : null), [state?.round, edits]);
  const matches: any[] = state?.matches ?? [];
  const teams: any[] = useMemo(() => [...(state?.matchData?.teams || [])].sort((a: any, b: any) => (a.slot || 0) - (b.slot || 0)), [state?.matchData]);

  const desktopDoc = useMemo(
    () => (desktopTool ? templateDoc(desktopTool, tournament?.primaryColor, tournament?.secondaryColor) : null),
    [desktopTool, tournament?.primaryColor, tournament?.secondaryColor],
  );
  const desktopState = useMemo(
    () => (desktopTool && state ? ({ ...state, tournament, round, local: localFromEngine(state, tick) } as any) : null),
    [desktopTool, state, tournament, round, tick],
  );

  // ── actions ──
  const choose = (fn: () => void) => { halt(); fn(); };
  const pickView = (key: string) => choose(() => { setDesktopTool(null); setView(key); });
  const pickTool = (id: string) => choose(() => setDesktopTool(id));
  const control = (fn: (c: Simulation['controls']) => void) => () => {
    if (!sim) return;
    halt();
    if (!desktopTool && !ON_AIR.has(view)) setView(hasView('LiveStats') ? 'LiveStats' : 'Lower');
    fn(sim.controls);
  };
  const edit = (patch: Edits) => choose(() => setEdits((e) => ({ ...e, ...patch })));
  const onLogo = (file?: File | null) => {
    if (!file || !file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' && edit({ torLogo: reader.result });
    reader.readAsDataURL(file);
  };
  const goStep = (i: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, i));
    setStep(next);
    // Each step shows the overlay that makes its effect visible.
    const show: Partial<Record<SimStepId, string>> = { tournament: 'Lower', round: 'Lower', teams: 'slots' };
    const v = show[STEPS[next]];
    if (v && hasView(v)) pickView(v);
    else halt();
  };

  const themeName = (t: string) => text.pickTheme.themes?.[t]?.name || t.replace('Theme', 'Theme ');
  const previews = PREVIEW_VIEWS.filter((p) => hasView(p.key));
  const previewTheme = (t: string) => {
    setTheme(t);
    // Keep the preview on the same overlay when the new theme has it (the fallback effect handles the rest).
    if (!themeHasView(stageView(view), t)) setView(PREVIEW_VIEWS.find((p) => themeHasView(p.key, t))?.key || 'Lower');
  };
  const startRun = () => {
    setPhase('run');
    setStep(0);
    if (hasView('Lower')) setView('Lower');
    // The first run starts from the effect above, once the data is in; later ones start here.
    if (started.current) play();
  };

  // ── stage ──
  const stage = !state || state.status.loading || !tournament ? (
    <div className="absolute inset-0 flex items-center justify-center">
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 28, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)' }}>LOADING SIMULATION…</span>
    </div>
  ) : desktopDoc && desktopState ? (
    <LayoutRenderer layout={desktopDoc} state={desktopState} events={engine} mode="runtime" fit={1} />
  ) : (
    renderThemeView(stageView(view), theme, {
      tournament, round, match: state.match ?? null, matchData: state.matchData ?? null, matches,
      matchDatas: state.matchDatas ?? [], overallData: state.overallData ?? null, deadTeamList: state.deadTeamList ?? [],
      backpackInfo: null, selectedScheduleMatchIds: matches.map((m) => String(m._id)),
    })
  );

  const current = STEPS[step];
  const stepText = text.steps[current];
  const tileLabel = desktopTool
    ? text.desktopTools.find((d) => d.key === desktopTool)?.label
    : groups.flatMap((g) => g.views).find((v) => v.key === view)?.label;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
      {/* Stage */}
      <div className="min-w-0">
        <SimStage tag={text.stageTag} background={text.stageBackground || undefined} live={autoplay}>{stage}</SimStage>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[10px] tracking-[0.15em] text-[#55565C]">ON AIR</span>
            <span className="font-display font-bold text-sm text-[#F4F2EE] uppercase truncate">{tileLabel || '—'}</span>
            <span className="font-mono text-[10px] tracking-[0.15em] text-[#55565C]">· {themeName(theme).toUpperCase()}</span>
          </div>
          {phase === 'pick'
            ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={text.pickTheme.previewLabel}>
                {previews.map((p) => <Btn key={p.key} active={view === p.key} onClick={() => setView(p.key)}>{p.label}</Btn>)}
              </div>
            )
            : autoplay
              ? <Btn onClick={halt}>■ {text.controls.stop}</Btn>
              : <Btn tone="primary" onClick={play} disabled={!sim}>▶ {text.controls.autoplay}</Btn>}
        </div>
        <p className="mt-2 font-mono text-[10px] tracking-[0.12em] text-[#55565C]">{text.disclaimer}</p>
      </div>

      {phase === 'pick' ? (
        <aside className="bg-[#131418] border border-[#24262B] min-w-0 p-5">
          <h3 className="font-display font-bold text-lg text-[#F4F2EE] uppercase tracking-tight">{text.pickTheme.title}</h3>
          {text.pickTheme.hint && <p className="mt-1.5 text-sm text-[#93959C] leading-relaxed">{text.pickTheme.hint}</p>}
          <div className="mt-5 max-h-[420px] overflow-y-auto pr-1">
            <ThemeCards themes={AVAILABLE_THEMES} current={theme} name={themeName} hint={(t) => text.pickTheme.themes?.[t]?.hint} onPick={previewTheme} />
          </div>
          <Btn tone="primary" onClick={startRun} disabled={!sim} className="mt-5 w-full py-3 text-sm">
            ▶ {text.pickTheme.start.replace('{theme}', themeName(theme))}
          </Btn>
        </aside>
      ) : (
      <aside className="bg-[#131418] border border-[#24262B] min-w-0">
        <ol className="flex overflow-x-auto border-b border-[#24262B] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
          {STEPS.map((id, i) => (
            <li key={id} className="shrink-0">
              <button
                type="button"
                role="tab"
                aria-selected={i === step}
                onClick={() => goStep(i)}
                className={`flex items-center gap-1.5 px-2.5 py-3 text-[11px] font-mono tracking-[0.08em] uppercase border-b-2 ${i === step ? 'border-[#E11D2E] text-[#F4F2EE]' : 'border-transparent text-[#55565C] hover:text-[#93959C]'}`}
              >
                <span className={`w-5 h-5 flex items-center justify-center text-[10px] ${i < step ? 'bg-[#E11D2E] text-white' : i === step ? 'border border-[#E11D2E] text-[#E11D2E]' : 'border border-[#24262B]'}`}>{i < step ? '✓' : i + 1}</span>
                {/* Only the current step is named: six labels do not fit the panel. */}
                {i === step && <span className="whitespace-nowrap">{text.steps[id].title}</span>}
              </button>
            </li>
          ))}
        </ol>

        <div className="p-5">
          <h3 className="font-display font-bold text-lg text-[#F4F2EE] uppercase tracking-tight">{step + 1}. {stepText.title}</h3>
          {stepText.hint && <p className="mt-1.5 text-sm text-[#93959C] leading-relaxed">{stepText.hint}</p>}

          <div className="mt-5 space-y-4">
            {current === 'tournament' && (
              <>
                <Field label="Tournament name">
                  <input className={inputCls} value={tournament?.tournamentName ?? ''} maxLength={60} onChange={(e) => edit({ tournamentName: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Primary colour">
                    <input type="color" className="w-full h-10 bg-[#0B0C0E] border border-[#24262B] cursor-pointer" value={hex(tournament?.primaryColor, '#e11d2e')} onChange={(e) => edit({ primaryColor: e.target.value })} />
                  </Field>
                  <Field label="Secondary colour">
                    <input type="color" className="w-full h-10 bg-[#0B0C0E] border border-[#24262B] cursor-pointer" value={hex(tournament?.secondaryColor, '#111827')} onChange={(e) => edit({ secondaryColor: e.target.value })} />
                  </Field>
                </div>
                <Field label="Logo">
                  <div className="flex items-center gap-3">
                    {tournament?.torLogo && <img src={tournament.torLogo} alt="" className="w-10 h-10 object-contain bg-black/40" />}
                    <input type="file" accept="image/*" className="text-xs text-[#93959C] file:mr-3 file:px-3 file:py-1.5 file:border file:border-[#24262B] file:bg-[#17181D] file:text-[#F4F2EE]" onChange={(e) => onLogo(e.target.files?.[0])} />
                  </div>
                </Field>
              </>
            )}

            {current === 'round' && (
              <>
                <div className="grid grid-cols-[1fr_110px] gap-3">
                  <Field label="Round name">
                    <input className={inputCls} value={round?.roundName ?? ''} maxLength={40} onChange={(e) => edit({ roundName: e.target.value })} />
                  </Field>
                  <Field label="Day">
                    <input className={inputCls} value={round?.day ?? ''} maxLength={16} onChange={(e) => edit({ day: e.target.value })} />
                  </Field>
                </div>
                <Field label={`Matches (${matches.length})`}>
                  <div className="flex flex-wrap gap-1.5">
                    {matches.map((m) => (
                      <span key={m._id} className={`px-2 py-1 text-[11px] font-mono border ${String(m._id) === String(state?.match?._id) ? 'border-[#E11D2E] text-[#F4F2EE]' : 'border-[#24262B] text-[#93959C]'}`}>M{m.matchNo} · {m.map}</span>
                    ))}
                  </div>
                </Field>
                <Field label="Scoring">
                  <div className="grid grid-cols-8 gap-px bg-[#24262B] border border-[#24262B] text-center">
                    {PLACE_POINTS.map((p, i) => (
                      <div key={i} className="bg-[#0B0C0E] py-1.5">
                        <div className="font-mono text-[9px] text-[#55565C]">#{i + 1}</div>
                        <div className="font-display font-bold text-sm text-[#F4F2EE]">{p}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-[#55565C]">+1 point per kill</p>
                </Field>
              </>
            )}

            {current === 'teams' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-[0.18em] text-[#93959C] uppercase">{showcase?.seed?.groupName || 'Group A'}</span>
                  <span className="font-mono text-[10px] tracking-[0.18em] text-[#55565C]">{teams.length} TEAMS</span>
                </div>
                <ul className="max-h-[340px] overflow-y-auto pr-1 space-y-1.5">
                  {teams.map((t: any) => (
                    <li key={t.teamId} className="flex items-center gap-3 bg-[#0B0C0E] border border-[#24262B] px-2.5 py-2">
                      <span className="w-6 font-mono text-[11px] text-[#55565C]">{String(t.slot).padStart(2, '0')}</span>
                      <img src={t.teamLogo || '/def_logo.avif'} alt="" width={28} height={28} className="w-7 h-7 object-contain" loading="lazy" />
                      <div className="min-w-0">
                        <div className="text-sm text-[#F4F2EE] truncate">{t.teamName}</div>
                        <div className="text-[11px] text-[#55565C] truncate">{(t.players || []).map((p: any) => p.playerName).join(' · ')}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {current === 'theme' && (
              <ThemeCards themes={AVAILABLE_THEMES} current={theme} name={themeName} hint={(t) => text.pickTheme.themes?.[t]?.hint} onPick={(t) => choose(() => setTheme(t))} />
            )}

            {current === 'overlays' && (
              <>
                <div className="flex gap-2">
                  <Btn active={overlayTab === 'web'} onClick={() => setOverlayTab('web')}>{text.overlayTabs.web}</Btn>
                  <Btn active={overlayTab === 'desktop'} onClick={() => setOverlayTab('desktop')} disabled={!text.desktopTools.length}>{text.overlayTabs.desktop}</Btn>
                </div>
                <div className="max-h-[380px] overflow-y-auto pr-1 space-y-4">
                  {overlayTab === 'web'
                    ? groups.map((g) => (
                      <div key={g.id}>
                        <div className="font-mono text-[10px] tracking-[0.18em] text-[#55565C] uppercase mb-1.5">{g.label}</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {g.views.map((v) => (
                            <Btn key={v.key} tone="solid" active={!desktopTool && v.key === view} onClick={() => pickView(v.key)} className="normal-case tracking-normal text-left">
                              {v.label}
                            </Btn>
                          ))}
                        </div>
                      </div>
                    ))
                    : text.desktopTools.map((d) => (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => pickTool(d.key)}
                        className={`block w-full text-left px-3 py-2.5 border ${desktopTool === d.key ? 'border-[#E11D2E] bg-[#E11D2E]/10' : 'border-[#24262B] bg-[#17181D] hover:border-[#E11D2E]'}`}
                      >
                        <div className="text-sm text-[#F4F2EE]">{d.label}</div>
                        <div className="text-xs text-[#93959C] mt-0.5">{d.hint}</div>
                      </button>
                    ))}
                </div>
              </>
            )}

            {current === 'live' && (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  <Btn tone="solid" onClick={control((c) => c.kill())}>{text.controls.kill}</Btn>
                  <Btn tone="solid" onClick={control((c) => c.eliminate())}>{text.controls.eliminate}</Btn>
                  <Btn tone="solid" onClick={control((c) => c.knock())}>{text.controls.knock}</Btn>
                  <Btn tone="solid" onClick={control((c) => c.revive())}>{text.controls.revive}</Btn>
                  <Btn tone="solid" onClick={control((c) => c.recall())}>{text.controls.recall}</Btn>
                  <Btn tone="solid" onClick={control((c) => c.milestone())}>{text.controls.milestone}</Btn>
                  <Btn tone="solid" onClick={control((c) => c.matchEnd())}>{text.controls.matchEnd}</Btn>
                  <Btn tone="solid" onClick={control((c) => c.reset())}>{text.controls.reset}</Btn>
                </div>
                <Field label={text.controls.scenarios}>
                  <select
                    className={inputCls}
                    value=""
                    onChange={(e) => { const id = e.target.value; if (id) control((c) => runScenario(c, id))(); }}
                  >
                    <option value="">—</option>
                    {SIM_SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label} · {s.hint}</option>)}
                  </select>
                </Field>
              </>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Btn onClick={() => goStep(step - 1)} disabled={step === 0}>← {text.back}</Btn>
            {step < STEPS.length - 1
              ? <Btn tone="primary" onClick={() => goStep(step + 1)}>{text.next} →</Btn>
              : <Btn tone="primary" onClick={play} disabled={!sim}>▶ {text.controls.autoplay}</Btn>}
          </div>
        </div>
      </aside>
      )}
    </div>
  );
};

function pick<T extends object, K extends keyof T>(o: T, keys: K[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) if (o[k] !== undefined && o[k] !== '') out[k] = o[k];
  return out;
}

/** <input type="color"> only takes #rrggbb. */
function hex(v: unknown, or: string): string {
  const s = String(v || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return or;
}

export default HomeSimulator;
