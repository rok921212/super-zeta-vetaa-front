import React, { useState, useRef, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaTrophy, FaUsers, FaEye, FaDiscord, FaBars, FaTimes, FaSignOutAlt, FaDatabase, FaCheck, FaChevronRight } from 'react-icons/fa';
import api from '../login/api.tsx';
import { removeCache } from './cache';
import SocketManager from './socketManager';
import PollingManager, { stopAllPolling } from './isPolling.tsx';

// Shared top nav bar for every dashboard sub-page except page.tsx (which
// keeps its own full nav + identity-gated logout — see that file). This
// component is fully self-contained (own <style> block, own `nb-` class
// prefix, literal hex colors) so it drops into a CSS-in-JS host page or a
// Tailwind host page (matchDataController.tsx) identically.
//
// None of these pages need to know WHO is logged in any more — the old
// per-page `/users/me` calls existed only to show a username chip here.
// That's replaced with a Logout button that doesn't depend on any identity
// having been fetched first.

const NAVBAR_STYLES = `
.nb-nav { position: sticky; top: 0; z-index: 60; background: rgba(11,12,14,0.96); border-bottom: 1px solid #24262B; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
.nb-nav * { box-sizing: border-box; }
.nb-nav-inner { max-width: 1280px; margin: 0 auto; padding: 0 20px; display: flex; align-items: center; height: 64px; gap: 18px; }
.nb-nav-brand { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.nb-nav-brand-text { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif; font-size: 14px; font-weight: 700; color: #F4F2EE; letter-spacing: 0.02em; white-space: nowrap; }
.nb-crumbs { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; }
.nb-crumb-sep { color: #55565C; font-size: 10px; flex-shrink: 0; }
.nb-crumb { background: none; border: none; padding: 0; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; color: #93959C; cursor: pointer; white-space: nowrap; }
.nb-crumb.static { cursor: default; }
.nb-crumb:hover:not(.static) { color: #E11D2E; }
.nb-nav-links { display: flex; align-items: center; gap: 4px; }
.nb-nav-link { display: flex; align-items: center; gap: 8px; padding: 8px 14px; color: #93959C; text-decoration: none; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; border: 1px solid transparent; background: none; white-space: nowrap; }
.nb-nav-link:hover { color: #F4F2EE; }
.nb-nav-link.active { color: #E11D2E; border-bottom: 2px solid #E11D2E; padding-bottom: 6px; }
.nb-nav-right { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.nb-fetch-btn { display: flex; align-items: center; gap: 7px; padding: 8px 13px; background: transparent; border: 1px solid #24262B; color: #93959C; font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600; cursor: pointer; }
.nb-fetch-btn:hover { border-color: #5B9FE0; color: #5B9FE0; }
.nb-fetch-btn:disabled { cursor: wait; opacity: 0.7; }
.nb-fetch-btn.fetching { border-color: #5B9FE0; color: #5B9FE0; }
.nb-fetch-btn.nb-save-ok { border-color: #4ADE80; color: #4ADE80; }
.nb-fetch-btn.nb-save-error { border-color: #E11D2E; color: #E11D2E; }
.nb-sync-spin { animation: nb-spin 0.8s linear infinite; }
@keyframes nb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.nb-logout-btn { display: flex; align-items: center; gap: 7px; padding: 8px 13px; background: transparent; border: 1px solid #24262B; color: #93959C; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; }
.nb-logout-btn:hover { border-color: #E11D2E; color: #E11D2E; }
.nb-nav-burger { display: none; background: none; border: 1px solid #24262B; color: #F4F2EE; width: 38px; height: 38px; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
.nb-nav-mobile-panel { display: none; flex-direction: column; padding: 10px 20px 16px; gap: 2px; border-bottom: 1px solid #24262B; background: #0B0C0E; }
.nb-nav-mobile-panel.open { display: flex; }
@media (max-width: 900px) {
  .nb-crumbs { display: none; }
  .nb-nav-links { display: none; }
  .nb-nav-burger { display: flex; }
}
.nb-toast-wrap { position: fixed; right: 24px; bottom: 24px; z-index: 300; display: flex; justify-content: flex-end; pointer-events: none; }
.nb-toast { pointer-events: auto; display: flex; align-items: center; gap: 10px; max-width: min(92vw, 420px); background: #131418; border: 1px solid rgba(74,222,128,0.4); padding: 13px 18px; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-size: 13px; font-weight: 600; color: #F4F2EE; box-shadow: 0 8px 24px rgba(0,0,0,0.4); animation: nb-toast-in 0.18s ease-out; }
.nb-toast.nb-toast-empty { border-color: #24262B; }
.nb-toast.nb-toast-error { border-color: rgba(225,29,46,0.5); }
.nb-toast-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ADE80; flex-shrink: 0; box-shadow: 0 0 6px rgba(74,222,128,0.6); }
.nb-toast.nb-toast-empty .nb-toast-dot { background: #93959C; box-shadow: none; }
.nb-toast.nb-toast-error .nb-toast-dot { background: #E11D2E; box-shadow: 0 0 6px rgba(225,29,46,0.6); }
@keyframes nb-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
`;

