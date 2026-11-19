// The home page simulation: a showcase deck. Every built-in theme, every
// overlay it has and the desktop tools render on a 1920×1080 stage, and an
// action pad under the stage drives the match (kills, knocks, heals, airdrops,
// streak cards, ranking pages…). The data is the Designer's simulation
// (graphics/editor/simulation.ts) driving the REAL overlay engine, seeded with
// the event the site admin picked (showcase.ts) or the built-in sample.
//
// Bandwidth: everything runs in this browser. The simulation's socket is a
// fake in memory; setHomeDemo(true) keeps theme code from opening the cloud
// socket or asking the desktop relay. The only request is the cached showcase
// fetch, and nothing a visitor types is saved.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SiteContent } from '../../content/siteContent.types.ts';
import {
  createSimulation, SIM_ROUND_ID, SIM_SCENARIOS, SIM_TEAM_COUNTS, SIM_TOURNAMENT_ID, runScenario,
  type SimMilestone, type Simulation,
} from '../../graphics/editor/simulation.ts';
import { useOverlayEngine } from '../../overlayClient/react.ts';
import type { EngineOptions } from '../../overlayClient/engineTypes.ts';
import { AVAILABLE_THEMES } from '../../Themes/registry.ts';
import { VIEW_GROUPS, type OverlayView } from '../../dashboard/overlayViews.ts';
import { renderThemeView, themeHasView } from '../../dashboard/themeViews.tsx';
import { LayoutRenderer } from '../../graphics/renderer/LayoutRenderer.tsx';
import { DESKTOP_TEMPLATES } from '../../graphics/templates/desktop.ts';
import { createEmptyLayout } from '../../graphics/schema/layoutSchema.js';
import type { LayoutDocument } from '../../graphics/schema/layoutTypes.ts';
import { setHomeDemo } from '../../Themes/shared/demoMode.ts';
import { holdRankingPageLocal, rankingPageCount, useRankingReplay, type RankingView } from '../../Themes/shared/hooks/rankingPager.ts';
import { SimStage } from './SimStage.tsx';
import { loadShowcase, type HomeShowcase } from './showcase.ts';
import { localFromEngine } from './localFromEngine.ts';
import { startAutoplay, dropAirdrop } from './autoplay.ts';

type Text = SiteContent['simulator'];

/** Schedule tiles have their own keys on DisplayHud; the renderer knows them by these. */
const STAGE_VIEW: Record<string, string> = { __schedule: 'Schedule', __highlight: 'HighlightSchedule' };
const stageView = (key: string) => STAGE_VIEW[key] || key;
/** Live views: a match action keeps the stage on one of these, otherwise it switches to its own view. */
const ON_AIR = new Set(VIEW_GROUPS.find((g) => g.id === 'match')?.views.map((v) => v.key) || []);
const RANKING_VIEWS: Array<{ key: RankingView; label: string }> = [
  { key: 'MatchData', label: 'Match ranking' }, { key: 'OverAllData', label: 'Overall ranking' },
];
const CARDS: Array<{ id: SimMilestone; label: string }> = [
  { id: 'firstBlood', label: 'First blood' }, { id: 'streak3', label: 'Domination' }, { id: 'streak5', label: 'Rampage' },
  { id: 'streak8', label: 'Unstoppable' }, { id: 'damage', label: 'Damage 500' }, { id: 'killSteal', label: 'Kill stolen' },
];

interface Edits { tournamentName?: string; torLogo?: string; primaryColor?: string; secondaryColor?: string; roundName?: string; day?: string }

const viewOnTheme = (v: OverlayView, theme: string) => (!v.themes || v.themes.includes(theme)) && themeHasView(stageView(v.key), theme);
const ALL_VIEWS = VIEW_GROUPS.flatMap((g) => g.views);
const viewCount = (theme: string) => ALL_VIEWS.filter((v) => viewOnTheme(v, theme)).length;
const THEMES = [...AVAILABLE_THEMES].sort((a, b) => Number(a.replace(/\D+/g, '')) - Number(b.replace(/\D+/g, '')));

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

const PadGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="font-mono text-[10px] tracking-[0.18em] text-[#55565C] uppercase mb-1.5">{label}</div>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </div>
);

