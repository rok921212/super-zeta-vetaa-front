// Where LIVE preview data comes from: tournament → round → match, right under
// the toolbar whenever LIVE is on (it used to live only at the bottom of the
// Document panel, which most people never found).
//
// Tournament and round are the layout's saved defaults (the published overlay
// uses them too). The match is preview-only: "Follow selected match" is what a
// published overlay does; picking one match pins the preview to it, the same
// way `/o/<id>?mode=fixedMatch&m=<matchId>` pins a published overlay.

import React from 'react';
import api from '../../login/api.tsx';
import type { LayoutDefaults } from '../api.ts';
import { CACHE_KEYS, useCached } from '../requestCache.ts';
import { Select, cx } from './ui.tsx';

export interface TournamentItem { _id: string; tournamentName?: string }
export interface RoundItem { _id: string; roundName?: string; roundNumber?: number }
export interface MatchItem { _id: string; matchNo?: number; map?: string; matchName?: string }

const list = <T,>(data: any, key: string): T[] => (Array.isArray(data) ? data : Array.isArray(data?.[key]) ? data[key] : []);

export function useTournamentList() {
  return useCached<TournamentItem[]>(CACHE_KEYS.tournaments, async () => list<TournamentItem>((await api.get('/tournaments')).data, 'tournaments'));
}

export function useRoundList(tournamentId: string | null | undefined) {
  return useCached<RoundItem[]>(tournamentId ? CACHE_KEYS.rounds(tournamentId) : null, async () =>
    list<RoundItem>((await api.get(`/tournaments/${tournamentId}/rounds`)).data, 'rounds'));
}

export function useMatchList(tournamentId: string | null | undefined, roundId: string | null | undefined) {
  return useCached<MatchItem[]>(tournamentId && roundId ? CACHE_KEYS.matches(tournamentId, roundId) : null, async () =>
    list<MatchItem>((await api.get(`/tournaments/${tournamentId}/rounds/${roundId}/matches`)).data, 'matches'));
}

export const matchLabel = (m: MatchItem) => `Match ${m.matchNo ?? '?'}${m.map ? ` · ${m.map}` : ''}`;

const FOLLOW = '__follow__';

/** Engine connection phase in plain words, and whether it is good news. */
const PHASE_TEXT: Record<string, [string, 'ok' | 'wait' | 'bad']> = {
  IDLE: ['not connected', 'wait'],
  CONNECTING: ['connecting…', 'wait'],
  HYDRATING: ['loading match data…', 'wait'],
  CONNECTED: ['connected · live', 'ok'],
  DEGRADED: ['connected via cloud (desktop relay not running)', 'ok'],
  RECONNECTING: ['reconnecting…', 'wait'],
  REHYDRATING: ['catching up…', 'wait'],
  RELAY_OFFLINE: ['relay offline — start the ScoreSync desktop app', 'bad'],
  UPSTREAM_OFFLINE: ['server unreachable — showing last data', 'bad'],
  STALE: ['no updates lately — data may be stale', 'bad'],
  DESTROYED: ['disconnected', 'bad'],
};

export function LiveSourceBar({ defaults, onDefaults, matchId, onMatch, phase, readOnly }: {
  defaults: LayoutDefaults;
  onDefaults(patch: Partial<LayoutDefaults>): void;
  /** Preview-only pinned match; null = follow the operator's selected match. */
  matchId: string | null;
  onMatch(id: string | null): void;
  /** Engine phase, shown as the connection state. */
  phase?: string;
  readOnly?: boolean;
}) {
  const tid = defaults.tournamentId;
  const rid = defaults.roundId;
  const tQuery = useTournamentList();
  const rQuery = useRoundList(tid);
  const mQuery = useMatchList(tid, rid);
  const tournaments = tQuery.data || [];
  const rounds = (tid && rQuery.data) || [];
  const matches = (tid && rid && mQuery.data) || [];
  const ready = !!(tid && rid);
  const failed = !!((tQuery.error && !tQuery.data) || (rQuery.error && !rQuery.data) || (mQuery.error && !mQuery.data));

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-red-500/20 bg-red-500/[0.06] px-4 py-1.5 text-xs text-slate-300" data-testid="live-source-bar">
      <span className="font-semibold tracking-wide text-red-300">LIVE DATA</span>
      <label className="flex items-center gap-1.5">
        <span className="text-slate-400">Tournament</span>
        <span className="w-48">
          <Select
            value={tid || undefined}
            allowEmpty={tQuery.loading && !tQuery.data ? 'Loading…' : tournaments.length ? '— pick one —' : 'No tournaments'}
            options={tournaments.map((t) => ({ value: t._id, label: t.tournamentName || t._id }))}
            onChange={(v) => { if (readOnly) return; onMatch(null); onDefaults({ tournamentId: v || null, roundId: null }); }}
          />
        </span>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-slate-400">Round</span>
        <span className="w-40">
          <Select
            value={rid || undefined}
            allowEmpty={!tid ? 'Pick a tournament first' : rQuery.loading && !rQuery.data ? 'Loading…' : rounds.length ? '— pick one —' : 'No rounds'}
            options={rounds.map((r) => ({ value: r._id, label: r.roundName || (r.roundNumber != null ? `Round ${r.roundNumber}` : r._id) }))}
            onChange={(v) => { if (readOnly) return; onMatch(null); onDefaults({ roundId: v || null }); }}
          />
        </span>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-slate-400">Match</span>
        <span className="w-48">
          <Select
            value={matchId || FOLLOW}
            options={[
              { value: FOLLOW, label: 'Follow selected match' },
              ...matches.map((m) => ({ value: m._id, label: matchLabel(m) })),
            ]}
            onChange={(v) => onMatch(!v || v === FOLLOW ? null : v)}
          />
        </span>
      </label>
      <span className={ready ? 'text-slate-400' : 'text-amber-200'}>
        {!ready
          ? 'Pick a tournament and round to connect, or switch to SIMULATION.'
          : matchId
            ? 'Preview pinned to this match (published overlays follow the selected match unless the URL pins one).'
            : 'Follows the match selected in the dashboard, like the published overlay.'}
      </span>
      {ready && phase && (
        <span
          className={cx('ml-auto text-[11px]', PHASE_TEXT[phase]?.[1] === 'ok' ? 'text-emerald-300' : PHASE_TEXT[phase]?.[1] === 'bad' ? 'text-red-300' : 'text-amber-200')}
          title={phase}
          data-testid="live-phase"
        >
          ● {PHASE_TEXT[phase]?.[0] || phase.toLowerCase()}
        </span>
      )}
      {failed && <span className="text-red-300">Could not load the list — check your connection and login.</span>}
    </div>
  );
}