type SaveToastKind = 'saved' | 'empty' | 'error';

// Every meaningful SAVE DATA outcome raises the bottom-right toast.
// (Flip to ['saved'] for success-only.)
const SAVE_TOAST_ON: SaveToastKind[] = ['saved', 'empty', 'error'];

const SAVE_TOAST_MSG: Record<SaveToastKind, string> = {
  saved: "Data saved — full snapshot of every live team written to the database.",
  empty: 'Nothing to save yet — no live match data is streaming for this match.',
  error: "Save failed — the snapshot wasn't written. Check your connection and try again.",
};

// Shared by the in-button label revert AND the toast auto-dismiss so they clear together.
const SAVE_FEEDBACK_MS = 2500;

interface BreadcrumbSegment {
  label: string;
  onClick?: () => void;
}

interface NavbarProps {
  active: 'tournaments' | 'teams' | 'hud' | 'none';
  brandText: string;
  breadcrumb?: BreadcrumbSegment[];
  // Forwarded straight to PollingManager. PollingManager + the "Fetch Data"
  // button only render when BOTH tournamentId and roundId are given —
  // showing them with no round in view (Round.tsx lists many rounds,
  // MainTeams.tsx has no tournament context at all) would be meaningless.
  tournamentId?: string;
  roundId?: string;
  // Optional explicit match to snapshot when "SAVE DATA" is pressed. When
  // omitted (the MATCH DATA / MATCH SCHEDULE pages don't have a single match
  // in view) the backend resolves the round's currently-selected match.
  matchId?: string;
  matchLabel?: string;
  refreshSignal?: number;
}

