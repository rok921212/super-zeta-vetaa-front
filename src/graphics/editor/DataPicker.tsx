// Binding path picker: a browsable tree generated from the CURRENT engine
// state (live or simulation), with live values. Inside a repeater it starts
// at `item.*` (the first item); inside an event-driven element at `event.*`.

import React, { useMemo, useState } from 'react';
import type { BindingScope } from '../bindings/index.ts';
import { resolvePathDetailed } from '../bindings/index.ts';
import { isSafePath } from '../schema/layoutSchema.js';
import { cx } from './ui.tsx';

const ROOT_ORDER: Array<keyof BindingScope> = [
  'item', 'rank', 'index', 'parent', 'event', 'live', 'feed', 'local', 'derived', 'match', 'matchData', 'tournament', 'round', 'matches',
  'deadTeamList', 'overallData', 'matchDatas', 'status', 'theme', 'variables', 'brand',
];

/** One-click shortcuts to the values built-in themes show most (see bindings/live.ts). */
export const COMMON_DATA: Array<{ label: string; path: string }> = [
  { label: 'Tournament name', path: 'tournament.tournamentName' },
  { label: 'Round name', path: 'round.roundName' },
  { label: 'Match number', path: 'match.matchNo' },
  { label: 'Map', path: 'live.mapName' },
  { label: 'Teams alive', path: 'live.aliveTeamsCount' },
  { label: 'Players alive', path: 'live.alivePlayersCount' },
  { label: 'Total kills', path: 'live.totalKills' },
  { label: 'Kill leader', path: 'live.killLeader.playerName' },
  { label: 'Kill leader kills', path: 'live.killLeader.killNum' },
  { label: 'Top team', path: 'live.topTeam.teamName' },
  { label: 'Last eliminated team', path: 'live.lastEliminated.teamName' },
  { label: 'Last kill: player', path: 'feed.kills[0].player.playerName' },
  { label: 'Last kill: team', path: 'feed.kills[0].teamTag' },
  { label: 'Last recall: player', path: 'feed.recalls[0].playerName' },
  { label: 'Last elimination: team', path: 'feed.eliminations[0].teamName' },
  { label: 'Recall map?', path: 'live.isRecallMap' },
  // Desktop app tools (local game feed)
  { label: 'Desktop: observed player', path: 'local.observed.playerName' },
  { label: 'Desktop: observed team', path: 'local.observedTeam.teamName' },
  { label: 'Desktop: observed health %', path: 'local.observed.healthPct' },
  { label: 'Desktop: zone time left', path: 'local.zone.timeLeft' },
  { label: 'Desktop: zone status', path: 'local.zone.statusLabel' },
  { label: 'Desktop: players alive', path: 'local.counts.alivePlayers' },
  { label: 'Desktop: teams alive', path: 'local.counts.aliveTeams' },
];

// Keys that are noise for a designer (ids, protobuf bookkeeping, positions).
const HIDDEN_KEYS = new Set(['__v', 'userId', 'createdAt', 'updatedAt', 'location', 'playerOpenId', 'showPicUrl', 'latestPlayerRaw']);

const preview = (v: unknown): string => {
  if (v === null) return 'null';
  if (v === undefined) return '—';
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === 'object') return '{…}';
  const s = String(v);
  return s.length > 28 ? `${s.slice(0, 28)}…` : s;
};

function Node({ path, value, depth, onPick, selectedPath }: { path: string; value: unknown; depth: number; onPick(p: string): void; selectedPath?: string }) {
  const [open, setOpen] = useState(depth < 1 && (path === 'item' || path === 'event'));
  const isObj = value !== null && typeof value === 'object';
  const label = path.split(/\.(?![^[]*\])/).pop()!.replace(/^.*(\[\d+\])$/, '$1');
  const children = useMemo(() => {
    if (!open || !isObj) return [];
    if (Array.isArray(value)) {
      const out: Array<[string, unknown]> = [[`${path}.length`, value.length]];
      value.slice(0, 20).forEach((v, i) => out.push([`${path}[${i}]`, v]));
      return out;
    }
    return Object.keys(value as object)
      .filter((k) => !HIDDEN_KEYS.has(k) && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k))
      .sort()
      .map((k) => [`${path}.${k}`, (value as any)[k]] as [string, unknown]);
  }, [open, isObj, value, path]);

  return (
    <div>
      <div
        className={cx(
          'flex cursor-pointer items-center gap-1 rounded px-1 py-[1px] text-[11px] hover:bg-white/5',
          selectedPath === path && 'bg-amber-400/15 text-amber-200'
        )}
        style={{ paddingLeft: 4 + depth * 12 }}
        onClick={() => (isObj ? setOpen(!open) : onPick(path))}
        onDoubleClick={() => onPick(path)}
      >
        <span className="w-3 text-slate-500">{isObj ? (open ? '▾' : '▸') : ''}</span>
        <span className="text-slate-200">{label}</span>
        <span className="ml-auto truncate pl-2 font-mono text-[10px] text-slate-500">{preview(value)}</span>
        {!isObj && <span className="text-[10px] text-amber-300/70">use</span>}
      </div>
      {children.map(([p, v]) => (
        <Node key={p} path={p} value={v} depth={depth + 1} onPick={onPick} selectedPath={selectedPath} />
      ))}
    </div>
  );
}

export function DataPicker({ scope, value, onPick, onClose }: { scope: BindingScope; value?: string; onPick(path: string): void; onClose(): void }) {
  const [typed, setTyped] = useState(value || '');
  const typedCheck = typed ? resolvePathDetailed(scope, typed) : null;
  const roots = ROOT_ORDER.filter((k) => scope[k] !== undefined);
  return (
    <div className="flex max-h-[420px] flex-col rounded border border-white/10 bg-neutral-950 shadow-xl">
      <div className="flex items-center gap-2 border-b border-white/5 p-2">
        <input
          autoFocus
          className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-slate-100 outline-none focus:border-amber-400/60"
          placeholder="derived.teams[0].teamName"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && isSafePath(typed)) onPick(typed);
            if (e.key === 'Escape') onClose();
          }}
        />
        <button type="button" className="text-[11px] text-slate-400 hover:text-slate-100" onClick={onClose}>✕</button>
      </div>
      {typed && (
        <div className={cx('px-2 py-1 text-[10px]', !isSafePath(typed) ? 'text-red-300' : typedCheck?.found ? 'text-emerald-300' : 'text-amber-300')}>
          {!isSafePath(typed) ? 'Not an allowed path' : typedCheck?.found ? `= ${preview(typedCheck.value)}  (Enter to use)` : 'Path not present in the current data (Enter to use anyway)'}
        </div>
      )}
      {!typed && (
        <div className="border-b border-white/5 p-1.5" data-testid="common-data">
          <div className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Common data</div>
          <div className="flex flex-wrap gap-1">
            {COMMON_DATA.map((c) => {
              const r = resolvePathDetailed(scope, c.path);
              return (
                <button
                  key={c.path}
                  type="button"
                  title={`${c.path} = ${preview(r.value)}`}
                  onClick={() => onPick(c.path)}
                  className={cx('rounded border px-1.5 py-[1px] text-[10px]', r.found ? 'border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10' : 'border-white/10 text-slate-400 hover:bg-white/5')}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="overflow-auto p-1">
        {roots.map((k) => (
          <Node key={k} path={k} value={scope[k]} depth={0} onPick={onPick} selectedPath={value} />
        ))}
      </div>
    </div>
  );
}
