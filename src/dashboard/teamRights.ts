// Who may delete teams: admins, sub-admins, official accounts and each team's
// own creator (the server enforces the same rule, teams.controller.js
// canDeleteTeam). The flags come from the login answer; a session from before
// they existed asks /users/me once.

import { useEffect, useState } from 'react';
import api from '../login/api.tsx';
import { getOrFetch } from './cache';

interface Roles { id: string | null; isAdmin: boolean; isSubAdmin: boolean; isOfficial: boolean; known: boolean }

function stored(): Roles {
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!u) return { id: null, isAdmin: false, isSubAdmin: false, isOfficial: false, known: true };
    return {
      id: u._id ?? null,
      isAdmin: !!u.isAdmin,
      isSubAdmin: !!u.isSubAdmin,
      isOfficial: !!u.isOfficial,
      known: 'isSubAdmin' in u && 'isOfficial' in u,
    };
  } catch {
    return { id: null, isAdmin: false, isSubAdmin: false, isOfficial: false, known: true };
  }
}

/** `canDelete(team.createdBy)` for the signed-in account. */
export function useTeamDeleteRights(): (createdBy?: string | null) => boolean {
  const [roles, setRoles] = useState<Roles>(stored);

  useEffect(() => {
    if (roles.known || !roles.id) return;
    let live = true;
    getOrFetch(`me:roles:${roles.id}`, () => api.get('/users/me').then(r => r.data), { maxAge: 10 * 60_000, storage: 'session' })
      .then((me: any) => {
        if (!live || !me) return;
        const next = { ...roles, isAdmin: !!me.isAdmin, isSubAdmin: !!me.isSubAdmin, isOfficial: !!me.isOfficial, known: true };
        setRoles(next);
        try {
          const u = JSON.parse(localStorage.getItem('user') || 'null');
          if (u && u._id === roles.id) localStorage.setItem('user', JSON.stringify({ ...u, isSubAdmin: next.isSubAdmin, isOfficial: next.isOfficial }));
        } catch { /* storage unavailable */ }
      })
      .catch(() => {});
    return () => { live = false; };
  }, [roles]);

  const elevated = roles.isAdmin || roles.isSubAdmin || roles.isOfficial;
  return (createdBy) => elevated || (!!createdBy && !!roles.id && String(createdBy) === String(roles.id));
}
