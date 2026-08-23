import React, { useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaTrophy, FaUsers, FaEye, FaDiscord, FaBars, FaTimes, FaSignOutAlt, FaSync, FaChevronRight } from 'react-icons/fa';
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
`;

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
  matchLabel?: string;
  refreshSignal?: number;
  onFetchData?: () => void;
}

const Navbar: React.FC<NavbarProps> = memo(({
  active,
  brandText,
  breadcrumb,
  tournamentId,
  roundId,
  matchLabel,
  refreshSignal,
  onFetchData,
}) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

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
              <PollingManager tournamentId={tournamentId} roundId={roundId} matchLabel={matchLabel} refreshSignal={refreshSignal} />
              <button className="nb-fetch-btn" onClick={onFetchData} title="Refresh live polling/match status">
                <FaSync size={11} /> FETCH DATA
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
    </nav>
  );
});

export default Navbar;
