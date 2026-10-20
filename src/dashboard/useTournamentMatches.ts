import { useEffect, useState } from 'react';
import api from '../login/api';
import { getOrFetch } from './cache';

// Every match of a tournament as a pick-list (screenshot import's UID source,
// COPY ROSTER's source match), ordered round by round then by match number.
// Same session-cached endpoints DisplayHud's match picker reads.

export interface MatchOption {
  _id: string;
  roundId: string;
  roundName: string;
  matchNo: number;
  label: string;
}

export function useTournamentMatches(tournamentId?: string, excludeMatchId?: string) {
  const [options, setOptions] = useState<MatchOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tournamentId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getOrFetch(`cache:v1:rounds:${tournamentId}`, () => api.get(`/tournaments/${tournamentId}/rounds`).then(r => r.data), { maxAge: 90 * 1000, storage: 'session' }),
      getOrFetch(`cache:v1:matches:${tournamentId}:all`, () => api.get(`/tournaments/${tournamentId}/matches`).then(r => r.data), { maxAge: 90 * 1000, storage: 'session' }),
    ])
      .then(([rounds, matches]: [any, any]) => {
        if (cancelled) return;
        const roundList: any[] = Array.isArray(rounds) ? rounds : [];
        // Rounds come back newest first; list them oldest first.
        const roundOrder = new Map<string, { index: number; name: string }>();
        [...roundList].reverse().forEach((r, i) => roundOrder.set(String(r._id), { index: i, name: r.roundName || `Round ${i + 1}` }));
        const list: MatchOption[] = (Array.isArray(matches) ? matches : [])
          .filter((m: any) => String(m._id) !== String(excludeMatchId))
          .map((m: any) => {
            const roundId = String(m.roundId?._id || m.roundId);
            const round = roundOrder.get(roundId);
            const roundName = round?.name || 'Round';
            return { _id: String(m._id), roundId, roundName, matchNo: Number(m.matchNo) || 0, label: `${roundName} · Match ${m.matchNo}` };
          })
          .sort((a: MatchOption, b: MatchOption) =>
            (roundOrder.get(a.roundId)?.index ?? 999) - (roundOrder.get(b.roundId)?.index ?? 999) || a.matchNo - b.matchNo);
        setOptions(list);
      })
      .catch(() => { if (!cancelled) setOptions([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tournamentId, excludeMatchId]);

  return { options, loading };
}
