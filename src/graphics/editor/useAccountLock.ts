// The account lock as the Designer sees it (backend services/directorLock.js):
// one password locks the desktop Auto Switcher and, when an admin lets it
// cover the Designer, makes the Designer view-only (every write is a 423
// ACCOUNT_LOCKED from middleware/requireDesignerUnlocked.js).
//
// State comes from GET /api/director-lock: on mount, when the tab regains
// focus, every 30 s, and whenever a write came back ACCOUNT_LOCKED
// (LockedError in ../api.ts fires `accountlock:refresh`). All mounted users
// share one state through a window event.

import { useCallback, useEffect, useState } from 'react';
import api from '../../login/api.tsx';

export interface AccountLockState {
  /** The Designer is view-only right now. */
  designerLocked: boolean;
  /** The account lock is on (it may cover only the Auto Switcher). */
  accountLocked: boolean;
  /** The server has a password to check against. */
  available: boolean;
  loaded: boolean;
}

const EMPTY: AccountLockState = { designerLocked: false, accountLocked: false, available: false, loaded: false };
const EVT = 'accountlock:update';
const REFRESH_EVT = 'accountlock:refresh';
const POLL_MS = 30_000;

let last: AccountLockState = EMPTY;

const fromServer = (d: any): AccountLockState => ({
  designerLocked: !!d?.designerLocked,
  accountLocked: !!(d?.accountLocked ?? d?.locked),
  available: !!d?.available,
  loaded: true,
});

function publish(s: AccountLockState) {
  last = s;
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: s })); } catch { /* non-DOM */ }
}

let inFlight: Promise<void> | null = null;
export function refreshAccountLock(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = api.get('/director-lock')
    .then((r) => publish(fromServer(r.data)))
    .catch(() => { /* offline / older backend: keep what we had */ })
    .finally(() => { inFlight = null; });
  return inFlight;
}

const errorOf = (e: any) => e?.response?.data?.message || e?.message || 'Request failed';

export function useAccountLock() {
  const [state, setState] = useState<AccountLockState>(last);

  useEffect(() => {
    const onUpdate = (e: Event) => setState((e as CustomEvent).detail as AccountLockState);
    const onRefresh = () => { refreshAccountLock(); };
    const onFocus = () => { if (document.visibilityState !== 'hidden') refreshAccountLock(); };
    window.addEventListener(EVT, onUpdate);
    window.addEventListener(REFRESH_EVT, onRefresh);
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(onFocus, POLL_MS);
    refreshAccountLock();
    return () => {
      window.removeEventListener(EVT, onUpdate);
      window.removeEventListener(REFRESH_EVT, onRefresh);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, []);

  /** Lock or unlock with the account lock password. Resolves to an error message, or null on success. */
  const setLocked = useCallback(async (locked: boolean, password: string): Promise<string | null> => {
    try {
      const r = await api.post(`/director-lock/${locked ? 'lock' : 'unlock'}`, { password });
      publish(fromServer(r.data));
      return null;
    } catch (e) {
      return errorOf(e);
    }
  }, []);

  return { ...state, setLocked };
}