// ── the simulator ────────────────────────────────────────────────────────────

const HomeSimulator: React.FC<{ text: Text }> = ({ text }) => {
  // Before any theme view mounts: theme code stays off the network on this page.
  useState(() => { setHomeDemo(true); return true; });
  useEffect(() => { setHomeDemo(true); return () => setHomeDemo(false); }, []);

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

  const [theme, setTheme] = useState('Theme1');
  const [view, setView] = useState('Lower');
  const [desktopTool, setDesktopTool] = useState<string | null>(null);
  const [panel, setPanel] = useState<'overlays' | 'desktop' | 'customise'>('overlays');
  const [edits, setEdits] = useState<Edits>({});
  const [autoplay, setAutoplay] = useState(false);
  const [firing, setFiring] = useState(false);
  const [zone, setZone] = useState(false);
  const [rankPage, setRankPage] = useState<number | null>(null);
  const [teamCount, setTeamCount] = useState<number | null>(null);
  const stopAutoplay = useRef<(() => void) | null>(null);

  useEffect(() => {
    const t = showcase?.defaultTheme;
    if (t && THEMES.includes(t)) setTheme(t);
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

  // A theme without the current view falls back to the first one it has.
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
    setFiring(false); setZone(false);
    setAutoplay(true);
    stopAutoplay.current = startAutoplay(sim.controls, setView, hasView, () => { stopAutoplay.current = null; setAutoplay(false); });
  }, [sim, halt, hasView]);

  // Play a match on its own the first time the data is in, so the stage moves
  // before anyone touches it. Any choice the visitor makes stops it.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !state?.matchData?.teams?.length) return;
    started.current = true;
    play();
  }, [state, play]);
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

  // Ranking pages: picked here, held locally (no socket), remounting the ranking so it animates again.
  const rankingView: RankingView | null = !desktopTool && (view === 'MatchData' || view === 'OverAllData') ? view : null;
  const rankingReplay = useRankingReplay(rankingView || '');
  const pageCount = rankingView ? rankingPageCount(theme, rankingView, teams.length) : 0;

  // ── actions ──
  const choose = (fn: () => void) => { halt(); fn(); };
  const pickView = (key: string) => choose(() => { setDesktopTool(null); setView(key); });
  const pickTool = (id: string) => choose(() => setDesktopTool(id));
  const pickTheme = (t: string) => choose(() => setTheme(t));
  /** Run a sim action and put the overlay that shows it on stage (`keepOnAir`: any live view will do). */
  const act = (fn: (c: Simulation['controls']) => void, target: string, keepOnAir = true) => () => {
    if (!sim) return;
    halt();
    if (!(desktopTool && keepOnAir) && !(keepOnAir && !desktopTool && ON_AIR.has(view) && view !== 'intro' && view !== 'AirdropInfo')) {
      const next = hasView(target) ? target : hasView('LiveStats') ? 'LiveStats' : 'Lower';
      setDesktopTool(null);
      setView(next);
    }
    fn(sim.controls);
  };
  const toggleFiring = act((c) => { c.setFiring(!firing); setFiring(!firing); }, 'LiveStats');
  const toggleZone = act((c) => { c.setOutsideZone(!zone); setZone(!zone); }, 'LiveStats');
  const freshMatch = () => { setFiring(false); setZone(false); };
  const showPage = (rv: RankingView, page: number | null) => choose(() => {
    setDesktopTool(null);
    setView(rv);
    setRankPage(page);
    holdRankingPageLocal(rv, page);
  });
  const changeTeams = (n: number) => choose(() => {
    if (!sim) return;
    sim.controls.setTeamCount(n);
    setTeamCount(sim.controls.teamCount());
    freshMatch();
  });

  const edit = (patch: Edits) => choose(() => setEdits((e) => ({ ...e, ...patch })));
  const onLogo = (file?: File | null) => {
    if (!file || !file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' && edit({ torLogo: reader.result });
    reader.readAsDataURL(file);
  };

  const themeName = (t: string) => text.pickTheme.themes?.[t]?.name || t.replace('Theme', 'Theme ');

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
      rankingReplay: rankingView ? `${rankingView}-${rankingReplay}` : undefined,
    })
  );

  const tileLabel = desktopTool
    ? text.desktopTools.find((d) => d.key === desktopTool)?.label
    : groups.flatMap((g) => g.views).find((v) => v.key === view)?.label;
  const c = text.controls;
  const off = !sim;
  const currentTeams = teamCount ?? sim?.controls.teamCount() ?? 0;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
      {/* Stage + action pad */}
      <div className="min-w-0">
        <SimStage tag={text.stageTag} background={text.stageBackground || undefined} live={autoplay}>{stage}</SimStage>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[10px] tracking-[0.15em] text-[#55565C]">ON AIR</span>
            <span className="font-display font-bold text-sm text-[#F4F2EE] uppercase truncate">{tileLabel || '—'}</span>
            <span className="font-mono text-[10px] tracking-[0.15em] text-[#55565C]">· {themeName(theme).toUpperCase()}</span>
          </div>
          {autoplay
            ? <Btn onClick={halt}>■ {c.stop}</Btn>
            : <Btn tone="primary" onClick={play} disabled={off}>▶ {c.autoplay}</Btn>}
        </div>

        <div className="mt-4 bg-[#131418] border border-[#24262B] p-4 space-y-4" role="group" aria-label="Match actions">
          <PadGroup label="Match">
            <Btn tone="solid" disabled={off} onClick={act((s) => s.kill(), 'LiveStats')}>{c.kill}</Btn>
            <Btn tone="solid" disabled={off} onClick={act((s) => s.knock(), 'LiveStats')}>{c.knock}</Btn>
            <Btn tone="solid" disabled={off} onClick={act((s) => s.revive(), 'LiveStats')}>{c.revive}</Btn>
            <Btn tone="solid" disabled={off} onClick={act((s) => s.heal(), 'LiveStats')}>Heal</Btn>
            <Btn tone="solid" disabled={off} onClick={act((s) => s.setHealth(35), 'LiveStats')}>Take damage</Btn>
            <Btn tone="solid" disabled={off} onClick={act((s) => s.recall(), hasView('Recall') ? 'Recall' : 'LiveStats')}>{c.recall}</Btn>
            <Btn tone="solid" disabled={off} onClick={act((s) => s.eliminate(), 'Alerts')}>{c.eliminate}</Btn>
            <Btn tone="solid" disabled={off} active={firing} aria-pressed={firing} onClick={toggleFiring}>Firing {firing ? 'on' : 'off'}</Btn>
            <Btn tone="solid" disabled={off} active={zone} aria-pressed={zone} onClick={toggleZone}>Outside zone {zone ? 'on' : 'off'}</Btn>
            <Btn tone="solid" disabled={off} onClick={act(() => dropAirdrop(), 'AirdropInfo', false)}>Airdrop</Btn>
            <Btn tone="solid" disabled={off} onClick={act((s) => s.rankShuffle(), 'LiveStats')}>Rank change</Btn>
          </PadGroup>

          <PadGroup label="Kill cards">
            {CARDS.map((k) => (
              <Btn key={k.id} tone="solid" disabled={off} onClick={act((s) => s.milestone(k.id), 'Dom', false)}>{k.label}</Btn>
            ))}
          </PadGroup>

          <PadGroup label="Match flow">
            <Btn tone="solid" disabled={off} onClick={act((s) => { s.matchStart(); freshMatch(); }, 'Lower', false)}>Next match</Btn>
            <Btn tone="solid" disabled={off} onClick={act((s) => { s.matchEnd(); freshMatch(); }, 'WwcdStats', false)}>{c.matchEnd}</Btn>
            <Btn tone="solid" disabled={off} onClick={act((s) => { s.reset(); freshMatch(); }, 'LiveStats')}>{c.reset}</Btn>
            <select
              className="bg-[#17181D] border border-[#24262B] px-2 py-2 text-xs font-mono text-[#F4F2EE] focus:outline-none focus:border-[#E11D2E]"
              value=""
              disabled={off}
              aria-label={c.scenarios}
              onChange={(e) => { const id = e.target.value; if (id) act((s) => { runScenario(s, id); freshMatch(); }, 'LiveStats')(); }}
            >
              <option value="">{c.scenarios}…</option>
              {SIM_SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label} · {s.hint}</option>)}
            </select>
            <select
              className="bg-[#17181D] border border-[#24262B] px-2 py-2 text-xs font-mono text-[#F4F2EE] focus:outline-none focus:border-[#E11D2E]"
              value={currentTeams}
              disabled={off}
              aria-label="Teams"
              onChange={(e) => changeTeams(Number(e.target.value))}
            >
              {Array.from(new Set([...SIM_TEAM_COUNTS, currentTeams])).filter((n) => n > 0).sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n} teams</option>)}
            </select>
          </PadGroup>

          <PadGroup label="Ranking pages">
            {RANKING_VIEWS.filter((r) => hasView(r.key)).map((r) => {
              const pages = rankingPageCount(theme, r.key, teams.length);
              return (
                <span key={r.key} className="flex flex-wrap items-center gap-1.5 mr-2">
                  <span className="text-[11px] text-[#93959C] mr-0.5">{r.label}</span>
                  <Btn tone="solid" disabled={off} active={rankingView === r.key && rankPage === null} onClick={() => showPage(r.key, null)}>Auto</Btn>
                  {Array.from({ length: pages }, (_, i) => (
                    <Btn key={i} tone="solid" disabled={off} active={rankingView === r.key && rankPage === i && pageCount > 0} onClick={() => showPage(r.key, i)}>P{i + 1}</Btn>
                  ))}
                </span>
              );
            })}
          </PadGroup>
        </div>
        <p className="mt-2 font-mono text-[10px] tracking-[0.12em] text-[#55565C]">{text.disclaimer}</p>
      </div>

      {/* Themes + overlays */}
      <aside className="bg-[#131418] border border-[#24262B] min-w-0">
        <div className="p-4 border-b border-[#24262B]">
          <div className="font-mono text-[10px] tracking-[0.18em] text-[#93959C] uppercase mb-2">{text.pickTheme.title}</div>
          <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Themes">
            {THEMES.map((t) => {
              const on = t === theme;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  title={text.pickTheme.themes?.[t]?.hint || undefined}
                  onClick={() => pickTheme(t)}
                  className={`text-left px-2 py-2 border transition-colors ${on ? 'border-[#E11D2E] bg-[#E11D2E]/10' : 'border-[#24262B] bg-[#17181D] hover:border-[#E11D2E]'}`}
                >
                  <span className="block font-display font-bold text-xs text-[#F4F2EE] uppercase truncate">{themeName(t)}</span>
                  <span className="block font-mono text-[9px] tracking-[0.1em] text-[#55565C]">{viewCount(t)} OVERLAYS</span>
                </button>
              );
            })}
          </div>
          {text.pickTheme.themes?.[theme]?.hint && <p className="mt-2 text-xs text-[#93959C] leading-snug">{text.pickTheme.themes[theme]!.hint}</p>}
        </div>

        <div className="flex border-b border-[#24262B]" role="tablist">
          {([['overlays', text.overlayTabs.web], ['desktop', text.overlayTabs.desktop], ['customise', 'Customise']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={panel === id}
              onClick={() => setPanel(id)}
              disabled={id === 'desktop' && !text.desktopTools.length}
              className={`flex-1 px-2 py-3 text-[11px] font-mono tracking-[0.08em] uppercase border-b-2 disabled:opacity-40 ${panel === id ? 'border-[#E11D2E] text-[#F4F2EE]' : 'border-transparent text-[#55565C] hover:text-[#93959C]'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 max-h-[640px] overflow-y-auto space-y-4">
          {panel === 'overlays' && groups.map((g) => (
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
          ))}

          {panel === 'desktop' && text.desktopTools.map((d) => (
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

          {panel === 'customise' && (
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
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <Field label="Round name">
                  <input className={inputCls} value={round?.roundName ?? ''} maxLength={40} onChange={(e) => edit({ roundName: e.target.value })} />
                </Field>
                <Field label="Day">
                  <input className={inputCls} value={round?.day ?? ''} maxLength={16} onChange={(e) => edit({ day: e.target.value })} />
                </Field>
              </div>
              <Field label={`Teams · ${showcase?.seed?.groupName || 'Group A'} (${teams.length})`}>
                <ul className="max-h-[260px] overflow-y-auto pr-1 space-y-1.5">
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
              </Field>
            </>
          )}
        </div>
      </aside>
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