const Navbar: React.FC<NavbarProps> = memo(({
  active,
  brandText,
  breadcrumb,
  tournamentId,
  roundId,
  matchId,
  matchLabel,
  refreshSignal,
}) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // "SAVE DATA" — one immediate POST that persists the current live socket
  // state to MongoDB. Not a finalization; the game keeps running. Single-flight
  // guard lives on a ref (not state) so a rapid double-click can't slip past
  // it before React commits the 'saving' state update — checking `saveState`
  // directly here reads a stale closure value and lets two requests overlap,
  // which can leave the button stuck showing "SAVING..." if their resolutions
  // interleave badly.
  type SaveState = 'idle' | 'saving' | 'saved' | 'empty' | 'error';
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const savingRef = useRef(false);
  const revertRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const [toast, setToast] = useState<{ kind: SaveToastKind; msg: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), SAVE_FEEDBACK_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (revertRef.current) window.clearTimeout(revertRef.current);
    };
  }, []);

  // Bottom-right confirmation toast for SAVE DATA. Additive — the in-button
  // label (SAVED / NO LIVE DATA / SAVE FAILED) is unchanged.
  const showSaveToast = (kind: SaveState) => {
    if ((kind === 'saved' || kind === 'empty' || kind === 'error') && SAVE_TOAST_ON.includes(kind)) {
      setToast({ kind, msg: SAVE_TOAST_MSG[kind] });
    }
  };

  const handleSaveData = async () => {
    if (savingRef.current || !tournamentId || !roundId) return;
    savingRef.current = true;
    setSaveState('saving');
    try {
      const res = await api.post('/match/save-current', {
        tournamentId,
        roundId,
        ...(matchId ? { matchId } : {}),
      });
      if (!mountedRef.current) return;
      const next: SaveState =
        res.data?.success ? (res.data.saved ? 'saved' : 'empty') : 'error';
      setSaveState(next);
      showSaveToast(next);
    } catch {
      if (!mountedRef.current) return;
      setSaveState('error');
      showSaveToast('error');
    } finally {
      savingRef.current = false;
      if (mountedRef.current) {
        if (revertRef.current) window.clearTimeout(revertRef.current);
        revertRef.current = window.setTimeout(() => {
          if (mountedRef.current) setSaveState('idle');
        }, SAVE_FEEDBACK_MS);
      }
    }
  };

  const links = [
    { key: 'tournaments', label: 'TOURNAMENTS', icon: <FaTrophy size={13} />, onClick: () => (window.location.href = '/dashboard') },
    { key: 'teams', label: 'TEAMS', icon: <FaUsers size={13} />, onClick: () => (window.location.href = '/teams') },
    { key: 'hud', label: 'HUD', icon: <FaEye size={13} />, onClick: () => (window.location.href = '/displayhud') },
    { key: 'help', label: 'HELP', icon: <FaDiscord size={13} />, onClick: () => window.open('https://discord.com/channels/623776491682922526/1426117227257663558', '_blank') },
  ];

  const showPolling = !!(tournamentId && roundId);

  const handleLogout = async () => {
    await stopAllPolling();
    try { await api.post('/users/logout'); } catch { /* proceed with client-side cleanup regardless */ }
    removeCache('auth_user');
    localStorage.removeItem('user');
    SocketManager.getInstance().updateAuthToken(null);
    SocketManager.getInstance().forceDisconnect();
    navigate('/login');
  };

  return (
    <nav className="nb-nav">
      <style>{NAVBAR_STYLES}</style>
      <div className="nb-nav-inner">
        <div className="nb-nav-brand">
          <img src="/logo.avif" alt="logo" style={{ width: 30, height: 30, objectFit: 'contain' }} />
          <span className="nb-nav-brand-text">{brandText}</span>
        </div>

        {!!breadcrumb?.length && (
          <div className="nb-crumbs">
            {breadcrumb.map((crumb, i) => (
              <React.Fragment key={i}>
                <FaChevronRight className="nb-crumb-sep" />
                <button
                  className={`nb-crumb ${crumb.onClick ? '' : 'static'}`}
                  onClick={crumb.onClick}
                  disabled={!crumb.onClick}
                >
                  {crumb.label}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="nb-nav-links">
          {links.map(link => (
            <button key={link.key} className={`nb-nav-link ${active === link.key ? 'active' : ''}`} onClick={link.onClick}>
              {link.icon} {link.label}
            </button>
          ))}
        </div>

        <div className="nb-nav-right">
          {showPolling && (
            <>
              <PollingManager
                tournamentId={tournamentId}
                roundId={roundId}
                matchLabel={matchLabel}
                refreshSignal={refreshSignal}
              />
              <button
                className={`nb-fetch-btn ${saveState === 'saving' ? 'fetching' : ''} ${saveState === 'saved' ? 'nb-save-ok' : ''} ${saveState === 'error' ? 'nb-save-error' : ''}`}
                onClick={handleSaveData}
                disabled={saveState === 'saving'}
                title="Save the current live match state to the database (does not stop the game)"
              >
                {saveState === 'saved'
                  ? <FaCheck size={11} />
                  : <FaDatabase size={11} className={saveState === 'saving' ? 'nb-sync-spin' : ''} />}
                {{
                  idle: 'SAVE DATA',
                  saving: 'SAVING...',
                  saved: 'SAVED',
                  empty: 'NO LIVE DATA',
                  error: 'SAVE FAILED',
                }[saveState]}
              </button>
            </>
          )}
          <button className="nb-logout-btn" onClick={handleLogout}>
            <FaSignOutAlt size={12} /> LOGOUT
          </button>
          <button className="nb-nav-burger" onClick={() => setOpen(v => !v)} aria-label="Toggle menu">
            {open ? <FaTimes size={15} /> : <FaBars size={15} />}
          </button>
        </div>
      </div>

      <div className={`nb-nav-mobile-panel ${open ? 'open' : ''}`}>
        {breadcrumb?.map((crumb, i) => (
          <button
            key={`crumb-${i}`}
            className="nb-nav-link"
            style={{ justifyContent: 'flex-start', padding: '10px 8px', borderBottom: 'none' }}
            onClick={() => { crumb.onClick?.(); setOpen(false); }}
            disabled={!crumb.onClick}
          >
            {crumb.label}
          </button>
        ))}
        {links.map(link => (
          <button
            key={link.key}
            className={`nb-nav-link ${active === link.key ? 'active' : ''}`}
            style={{ justifyContent: 'flex-start', padding: '12px 8px', borderBottom: 'none' }}
            onClick={() => { link.onClick?.(); setOpen(false); }}
          >
            {link.icon} {link.label}
          </button>
        ))}
      </div>

      {toast && (
        <div className="nb-toast-wrap">
          <div
            className={`nb-toast${toast.kind === 'empty' ? ' nb-toast-empty' : ''}${toast.kind === 'error' ? ' nb-toast-error' : ''}`}
            role="status"
            aria-live="polite"
          >
            <span className="nb-toast-dot" />
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </nav>
  );
});

export default Navbar;