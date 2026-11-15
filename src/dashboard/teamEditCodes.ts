// Event codes of a tournament's teams (backend publicTeams.controller.js).
// Owner only. The Groups page shows a copy button per team; the code itself is
// never shown on screen. Each team uses its code on the public team page
// (/team-update) to send changes for the owner to approve.

import { useCallback, useEffect, useState } from 'react';
import api from '../login/api.tsx';

export function useTeamEditCodes(tournamentId: string | undefined, groupsKey: string) {
  const [codes, setCodes] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const { data } = await api.get(`/team-edit-codes/${tournamentId}`);
      const m = new Map<string, string>();
      for (const c of data?.codes || []) m.set(String(c.teamId), String(c.code));
      setCodes(m);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.status === 404 ? 'Event codes need the latest backend.' : 'Could not load event codes.');
    }
  }, [tournamentId]);

  // Again whenever the groups' teams change: new teams get their codes.
  useEffect(() => { void load(); }, [load, groupsKey]);

  const regenerate = useCallback(async (teamId: string) => {
    if (!tournamentId) return;
    const { data } = await api.post(`/team-edit-codes/${tournamentId}/${teamId}/regenerate`);
    setCodes(prev => new Map(prev).set(String(data.teamId), String(data.code)));
  }, [tournamentId]);

  return { codes, error, regenerate };
}

/** The public page a team uses with its code. */
export const teamUpdateUrl = () => `${window.location.origin}/team-update`;
