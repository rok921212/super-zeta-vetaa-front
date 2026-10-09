import React, { useEffect, useState, useCallback, useMemo, useRef, useTransition, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { decode } from '@msgpack/msgpack';
import api, { RELAY_ORIGIN } from '../login/api.tsx';
import { socket } from './socket.tsx';
import { getOrFetch, clearCacheByPrefix } from './cache';
import Navbar from './Navbar';
import { VIEW_GROUPS, CUSTOM_VIEWS } from './overlayViews.ts';
import { themesApi, overlayUrl as layoutOverlayUrl, type CustomTheme } from '../graphics/api.ts';
import { ImportThemeDialog } from '../graphics/editor/ImportThemeDialog.tsx';
import { parseOverlaySync, type OverlaySyncTarget } from './overlaySync.ts';
import { rankingPageCount, type RankingView } from '../Themes/shared/hooks/rankingPager.ts';
import {
  FaSearch,
  FaBroadcastTower, FaCalendarAlt, FaExternalLinkAlt, FaCheckCircle, FaPencilRuler, FaLink, FaCheck, FaFileImport,
} from 'react-icons/fa';

interface Tournament { _id: string; tournamentName: string; }
interface Round       { _id: string; roundName: string; }
interface Match       { _id: string; matchName?: string; matchNo?: number; _matchNo?: number; }

// PublicThemeRenderer's component registry is auto-discovered from
// Themes/ThemeN folders, so Theme2 works the moment that folder has
// matching on-screen/off-screen files — no renderer changes needed here.
// Any view Theme2 doesn't implement yet will show the "not available"
// placeholder instead of crashing, same as any other theme.
const THEMES = ['Theme1', 'Theme2', 'Theme3', 'Theme4', 'Theme5', 'Theme6','Theme7','Theme8'];

// Overlay views (tiles) live in ./overlayViews.ts, shared with the Designer.

// ── Design system ────────────────────────────────────────────────────────────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

.hd-root * { box-sizing: border-box; }
.hd-root { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
.hd-orb { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif !important; }
.hd-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

.hd-glow {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background: radial-gradient(ellipse 80% 40% at 50% 0%, rgba(225,29,46,0.07), transparent);
}

@keyframes hd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
.hd-dot { animation: hd-pulse 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .hd-dot { animation: none; } }

.hd-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #93959C; letter-spacing: 0.22em; text-transform: uppercase; }
.hd-eyebrow-dot { width: 6px; height: 6px; background: #E11D2E; flex-shrink: 0; }
.hd-pill { display: inline-flex; align-items: center; background: rgba(225,29,46,0.08); border: 1px solid rgba(225,29,46,0.3); color: #E11D2E; font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 3px 9px; letter-spacing: 0.05em; font-weight: 700; }

.hd-page { max-width: 1000px; margin: 0 auto; padding: 36px 20px 72px; position: relative; z-index: 1; }
.hd-header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 30px; flex-wrap: wrap; }
.hd-status-row { display: flex; gap: 10px; flex-wrap: wrap; }
.hd-status { display: flex; align-items: center; gap: 7px; background: #131418; border: 1px solid #24262B; padding: 8px 14px; }
.hd-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

.hd-api-banner { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 18px; padding: 6px 10px 6px 8px; background: #E11D2E; border: 1px solid #E11D2E; color: #fff; cursor: pointer; transition: background .15s ease, transform .1s ease; font-family: inherit; }
.hd-api-banner:hover { background: #c8172a; }
.hd-api-banner:active { transform: scale(0.98); }
.hd-api-banner-left { display: flex; align-items: center; gap: 6px; min-width: 0; }
.hd-api-banner-dot { width: 6px; height: 6px; border-radius: 50%; background: #fff; flex-shrink: 0; }
.hd-api-banner-text { min-width: 0; display: flex; align-items: baseline; gap: 6px; }
.hd-api-banner-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.8; flex-shrink: 0; }
.hd-api-banner-name { font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
.hd-api-banner-cta { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; white-space: nowrap; flex-shrink: 0; padding-left: 6px; border-left: 1px solid rgba(255,255,255,0.35); }

.hd-step { display: flex; gap: 16px; margin-bottom: 14px; }
.hd-step-num-wrap { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; width: 34px; }
.hd-step-num { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700; border: 1px solid #24262B; background: #131418; color: #55565C; flex-shrink: 0; }
.hd-step-num.done { border-color: #E11D2E; color: #E11D2E; background: rgba(225,29,46,0.08); }
.hd-step-line { flex: 1; width: 1px; background: #24262B; margin: 6px 0; }
.hd-step-body { flex: 1; min-width: 0; padding-bottom: 26px; }
.hd-step-card { background: #131418; border: 1px solid #24262B; padding: 18px 20px; transition: border-color .15s ease, opacity .15s ease; }
.hd-step-card.locked { opacity: 0.45; pointer-events: none; }
.hd-step-title { font-family: 'Space Grotesk', sans-serif; font-size: 15px; font-weight: 700; color: #F4F2EE; text-transform: uppercase; letter-spacing: 0.01em; }
.hd-step-sub { font-size: 13px; color: #93959C; margin-top: 3px; }

.hd-search-wrap { position: relative; margin-top: 14px; max-width: 320px; }
.hd-search-ic { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #55565C; font-size: 12px; pointer-events: none; }
.hd-search-input { width: 100%; padding: 10px 13px 10px 34px; background: #0B0C0E; border: 1px solid #24262B; color: #F4F2EE; font-family: 'Inter', sans-serif; font-size: 13px; outline: none; transition: border-color .15s ease; }
.hd-search-input::placeholder { color: #55565C; }
.hd-search-input:focus { border-color: #E11D2E; }
.hd-search-count { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #55565C; margin-top: 6px; }

.hd-select-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
@media (max-width: 560px) { .hd-select-row { grid-template-columns: 1fr; } }
.hd-field-label { display: flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #55565C; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 6px; }
.hd-select { width: 100%; padding: 11px 13px; background: #0B0C0E; border: 1px solid #24262B; color: #F4F2EE; font-family: 'Inter', sans-serif; font-size: 14px; outline: none; cursor: pointer; transition: border-color .15s ease; appearance: none; }
.hd-select:focus { border-color: #E11D2E; }
.hd-select:disabled { color: #55565C; cursor: not-allowed; }

.hd-chip-group { margin-top: 14px; }
.hd-chip-hdr { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; }
.hd-chip-hdr-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
.hd-chip-hdr-sub { font-size: 12px; color: #55565C; }
.hd-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.hd-chip { padding: 8px 16px; border-radius: 3px; cursor: pointer; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; border: 1px solid #24262B; color: #93959C; background: #0B0C0E; transition: all .12s ease; user-select: none; }
.hd-chip:hover { border-color: rgba(225,29,46,0.4); color: #F4F2EE; }
.hd-chip.on-live { background: rgba(74,222,128,0.1); border-color: #4ADE80; color: #4ADE80; }
.hd-chip.on-sched { background: rgba(225,29,46,0.1); border-color: #E11D2E; color: #E11D2E; }

.hd-theme-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
.hd-theme-btn { padding: 9px 16px; border: 1px solid #24262B; background: #0B0C0E; color: #93959C; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; cursor: pointer; transition: all .12s ease; }
.hd-theme-btn:hover { color: #F4F2EE; border-color: rgba(225,29,46,0.4); }
.hd-theme-btn.on { background: rgba(225,29,46,0.1); border-color: #E11D2E; color: #E11D2E; }

.hd-group { margin-bottom: 18px; }
.hd-group:last-child { margin-bottom: 0; }
.hd-group-hdr { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.hd-group-label { font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 700; color: #F4F2EE; text-transform: uppercase; }
.hd-group-hint { font-size: 11px; color: #55565C; }
.hd-tiles { display: flex; flex-wrap: wrap; gap: 6px; }
.hd-tile { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #0B0C0E; border: 1px solid #24262B; cursor: pointer; user-select: none; transition: border-color .12s ease, transform .1s ease; }
.hd-tile:hover { border-color: #E11D2E; transform: translateY(-1px); }
.hd-tile:active { transform: scale(0.97); }
.hd-tile-label { font-size: 13px; font-weight: 600; color: #F4F2EE; }
.hd-tile-ic { color: #55565C; font-size: 10px; }
.hd-tile:hover .hd-tile-ic { color: #E11D2E; }

.hd-note { display: flex; align-items: center; gap: 8px; margin-top: 14px; padding: 10px 13px; background: rgba(225,29,46,0.06); border: 1px solid rgba(225,29,46,0.2); font-size: 12px; color: #93959C; }
.hd-empty { text-align: center; padding: 56px 20px; border: 1px dashed #24262B; }

.hd-spinner { width: 11px; height: 11px; border-radius: 50%; border: 2px solid #24262B; border-top-color: #E11D2E; animation: hd-spin 0.7s linear infinite; }
@keyframes hd-spin { to { transform: rotate(360deg); } }

.hd-modal-backdrop { position: fixed; inset: 0; background: rgba(11,12,14,0.75); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.hd-modal-card { background: #131418; border: 1px solid #24262B; max-width: 560px; width: 100%; max-height: 85vh; overflow-y: auto; padding: 24px; }
.hd-modal-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.hd-modal-title { font-family: 'Space Grotesk', sans-serif; font-size: 15px; font-weight: 700; color: #F4F2EE; text-transform: uppercase; }
.hd-modal-close { background: none; border: none; color: #55565C; font-size: 18px; cursor: pointer; line-height: 1; padding: 4px; }
.hd-modal-close:hover { color: #F4F2EE; }
.hd-modal-sub { font-size: 12px; color: #93959C; margin-bottom: 16px; }
.hd-modal-url-row { display: flex; gap: 8px; margin-bottom: 14px; }
.hd-modal-url-input { flex: 1; min-width: 0; padding: 10px 12px; background: #0B0C0E; border: 1px solid #24262B; color: #F4F2EE; font-family: 'JetBrains Mono', monospace; font-size: 12px; outline: none; }
.hd-modal-url-input:focus { border-color: #E11D2E; }
.hd-modal-copy-btn { padding: 9px 16px; border: 1px solid #E11D2E; background: rgba(225,29,46,0.1); color: #E11D2E; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: all .12s ease; }
.hd-modal-copy-btn:hover { background: rgba(225,29,46,0.2); }
.hd-modal-copy-btn.copied { border-color: #4ADE80; background: rgba(74,222,128,0.1); color: #4ADE80; }
.hd-modal-json-btn { padding: 9px 16px; border: 1px solid #24262B; background: #0B0C0E; color: #F4F2EE; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: all .12s ease; }
.hd-modal-json-btn:hover { border-color: #E11D2E; }
.hd-modal-json-btn:disabled { opacity: 0.6; cursor: wait; }
.hd-modal-json-view { max-height: 320px; overflow-y: auto; margin-top: 6px; }
.hd-modal-json-error { font-size: 12px; color: #E11D2E; margin: 4px 0 14px; }
.hd-modal-notes { list-style: none; padding: 0; margin: 0 0 18px; display: flex; flex-direction: column; gap: 8px; }
.hd-modal-notes li { font-size: 12px; color: #93959C; padding-left: 14px; position: relative; }
.hd-modal-notes li::before { content: '—'; position: absolute; left: 0; color: #55565C; }
.hd-modal-code-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #55565C; letter-spacing: 0.1em; text-transform: uppercase; margin: 14px 0 6px; }
.hd-modal-code { background: #0B0C0E; border: 1px solid #24262B; padding: 12px 14px; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: #F4F2EE; overflow-x: auto; white-space: pre; margin: 0; }
.hd-data-link-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #24262B; }
.hd-data-link-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; background: #0B0C0E; border: 1px solid #24262B; color: #F4F2EE; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; cursor: pointer; transition: border-color .12s ease; }
.hd-data-link-btn:hover { border-color: #E11D2E; }
.hd-data-link-btn:disabled { opacity: 0.6; cursor: wait; }
.hd-switch { display: inline-flex; align-items: center; gap: 10px; padding: 9px 14px; background: #0B0C0E; border: 1px solid #24262B; color: #F4F2EE; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; cursor: pointer; transition: border-color .12s ease; }
.hd-switch:hover { border-color: #E11D2E; }
.hd-switch:disabled { opacity: 0.6; cursor: not-allowed; }
.hd-switch.on { border-color: #4ADE80; color: #4ADE80; }
.hd-switch-track { position: relative; width: 34px; height: 18px; border-radius: 9px; background: #24262B; transition: background .15s ease; flex-shrink: 0; }
.hd-switch.on .hd-switch-track { background: #4ADE80; }
.hd-switch-knob { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #F4F2EE; transition: left .15s ease; }
.hd-switch.on .hd-switch-knob { left: 18px; }
.hd-sync-note { flex-basis: 100%; font-size: 12px; color: #93959C; }
.hd-tile-text { display: flex; flex-direction: column; gap: 2px; }
.hd-tile-sub { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #55565C; }
.hd-tile-copy { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin: -4px -6px -4px 2px; background: none; border: 1px solid #24262B; color: #93959C; font-size: 10px; cursor: pointer; }
.hd-tile-copy:hover { border-color: #E11D2E; color: #E11D2E; }
.hd-tile-copy.copied { border-color: #4ADE80; color: #4ADE80; }
.hd-pager { display: inline-flex; gap: 3px; margin-left: 2px; }
.hd-pager-btn { min-width: 18px; height: 18px; padding: 0 3px; background: none; border: 1px solid #24262B; color: #93959C; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; line-height: 1; cursor: pointer; }
.hd-pager-btn:hover { border-color: #E11D2E; color: #F4F2EE; }
.hd-pager-btn.on { border-color: #E11D2E; background: rgba(225,29,46,0.12); color: #E11D2E; }
.hd-pager-btn.auto.on { border-color: #4ADE80; background: rgba(74,222,128,0.1); color: #4ADE80; }

.hd-modal-divider { border-top: 1px solid #24262B; margin: 18px 0 14px; }
.hd-modal-section-title { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #F4F2EE; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
.hd-modal-fields { list-style: none; padding: 0; margin: 0 0 4px; display: flex; flex-direction: column; gap: 7px; }
.hd-modal-fields li { font-size: 12px; color: #93959C; }
.hd-modal-fields code { color: #F4F2EE; }
.hd-modal-details { margin-top: 14px; border: 1px solid #24262B; padding: 10px 14px; }
.hd-modal-details summary { cursor: pointer; font-size: 12px; font-weight: 600; color: #F4F2EE; }
.hd-modal-field-groups { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.hd-modal-field-groups div { font-size: 11.5px; color: #93959C; line-height: 1.5; }
.hd-modal-field-groups strong { color: #F4F2EE; }
`;

const TournamentSearch = memo(({ onQueryChange }: { onQueryChange: (q: string) => void }) => {
  const [localQuery, setLocalQuery] = useState('');
  const [, startTransition] = useTransition();

  useEffect(() => {
    const id = setTimeout(() => {
      startTransition(() => onQueryChange(localQuery));
    }, localQuery === '' ? 0 : 200);
    return () => clearTimeout(id);
  }, [localQuery, onQueryChange]);

  return (
    <div className="hd-search-wrap">
      <FaSearch className="hd-search-ic" />
      <input
        type="text"
        value={localQuery}
        onChange={e => setLocalQuery(e.target.value)}
        placeholder="Search tournaments…"
        className="hd-search-input"
      />
    </div>
  );
});

// A ranking tile's page switcher: one button per page the overlay currently
// has, plus A = back to the timer. `held` is the page being held, null = auto.
// Panels for the operator, not for air: each opens in its own tab and its
// link can be copied into an OBS custom browser dock. Not theme views, so
// they are not in VIEW_GROUPS and show for every theme.
const OBSERVER_GROUP = {
  id: 'observer', label: 'Observer', hint: 'dock in OBS',
  views: [{ key: 'TeamSlots', label: 'Team Slots' }],
};

interface TilePager { pages: number; held: number | null; onPick: (page: number | null) => void }

const OverlayGroup = memo(({ group, onTileClick, onCopy, copiedId, pagers }: {
  group: { id: string; label: string; hint: string; views: { key: string; label: string; sub?: string }[] };
  onTileClick: (groupId: string, viewKey: string) => void;
  // Permanent links only: copies the tile's link instead of opening it.
  onCopy?: (groupId: string, viewKey: string) => void;
  copiedId?: string | null;
  // Keyed by view key; only rankings with more than one page have an entry.
  pagers?: Record<string, TilePager>;
}) => (
  <div className="hd-group">
    <div className="hd-group-hdr">
      <span className="hd-group-label">{group.label}</span>
      <span className="hd-group-hint">{group.hint}</span>
    </div>
    <div className="hd-tiles">
      {group.views.map(v => (
        <div key={v.key} className="hd-tile" onClick={() => onTileClick(group.id, v.key)}>
          <span className="hd-tile-text">
            <span className="hd-tile-label">{v.label}</span>
            {v.sub && <span className="hd-tile-sub">{v.sub}</span>}
          </span>
          <FaExternalLinkAlt className="hd-tile-ic" />
          {onCopy && (
            <button
              type="button"
              className={`hd-tile-copy ${copiedId === `${group.id}:${v.key}` ? 'copied' : ''}`}
              title="Copy this link"
              onClick={e => { e.stopPropagation(); onCopy(group.id, v.key); }}
            >
              {copiedId === `${group.id}:${v.key}` ? <FaCheck /> : <FaLink />}
            </button>
          )}
          {pagers?.[v.key] && (
            <span className="hd-pager" onClick={e => e.stopPropagation()}>
              {Array.from({ length: pagers[v.key].pages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`hd-pager-btn ${pagers[v.key].held === i ? 'on' : ''}`}
                  title={`Hold page ${i + 1} on air`}
                  onClick={() => pagers[v.key].onPick(i)}
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button"
                className={`hd-pager-btn auto ${pagers[v.key].held === null ? 'on' : ''}`}
                title="Auto: flip pages on the timer"
                onClick={() => pagers[v.key].onPick(null)}
              >
                A
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  </div>
));

const DataLinkModal = memo(({
  url, docsUrl, copied, onCopy, onClose, inputRef, tournamentId, roundId,
  jsonLoading, jsonData, jsonError, onShowJson,
}: {
  url: string; docsUrl: string; copied: boolean; onCopy: () => void; onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  tournamentId: string; roundId: string;
  jsonLoading: boolean; jsonData: any; jsonError: string | null; onShowJson: () => void;
}) => (
  <div className="hd-modal-backdrop" onClick={onClose}>
    <div className="hd-modal-card" onClick={e => e.stopPropagation()}>
      <div className="hd-modal-hdr">
        <span className="hd-modal-title">Match Data Link</span>
        <button className="hd-modal-close" onClick={onClose}>&times;</button>
      </div>
      <div className="hd-modal-sub">Raw backend data for the currently selected match.</div>

      <div className="hd-modal-url-row">
        <input ref={inputRef} readOnly value={url} className="hd-modal-url-input"
               onFocus={e => e.target.select()} />
        <button className={`hd-modal-copy-btn ${copied ? 'copied' : ''}`} onClick={onCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button className="hd-modal-json-btn" onClick={onShowJson} disabled={jsonLoading}>
          {jsonLoading ? 'Loading…' : 'Show JSON'}
        </button>
      </div>

      {jsonError && <div className="hd-modal-json-error">{jsonError}</div>}
      {jsonData && (
        <>
          <div className="hd-modal-code-label">Converted JSON</div>
          <pre className="hd-modal-code hd-modal-json-view">{JSON.stringify(jsonData, null, 2)}</pre>
        </>
      )}

      <ul className="hd-modal-notes">
        <li>Stays live: <code>followSelected=true</code> re-resolves the match server-side, so this link keeps working even after you change the live match selection.</li>
        <li>Cached by the local relay and refreshed the moment the data changes (revision-based), so repeated fetches cost no cloud bandwidth.</li>
        <li>The body is <strong>MessagePack binary</strong>, not JSON — decode it before reading.</li>
        <li>Routed through this machine's local relay (<code>127.0.0.1</code>) — requires the desktop app to stay open, and only works from this PC.</li>
      </ul>

      <div className="hd-modal-divider" />
      <div className="hd-modal-section-title">Build your own overlay (recommended)</div>
      <div className="hd-modal-sub">
        One import gives a self-hosted page the same live data the built-in overlays use — initial state, real-time
        updates, reconnect/resync, eliminations and computed standings — with no decoding to write.
      </div>
      <pre className="hd-modal-code">{`<script type="module">
import { connectOverlay } from '${RELAY_ORIGIN}/sdk/v1/overlay-client.js';

const feed = connectOverlay({
  tournamentId: '${tournamentId}',
  roundId: '${roundId}',
});

feed.subscribe((state) => {
  // state.derived.teams   live standings: totalPoints, aliveCount, totalKills, isEliminationLocked
  // state.matchData.teams roster: uId, playerName, picUrl, health, liveState, killNum, damage, ...
  // state.derived.overallStandings, state.deadTeamList, state.tournament, state.match ...
  console.log(state);
});
</script>`}</pre>
      <div className="hd-modal-url-row" style={{ marginTop: 10 }}>
        <button className="hd-modal-json-btn" onClick={() => window.open(docsUrl, '_blank', 'noopener,noreferrer')}>
          Open docs + live example
        </button>
      </div>

      <div className="hd-modal-divider" />
      <div className="hd-modal-section-title">Or fetch the link above yourself (HTTP snapshot)</div>
      <div className="hd-modal-code-label">Decode — JavaScript (@msgpack/msgpack)</div>
      <pre className="hd-modal-code">{`import { decode } from '@msgpack/msgpack';
const res = await fetch(url);
const data = decode(new Uint8Array(await res.arrayBuffer()));
console.log(data);`}</pre>

      <div className="hd-modal-code-label">Decode — Python (msgpack)</div>
      <pre className="hd-modal-code">{`import requests, msgpack
r = requests.get(url)
data = msgpack.unpackb(r.content, raw=False)
print(data)`}</pre>

      <div className="hd-modal-divider" />
      <div className="hd-modal-section-title">Or handle the raw live protocol yourself (Socket.IO)</div>
      <div className="hd-modal-sub">
        Same IDs, no token. Through the relay the live events are <strong>protobuf</strong>, not MessagePack:
        drop the first byte (<code>0xC1</code>) and decode with{' '}
        <a href={`${RELAY_ORIGIN}/sdk/v1/overlay.proto`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>overlay.proto</a>.
        {' '}<code>liveMatchUpdate</code> / <code>overallDataUpdate</code> are deltas (merge by <code>teamId</code> / <code>uId</code>),
        {' '}<code>liveMatchSnapshot</code> is a full roster. A gap in <code>seq</code> means a lost delta — emit <code>requestLiveSnapshot</code>.
      </div>
      <pre className="hd-modal-code">{`import { io } from 'socket.io-client';
import protobuf from 'protobufjs';

const root = await protobuf.load('${RELAY_ORIGIN}/sdk/v1/overlay.proto');
const MatchData = root.lookupType('overlay.MatchDataPayload');
const Overall = root.lookupType('overlay.OverallDataPayload');
const pb = (T, raw) => T.toObject(T.decode(new Uint8Array(raw).subarray(1)), { defaults: true });

const socket = io('${RELAY_ORIGIN}', { transports: ['websocket'] });
socket.on('connect', () => socket.emit('joinRoundRoom', {
  tournamentId: '${tournamentId}', roundId: '${roundId}',
}));
socket.on('liveMatchSnapshot', raw => console.log('snapshot', pb(MatchData, raw)));
socket.on('liveMatchUpdate', raw => console.log('delta', pb(MatchData, raw)));
socket.on('overallDataUpdate', raw => console.log('overall', pb(Overall, raw)));`}</pre>

      <div className="hd-modal-divider" />
      <div className="hd-modal-section-title">What's inside</div>
      <ul className="hd-modal-fields">
        <li><code>tournamentData</code> — name, logo, brand colors</li>
        <li><code>roundData</code> — round name, day, group refs</li>
        <li><code>matchesData.current</code> — the resolved match; <code>.list</code> — every match in the round (only for schedule-style views; present here since this link omits <code>view</code>)</li>
        <li><code>currentMatchData.matchData</code> — full live per-team/per-player stats for the resolved match, plus a computed <code>deadTeamList</code></li>
        <li><code>overallData</code> — the same team/player stats, summed across every match played so far in the round</li>
        <li><code>matchDatasData</code> — a slim per-match summary (kills/damage/assists/survivalTime/knockouts only)</li>
      </ul>

      <details className="hd-modal-details">
        <summary>Per-player stat fields (in currentMatchData / overallData)</summary>
        <div className="hd-modal-field-groups">
          <div><strong>Kills</strong> — killNum, killNumBeforeDie, killNumInVehicle, killNumByGrenade, AIKillNum, BossKillNum, headShotNum, maxKillDistance</div>
          <div><strong>Damage</strong> — damage, inDamage, heal, PoisonTotalDamage</div>
          <div><strong>Placement</strong> — player rank; team.rank, team.placePoints; team.wwcd (overallData only)</div>
          <div><strong>HP</strong> — health, healthMax</div>
          <div><strong>Alive / death</strong> — bHasDied, liveState, isOutsideBlueCircle</div>
          <div><strong>Position</strong> — location.x / location.y / location.z</div>
          <div><strong>Other</strong> — assists, knockouts, survivalTime, driveDistance, marchDistance, rescueTimes, grenade &amp; airdrop counters</div>
          <div><strong>Identity</strong> — uId, playerName, picUrl, teamId, teamName, teamTag, teamLogo</div>
        </div>
        <div className="hd-modal-sub" style={{ marginTop: 8 }}>
          This link omits <code>view</code>, so nothing is slimmed — every field above is present.
          Themed overlay links that pass a specific <code>view</code> get a trimmed subset instead.
        </div>
      </details>
    </div>
  </div>
));

const isCanceled = (err: any) => err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';

// The picker only ever holds this many tournaments: the newest ones, or the
// matches for whatever is typed in the search box (server-side, like Teams).
const TOURNAMENT_LIST_LIMIT = 20;
type TournamentList = { tournaments: Tournament[]; total: number };
// GET /tournaments?limit=… answers { tournaments, total }. Anything else (an
// old array-shaped cache entry from before the list was capped) is rejected.
const toTournamentList = (data: any): TournamentList | null =>
  data && Array.isArray(data.tournaments)
    ? { tournaments: data.tournaments, total: typeof data.total === 'number' ? data.total : data.tournaments.length }
    : null;

const DisplayHud: React.FC = () => {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  // How many tournaments the account has in all (from the unfiltered list).
  const [tournamentTotal, setTournamentTotal] = useState(0);
  // Every tournament seen in any response, by id. `tournaments` is only the
  // current page of results, so names for the selected / API-live /
  // permanent-link tournament are looked up here instead.
  const [knownTournaments, setKnownTournaments] = useState<Record<string, Tournament>>({});
  const rememberTournaments = useCallback((list: Tournament[]) => {
    if (!list.length) return;
    setKnownTournaments(prev => {
      const next = { ...prev };
      list.forEach(t => { next[t._id] = t; });
      return next;
    });
  }, []);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  const [tournamentId, setTournamentId] = useState('');
  const [roundId, setRoundId] = useState('');
  const [tournamentQuery, setTournamentQuery] = useState('');

  const [selectedMatches, setSelectedMatches] = useState<Record<string, string | null>>({});
  const [selectedSchedule, setSelectedSchedule] = useState<Record<string, string[]>>({});
  const [pollingKey, setPollingKey] = useState(0);
  const [apiRound, setApiRound] = useState<{ tournamentId: string; roundId: string; roundName: string } | null>(null);
  const [jumpingToApiRound, setJumpingToApiRound] = useState(false);
  const [themeMap, setThemeMap] = useState<Record<string, string>>(() => {
    try { const s = localStorage.getItem('selectedThemeMap'); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  const [dataLinkOpen, setDataLinkOpen] = useState(false);
  const [dataLinkCopied, setDataLinkCopied] = useState(false);
  const dataLinkInputRef = useRef<HTMLInputElement>(null);
  const [dataLinkJsonLoading, setDataLinkJsonLoading] = useState(false);
  const [dataLinkJsonData, setDataLinkJsonData] = useState<any>(null);
  const [dataLinkJsonError, setDataLinkJsonError] = useState<string | null>(null);
  // Permanent links: `syncTarget` is the one round every permanent link of
  // this account renders (null = switched off), `syncKey` the account's
  // overlay key those links are built on. See overlaySync.ts.
  const [syncTarget, setSyncTarget] = useState<OverlaySyncTarget | null>(null);
  const [syncKey, setSyncKey] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [copiedTile, setCopiedTile] = useState<string | null>(null);
  const applySync = useCallback((data: any) => {
    setSyncTarget(parseOverlaySync(data)?.target ?? null);
    if (typeof data?.key === 'string' && data.key) setSyncKey(data.key);
  }, []);

  // The backend enforces at most one apiEnable:true round per user (DB-level
  // unique partial index), so this is a single global "live" round, not a
  // per-tournament thing — surfacing it here saves re-clicking through the
  // tournament/round pickers to find whichever one it currently is. Asked
  // together with where the permanent links point, which follows it.
  const refreshApiRound = useCallback(() => {
    api.get('/user/rounds').then(r => {
      const active = (Array.isArray(r.data) ? r.data : []).find((rd: any) => rd.apiEnable);
      if (!active) { setApiRound(null); return; }
      setApiRound({
        tournamentId: typeof active.tournamentId === 'object' ? active.tournamentId._id : active.tournamentId,
        roundId: active._id,
        roundName: active.roundName,
      });
    }).catch(() => setApiRound(null));

    api.get('/overlay-sync')
      .then(r => applySync(r.data))
      .catch(() => {});
  }, [applySync]);

  // ── Overlay URL ─────────────────────────────────────────────────────────
  // An absolute overlay URL on THIS (front) origin — this is what the
  // operator pastes into an OBS Browser Source. The overlay page itself
  // routes its socket + /api traffic through the co-located desktop overlay
  // relay (login/api.tsx: any /public/* route defaults to http://127.0.0.1:8787,
  // with a reactive fallback to the cloud origin if the relay isn't up), so
  // no `&relay=` query param needs baking into the link any more.
  const overlayUrl = useCallback(
    (pathAndQuery: string) => `${window.location.origin}${pathAndQuery}`,
    [],
  );

  // ── Rounds/matches caching + in-flight cancellation ──────────────────────
  // Rounds and matches rarely change mid-broadcast, so once fetched for a
  // given tournament/round they're kept fresh for a while — switching back
  // to a tournament you already looked at is instant instead of re-hitting
  // the API. These keys are shared with Round.tsx/Match.tsx (cache.tsx,
  // sessionStorage), so navigating here after visiting those pages for the
  // same tournament is also a cache hit. Each fetch also cancels whatever
  // fetch of the same kind was still in flight, so rapid clicking through
  // tournaments can't have a slow, stale response land after a faster one.
  const roundsAbortRef = useRef<AbortController | null>(null);
  const matchesAbortRef = useRef<AbortController | null>(null);

  const [roundsLoading, setRoundsLoading] = useState(false);
  const [matchesLoading, setMatchesLoading] = useState(false);

  useEffect(() => () => {
    roundsAbortRef.current?.abort();
    matchesAbortRef.current?.abort();
  }, []);

  // `tournaments` is already the server's answer for the current search —
  // only make sure the selected tournament stays in the dropdown when it
  // isn't part of that answer.
  const filteredTournaments = useMemo(() => {
    if (tournamentId && !tournaments.some(t => t._id === tournamentId)) {
      const current = knownTournaments[tournamentId];
      if (current) return [current, ...tournaments];
    }
    return tournaments;
  }, [tournaments, knownTournaments, tournamentId]);

  // Loads the picker's list: the newest tournaments when the search box is
  // empty (cache-first, the `tournaments_<userId>` entry shared with
  // dashboard/page.tsx), otherwise a live server-side search. The id is read
  // out of the "user" blob localStorage already has since login — no
  // `/users/me` round-trip just to build a cache key; a real auth failure is
  // caught globally by the axios 401 interceptor in login/api.tsx.
  const tournamentReqRef = useRef(0);
  const loadTournaments = useCallback(async (query: string) => {
    const reqId = ++tournamentReqRef.current;
    const fetchList = () => api.get('/tournaments', {
      params: { limit: TOURNAMENT_LIST_LIMIT, ...(query ? { search: query } : {}) },
    }).then(r => r.data);

    try {
      let list: TournamentList | null;
      if (query) {
        list = toTournamentList(await fetchList());
      } else {
        let userData: { _id: string } | null = null;
        try { userData = JSON.parse(localStorage.getItem('user') || 'null'); } catch { userData = null; }
        if (!userData?._id) {
          list = { tournaments: [], total: 0 };
        } else {
          const key = `tournaments_${userData._id}`;
          const opts = { maxAge: 90 * 1000, storage: 'local' as const };
          list = toTournamentList(await getOrFetch(key, fetchList, opts))
            || toTournamentList(await getOrFetch(key, fetchList, { ...opts, forceRefresh: true }));
        }
      }
      if (reqId !== tournamentReqRef.current) return; // a newer search already answered
      const safe = list || { tournaments: [], total: 0 };
      setTournaments(safe.tournaments);
      if (!query) setTournamentTotal(safe.total);
      rememberTournaments(safe.tournaments);
    } catch {
      if (reqId === tournamentReqRef.current && !query) { setTournaments([]); setTournamentTotal(0); }
    }
  }, [rememberTournaments]);

  // First load, and again whenever the (already debounced) search changes.
  useEffect(() => {
    loadTournaments(tournamentQuery.trim());
  }, [tournamentQuery, loadTournaments]);

  const roundKey = tournamentId && roundId ? `${tournamentId}_${roundId}` : '';
  // Custom themes (Theme9, Theme10, …) built in the Designer. themeMap stores
  // them as `custom:<themeId>`; an unknown/deleted one falls back to Theme1.
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  useEffect(() => {
    let alive = true;
    themesApi.list().then((t) => { if (alive) setCustomThemes(t); }).catch(() => { /* no themes / offline: built-ins only */ });
    return () => { alive = false; };
  }, []);
  // Import a theme file (.sstheme): the new theme joins the list and becomes this tournament's theme.
  const [importOpen, setImportOpen] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const onThemeImported = (imported: CustomTheme, warnings: string[]) => {
    setImportOpen(false);
    setCustomThemes((prev) => [...prev.filter((t) => t._id !== imported._id), imported].sort((a, b) => a.number - b.number));
    if (tournamentId) setThemeMap((p) => ({ ...p, [tournamentId]: `custom:${imported._id}` }));
    setImportNote([`Imported “${imported.name}” as ${imported.label}.`, ...warnings].join(' '));
  };
  const storedTheme = tournamentId ? (themeMap[tournamentId] || 'Theme1') : 'Theme1';
  const customTheme = storedTheme.startsWith('custom:') ? customThemes.find((t) => t._id === storedTheme.slice(7)) || null : null;
  const theme = storedTheme.startsWith('custom:') && !customTheme ? 'Theme1' : storedTheme;
  const liveMatchId = roundKey ? selectedMatches[roundKey] || null : null;
  const schedMatchIds = roundKey ? selectedSchedule[roundKey] || [] : [];
  const liveMatchObj = liveMatchId ? matches.find(m => m._id === liveMatchId) : null;
  // A copy-paste data link for an external consumer — routed through the
  // local overlay relay (127.0.0.1:8787), same as every other overlay data
  // connection. Strictly relay-only by design: it only resolves while the
  // desktop app (and its relay) is running on this machine, no cloud fallback.
  const dataLinkUrl = liveMatchId
    ? `${RELAY_ORIGIN}/api/public/bulk/${tournamentId}/${roundId}/${liveMatchId}?followSelected=true`
    : '';
  // The relay-served docs + live example for the self-hosted overlay client
  // (desktop-app/relay/sdk). `assets` lets the example resolve relative
  // default images (/def_char.avif, /def_logo.avif) against this site.
  const dataLinkDocsUrl = tournamentId && roundId
    ? `${RELAY_ORIGIN}/sdk/v1/?t=${encodeURIComponent(tournamentId)}&r=${encodeURIComponent(roundId)}&assets=${encodeURIComponent(window.location.origin)}`
    : `${RELAY_ORIGIN}/sdk/v1/`;

  useEffect(() => {
    api.get('/matchSelection/selected').then(r => {
      const map: Record<string, string> = {};
      r.data.forEach((s: any) => {
        const rId = typeof s.roundId === 'object' ? s.roundId._id : s.roundId;
        map[`${s.tournamentId}_${rId}`] = s.matchId;
      });
      setSelectedMatches(map);
    }).catch(() => {});

    refreshApiRound();
  }, [refreshApiRound]);

  // The API switch sits on the rounds page (and in the desktop app): when a
  // round changes, ask again which one is live and where the links point.
  useEffect(() => {
    socket.on('roundUpdated', refreshApiRound);
    return () => { socket.off('roundUpdated', refreshApiRound); };
  }, [refreshApiRound]);

  useEffect(() => {
    try { localStorage.setItem('selectedThemeMap', JSON.stringify(themeMap)); } catch {}
  }, [themeMap]);

  const handleTournamentChange = useCallback((id: string) => {
    setTournamentId(id);
    setRoundId('');
    setRounds([]);
    setMatches([]);
    if (!id) return;

    roundsAbortRef.current?.abort();
    const controller = new AbortController();
    roundsAbortRef.current = controller;

    setRoundsLoading(true);
    // No `signal` on this request: the cache key is shared with Round.tsx's
    // getOrFetch call via the same in-flight-promise dedup, so aborting here
    // would cancel Round.tsx's request too if it's still mounted and waiting
    // on the same in-flight promise. Staleness is guarded via `.aborted`
    // checks below instead.
    getOrFetch(
      `cache:v1:rounds:${id}`,
      () => api.get(`/tournaments/${id}/rounds`).then(r => r.data),
      { maxAge: 90 * 1000, storage: 'session' }
    )
      .then(data => { if (!controller.signal.aborted) setRounds(Array.isArray(data) ? data : []); })
      .catch(err => { if (!isCanceled(err)) setRounds([]); })
      .finally(() => { if (!controller.signal.aborted) setRoundsLoading(false); });
  }, []);

  const handleRoundChange = useCallback((id: string) => {
    setRoundId(id);
    setMatches([]);
    if (!id || !tournamentId) return;

    matchesAbortRef.current?.abort();
    const controller = new AbortController();
    matchesAbortRef.current = controller;

    setMatchesLoading(true);
    // No `signal` on this request: the cache key is shared with Match.tsx's
    // getOrFetch call via the same in-flight-promise dedup — see the rounds
    // fetch above for why.
    getOrFetch(
      `cache:v1:matches:${tournamentId}:${id}`,
      () => api.get(`/tournaments/${tournamentId}/rounds/${id}/matches`).then(r => r.data),
      { maxAge: 90 * 1000, storage: 'session' }
    )
      .then(data => { if (!controller.signal.aborted) setMatches(Array.isArray(data) ? data : []); })
      .catch(err => { if (!isCanceled(err)) setMatches([]); })
      .finally(() => { if (!controller.signal.aborted) setMatchesLoading(false); });
  }, [tournamentId]);

  // Jumps straight to the tournament/round the API-enabled banner is
  // pointing at. Can't reuse handleTournamentChange + handleRoundChange back
  // to back here: handleRoundChange closes over `tournamentId` from state,
  // which wouldn't have committed yet from the setTournamentId call above it
  // in the same tick, so it'd fetch matches for the *previous* tournament.
  // Fetching rounds and matches directly off the known IDs sidesteps that.
  const jumpToApiRound = useCallback(async () => {
    if (!apiRound) return;
    const { tournamentId: tId, roundId: rId } = apiRound;

    setJumpingToApiRound(true);
    setTournamentId(tId);
    setRoundId(rId);
    setRounds([]);
    setMatches([]);

    roundsAbortRef.current?.abort();
    const roundsController = new AbortController();
    roundsAbortRef.current = roundsController;
    matchesAbortRef.current?.abort();
    const matchesController = new AbortController();
    matchesAbortRef.current = matchesController;

    setRoundsLoading(true);
    setMatchesLoading(true);
    try {
      const [roundsData, matchesData] = await Promise.all([
        getOrFetch(`cache:v1:rounds:${tId}`, () => api.get(`/tournaments/${tId}/rounds`).then(r => r.data), { maxAge: 90 * 1000, storage: 'session' }),
        getOrFetch(`cache:v1:matches:${tId}:${rId}`, () => api.get(`/tournaments/${tId}/rounds/${rId}/matches`).then(r => r.data), { maxAge: 90 * 1000, storage: 'session' }),
      ]);
      if (!roundsController.signal.aborted) setRounds(Array.isArray(roundsData) ? roundsData : []);
      if (!matchesController.signal.aborted) setMatches(Array.isArray(matchesData) ? matchesData : []);
    } catch (err) {
      if (!isCanceled(err)) { setRounds([]); setMatches([]); }
    } finally {
      if (!roundsController.signal.aborted) setRoundsLoading(false);
      if (!matchesController.signal.aborted) setMatchesLoading(false);
      setJumpingToApiRound(false);
    }
  }, [apiRound]);

  // Auto-jump into the API-enabled round the instant it's discovered, so the
  // operator doesn't have to click the banner. Guarded so it only fires once
  // per page load, and only while nothing's been picked yet, so it can't
  // clobber a selection the operator already made in the brief window before
  // /user/rounds resolves. The banner's onClick={jumpToApiRound} still works
  // for manual re-triggering afterward.
  const autoJumpedRef = useRef(false);
  useEffect(() => {
    if (!apiRound || autoJumpedRef.current) return;
    if (tournamentId || roundId) return;
    autoJumpedRef.current = true;
    jumpToApiRound();
  }, [apiRound, jumpToApiRound, tournamentId, roundId]);

  // Match.tsx writes new/edited/deleted matches into this same cache key, but
  // only inside its own tab's sessionStorage — it never reaches this tab's
  // cache. The backend already broadcasts these mutations over the user's
  // socket room, so listen for them here, bust the stale entries, and force
  // a real re-fetch of whatever round is currently selected (mirrors the
  // roundUpdated handling in Round.tsx).
  useEffect(() => {
    const handleMatchChanged = () => {
      clearCacheByPrefix('cache:v1:matches:', 'session');
      if (tournamentId && roundId) handleRoundChange(roundId);
    };
    socket.on('matchCreated', handleMatchChanged);
    socket.on('matchUpdated', handleMatchChanged);
    socket.on('matchDeleted', handleMatchChanged);
    return () => {
      socket.off('matchCreated', handleMatchChanged);
      socket.off('matchUpdated', handleMatchChanged);
      socket.off('matchDeleted', handleMatchChanged);
    };
  }, [tournamentId, roundId, handleRoundChange]);

  // The live match can also be picked from the desktop app (or another tab).
  // The server tells this account's sockets; the checkbox follows without a
  // reload. A switch arrives as "deselected" for the old match, then
  // "selected" for the new one.
  useEffect(() => {
    const idOf = (v: any) => (v && typeof v === 'object' ? String(v._id) : v ? String(v) : '');
    const onSelected = (msg: any) => {
      const sel = msg?.selected;
      if (!sel?.tournamentId || !sel?.roundId || !sel?.matchId) return;
      const key = `${idOf(sel.tournamentId)}_${idOf(sel.roundId)}`;
      const picked = idOf(sel.matchId);
      setSelectedMatches(p => (p[key] === picked ? p : { ...p, [key]: picked }));
      setPollingKey(p => p + 1);
    };
    const onDeselected = (msg: any) => {
      if (!msg?.tournamentId || !msg?.roundId) return;
      const key = `${idOf(msg.tournamentId)}_${idOf(msg.roundId)}`;
      const gone = idOf(msg.matchId);
      // Only clear the match that was deselected: a "selected" for the next
      // match may already have been applied.
      setSelectedMatches(p => (p[key] && (!gone || p[key] === gone) ? { ...p, [key]: null } : p));
      setPollingKey(p => p + 1);
    };
    socket.on('matchSelected', onSelected);
    socket.on('matchDeselected', onDeselected);
    return () => {
      socket.off('matchSelected', onSelected);
      socket.off('matchDeselected', onDeselected);
    };
  }, []);

  const toggleLiveMatch = useCallback(async (mId: string, checked: boolean) => {
    if (!roundKey) return;
    let prevValue: string | null = null;
    setSelectedMatches(p => { prevValue = p[roundKey] ?? null; return { ...p, [roundKey]: checked ? mId : null }; });
    try {
      const res = await api.post('/matchSelection/select', { tournamentId, roundId, matchId: mId });
      if (res.data.deselected && checked) setSelectedMatches(p => ({ ...p, [roundKey]: null }));
      else if (!res.data.deselected && !checked) setSelectedMatches(p => ({ ...p, [roundKey]: mId }));
      setPollingKey(p => p + 1);
    } catch {
      setSelectedMatches(p => ({ ...p, [roundKey]: prevValue }));
      alert('Failed to update match selection. Please try again.');
    }
  }, [roundKey, tournamentId, roundId]);

  const toggleSchedMatch = useCallback((mId: string, checked: boolean) => {
    if (!roundKey) return;
    setSelectedSchedule(p => {
      const cur = p[roundKey] || [];
      return { ...p, [roundKey]: checked ? [...cur, mId] : cur.filter(id => id !== mId) };
    });
  }, [roundKey]);

  // ── Permanent links ──────────────────────────────────────────────────────
  // Switched on, every overlay gets a link with no tournament / round / match
  // in it (/public/live/<key>, /o/<publicId>?k=<key>) that shows the round the
  // API is enabled for (or, with none, the round picked in this panel) and
  // that round's selected match, so OBS never needs new links. Switched off,
  // the tiles open the ordinary per-round links and the permanent ones render
  // nothing.
  const permanentOn = !!syncTarget && !!syncKey;

  const togglePermanent = useCallback(async () => {
    setSyncBusy(true);
    try {
      if (permanentOn) {
        applySync((await api.delete('/overlay-sync')).data);
      } else {
        if (!tournamentId || !roundId) return;
        applySync((await api.put('/overlay-sync', { tournamentId, roundId, scheduleMatches: schedMatchIds })).data);
      }
    } catch {
      alert(`Failed to switch permanent links ${permanentOn ? 'off' : 'on'}. Please try again.`);
    } finally {
      setSyncBusy(false);
    }
  }, [permanentOn, applySync, tournamentId, roundId, schedMatchIds]);

  // While on, the permanent links show the round the API is enabled for, and
  // that round's selected match. The server moves them there itself the moment
  // the API is switched on (overlaySync.controller.js followApiRound); this
  // only catches them up when they were left elsewhere. With no API round they
  // follow the round (and schedule picks) selected here.
  const schedKey = schedMatchIds.join(',');
  // The last target asked for, so an answer naming another round (the server
  // knows of an API round this page has not heard of yet) is not asked again.
  const lastSyncAskRef = useRef('');
  useEffect(() => {
    if (!permanentOn || !syncTarget) return;
    const want = apiRound ? { tournamentId: apiRound.tournamentId, roundId: apiRound.roundId } : { tournamentId, roundId };
    if (!want.tournamentId || !want.roundId) return;
    // Schedule picks are made in the round selected here.
    const sched = want.roundId === roundId ? schedKey : null;
    if (syncTarget.tournamentId === want.tournamentId && syncTarget.roundId === want.roundId
      && (sched === null || syncTarget.scheduleMatches.join(',') === sched)) return;
    const ask = `${want.roundId}|${sched ?? ''}`;
    if (lastSyncAskRef.current === ask) return;
    const id = setTimeout(() => {
      lastSyncAskRef.current = ask;
      api.put('/overlay-sync', { ...want, scheduleMatches: sched ? sched.split(',') : [] })
        .then(res => applySync(res.data))
        .catch(() => { lastSyncAskRef.current = ''; });
    }, apiRound ? 0 : 600);
    return () => clearTimeout(id);
  }, [permanentOn, syncTarget, apiRound, schedKey, tournamentId, roundId, applySync]);

  // The link behind a tile: permanent while the switch is on, otherwise the
  // link for the tournament / round / match picked above.
  const linkFor = (groupId: string, viewKey: string): string | null => {
    // Observer panels are the same page for every theme, custom ones too.
    if (groupId === OBSERVER_GROUP.id) {
      const query = 'theme=Theme1&view=LiveStats&panel=teamSlots&followSelected=true';
      if (permanentOn) return overlayUrl(`/public/live/${syncKey}?${query}`);
      return liveMatchId ? overlayUrl(`/public/tournament/${tournamentId}/round/${roundId}/match/${liveMatchId}?${query}`) : null;
    }
    if (customTheme) {
      const slot = customTheme.slots.find((sl) => sl.viewKey === viewKey && sl.publishedRev > 0);
      if (!slot) return null;
      if (permanentOn) return layoutOverlayUrl(slot.publicId, { k: syncKey });
      return tournamentId && roundId ? layoutOverlayUrl(slot.publicId, { t: tournamentId, r: roundId, m: liveMatchId }) : null;
    }
    const view = groupId === 'schedule' ? (viewKey === '__highlight' ? 'HighlightSchedule' : 'Schedule') : viewKey;
    if (permanentOn) {
      return overlayUrl(`/public/live/${syncKey}?theme=${encodeURIComponent(theme)}&view=${encodeURIComponent(view)}&followSelected=true`);
    }
    if (groupId === 'schedule') {
      if (!schedMatchIds.length) return null;
      return overlayUrl(`/public/tournament/${tournamentId}/round/${roundId}/match/${schedMatchIds[0]}?theme=${encodeURIComponent(theme)}&view=${view}&followSelected=true&scheduleMatches=${encodeURIComponent(schedMatchIds.join(','))}`);
    }
    if (!liveMatchId) return null;
    return overlayUrl(`/public/tournament/${tournamentId}/round/${roundId}/match/${liveMatchId}?theme=${encodeURIComponent(theme)}&view=${encodeURIComponent(view)}&followSelected=true`);
  };

  const openDataLink = () => {
    if (!liveMatchId) return;
    setDataLinkCopied(false);
    setDataLinkJsonData(null);
    setDataLinkJsonError(null);
    setDataLinkOpen(true);
  };

  const closeDataLink = () => {
    setDataLinkOpen(false);
    setDataLinkJsonData(null);
    setDataLinkJsonError(null);
  };

  const copyDataLink = async () => {
    if (!dataLinkUrl) return;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(dataLinkUrl);
        setDataLinkCopied(true);
        setTimeout(() => setDataLinkCopied(false), 2000);
        return;
      } catch { /* fall through to manual-select fallback */ }
    }
    dataLinkInputRef.current?.select(); // lets the operator Ctrl+C manually
  };

  const showDataLinkJson = useCallback(async () => {
    if (!dataLinkUrl) return;
    setDataLinkJsonLoading(true);
    setDataLinkJsonError(null);
    try {
      const res = await fetch(dataLinkUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = decode(new Uint8Array(await res.arrayBuffer()));
      setDataLinkJsonData(data);
    } catch (err: any) {
      setDataLinkJsonData(null);
      setDataLinkJsonError(err?.message || 'Failed to load data.');
    } finally {
      setDataLinkJsonLoading(false);
    }
  }, [dataLinkUrl]);

  const handleTileClick = (groupId: string, viewKey: string) => {
    const url = linkFor(groupId, viewKey);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyTileLink = async (groupId: string, viewKey: string) => {
    const url = linkFor(groupId, viewKey);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // No clipboard access (insecure origin / denied): let the operator copy it by hand.
      window.prompt('Copy this overlay link', url);
      return;
    }
    const id = `${groupId}:${viewKey}`;
    setCopiedTile(id);
    setTimeout(() => setCopiedTile(cur => (cur === id ? null : cur)), 2000);
  };

  // ── Ranking page switcher ──────────────────────────────────────────────
  // How many teams each ranking has, to know how many pages the selected
  // theme cuts it into (rankingPageCount is the themes' own rule).
  const [rankingTeams, setRankingTeams] = useState<Record<RankingView, number>>({ MatchData: 0, OverAllData: 0 });
  // The page each ranking is held on; absent = on the timer.
  const [heldPages, setHeldPages] = useState<Partial<Record<RankingView, number>>>({});
  const builtInTheme = customTheme ? null : theme;

  useEffect(() => {
    setHeldPages({});
  }, [tournamentId, roundId]);

  // `matches` is in the deps so a created / edited / deleted match recounts.
  useEffect(() => {
    if (!builtInTheme || !tournamentId || !roundId) {
      setRankingTeams({ MatchData: 0, OverAllData: 0 });
      return;
    }
    let alive = true;
    const count = (url: string) => api.get(url).then(r => (Array.isArray(r.data?.teams) ? r.data.teams.length : 0)).catch(() => 0);
    Promise.all([
      liveMatchId ? count(`/public/matches/${liveMatchId}/matchdata`) : Promise.resolve(0),
      count(`/public/tournaments/${tournamentId}/rounds/${roundId}/overall`),
    ]).then(([MatchData, OverAllData]) => {
      if (alive) setRankingTeams({ MatchData, OverAllData });
    });
    return () => { alive = false; };
  }, [builtInTheme, tournamentId, roundId, liveMatchId, matches]);

  const sendRankingPage = useCallback((view: RankingView, page: number | null) => {
    if (!tournamentId || !roundId) return;
    let previous: number | undefined;
    setHeldPages(prev => {
      previous = prev[view];
      return { ...prev, [view]: page ?? undefined };
    });
    api.post('/overlay-sync/page', { tournamentId, roundId, view, page }).catch(err => {
      console.error('Failed to switch the ranking page:', err);
      setHeldPages(prev => ({ ...prev, [view]: previous }));
    });
  }, [tournamentId, roundId]);

  const rankingPagers = useMemo(() => {
    const out: Record<string, TilePager> = {};
    if (!builtInTheme) return out;
    for (const view of ['MatchData', 'OverAllData'] as RankingView[]) {
      const pages = rankingPageCount(builtInTheme, view, rankingTeams[view]);
      if (pages > 1) out[view] = { pages, held: heldPages[view] ?? null, onPick: page => sendRankingPage(view, page) };
    }
    return out;
  }, [builtInTheme, rankingTeams, heldPages, sendRankingPage]);

  const step1Done = !!tournamentId && !!roundId;
  const step2Done = !!liveMatchId || schedMatchIds.length > 0;
  const step4Open = step2Done || permanentOn;

  // Overlay tiles are filtered to whatever the *currently selected theme*
  // actually implements — this is what stops "Player Summary" / "Live
  // Data" (Theme6-only components) from ever being clickable, and
  // therefore ever generating a link PublicThemeRenderer can't render, for
  // any other theme. A group disappears entirely if none of its views
  // survive the filter.
  // A permanent link needs no match picked: it follows the round's own selection.
  const visibleGroups = useMemo(
    () => customTheme
      // A custom theme shows exactly the views it has a PUBLISHED layout for,
      // each under the name its layout was saved with in the Designer.
      ? [...VIEW_GROUPS.filter(g => g.id !== 'schedule'), { id: 'custom', label: 'Custom', hint: 'Designer-only overlays', requires: 'live' as const, views: CUSTOM_VIEWS }]
          .filter(() => permanentOn || !!liveMatchId)
          .map(g => ({
            ...g,
            views: g.views.flatMap((v): { key: string; label: string; sub?: string }[] => {
              const slot = customTheme.slots.find(sl => sl.viewKey === v.key && sl.publishedRev > 0);
              return slot ? [{ key: v.key, label: slot.name || v.label, sub: slot.name ? v.label : undefined }] : [];
            }),
          }))
          .filter(g => g.views.length > 0)
      : VIEW_GROUPS
        .filter(g => permanentOn || (g.requires === 'schedule' ? schedMatchIds.length > 0 : !!liveMatchId))
        .map(g => ({
          ...g,
          views: g.views.filter(v => !v.themes || v.themes.includes(theme)) as { key: string; label: string; sub?: string }[],
        }))
        .filter(g => g.views.length > 0),
    [liveMatchId, schedMatchIds, theme, customTheme, permanentOn]
  );

  // The selected, permanent-link and API-live tournaments can all be older
  // than the newest TOURNAMENT_LIST_LIMIT — fetch whichever of them hasn't
  // been seen yet by id, once, so their names still resolve.
  const requestedTournamentIdsRef = useRef<Set<string>>(new Set());
  const apiTournamentId = apiRound?.tournamentId || '';
  const syncTournamentId = syncTarget?.tournamentId || '';
  useEffect(() => {
    const missing = Array.from(new Set([tournamentId, apiTournamentId, syncTournamentId]))
      .filter(id => !!id && !knownTournaments[id] && !requestedTournamentIdsRef.current.has(id));
    if (!missing.length) return;
    missing.forEach(id => requestedTournamentIdsRef.current.add(id));
    api.get('/tournaments', { params: { ids: missing.join(',') } })
      .then(r => rememberTournaments(toTournamentList(r.data)?.tournaments || []))
      .catch(() => { missing.forEach(id => requestedTournamentIdsRef.current.delete(id)); });
  }, [tournamentId, apiTournamentId, syncTournamentId, knownTournaments, rememberTournaments]);

  const selectedTournamentName = knownTournaments[tournamentId]?.tournamentName || '';
  const syncTargetName = syncTarget ? knownTournaments[syncTarget.tournamentId]?.tournamentName || 'another tournament' : '';
  const apiTournamentName = apiRound ? knownTournaments[apiRound.tournamentId]?.tournamentName || 'Unknown tournament' : '';

  return (
    <div className="hd-root" style={{ minHeight: '100vh', background: '#0B0C0E' }}>
      <style>{STYLES}</style>
      <div className="hd-glow" />

      <Navbar
        active="hud"
        brandText="OVERLAY CONTROL"
        tournamentId={tournamentId}
        roundId={roundId}
        matchId={liveMatchId ?? undefined}
        matchLabel={liveMatchObj ? `Match ${liveMatchObj.matchNo ?? liveMatchObj._matchNo ?? '?'}` : undefined}
        refreshSignal={pollingKey}
      />

      <div className="hd-page">
        <div className="hd-header-row">
          <div>
            <div className="hd-eyebrow" style={{ marginBottom: 8 }}>
              <span className="hd-eyebrow-dot" /> BROADCAST OVERLAYS
            </div>
            <h1 className="hd-orb" style={{ fontSize: 26, fontWeight: 800, color: '#F4F2EE', letterSpacing: '-0.01em', marginBottom: 6, textTransform: 'uppercase' }}>
              Send an overlay live
            </h1>
            <p style={{ color: '#93959C', fontSize: 14, maxWidth: 460 }}>
              Follow the steps below in order — pick a round, pick a match, then open the overlay you need.
            </p>
          </div>
          <div className="hd-status-row">
            <div className="hd-status">
              <span className="hd-status-dot" style={{ background: liveMatchId ? '#4ADE80' : '#24262B' }} />
              <span className="hd-mono" style={{ fontSize: 10, color: '#55565C', letterSpacing: '1px' }}>LIVE</span>
              <span className="hd-orb" style={{ fontSize: 13, fontWeight: 700, color: liveMatchId ? '#4ADE80' : '#55565C' }}>
                {liveMatchObj ? `Match ${liveMatchObj.matchNo ?? liveMatchObj._matchNo ?? '?'}` : 'None'}
              </span>
            </div>
            <div className="hd-status">
              <span className="hd-status-dot" style={{ background: schedMatchIds.length ? '#E11D2E' : '#24262B' }} />
              <span className="hd-mono" style={{ fontSize: 10, color: '#55565C', letterSpacing: '1px' }}>SCHEDULE</span>
              <span className="hd-orb" style={{ fontSize: 13, fontWeight: 700, color: schedMatchIds.length ? '#E11D2E' : '#55565C' }}>
                {schedMatchIds.length ? `${schedMatchIds.length} matches` : 'None'}
              </span>
            </div>
          </div>
        </div>

        {tournamentTotal === 0 && !tournamentQuery ? (
          <div className="hd-empty">
            <h3 className="hd-orb" style={{ fontSize: 15, color: '#F4F2EE', marginBottom: 6, textTransform: 'uppercase' }}>No tournaments yet</h3>
            <p style={{ color: '#93959C', fontSize: 13 }}>Create a tournament first, then come back here to control its overlays.</p>
          </div>
        ) : (
          <>
            {apiRound && (
              <button className="hd-api-banner" onClick={jumpToApiRound} disabled={jumpingToApiRound}>
                <span className="hd-api-banner-left">
                  <span className="hd-api-banner-dot hd-dot" />
                  <span className="hd-api-banner-text">
                    <span className="hd-api-banner-label">API live</span>
                    <span className="hd-api-banner-name">{apiTournamentName} — {apiRound.roundName}</span>
                  </span>
                </span>
                <span className="hd-api-banner-cta">{jumpingToApiRound ? 'LOADING…' : 'JUMP IN →'}</span>
              </button>
            )}

            {/* STEP 1 — Tournament & round */}
            <div className="hd-step">
              <div className="hd-step-num-wrap">
                <div className={`hd-step-num ${step1Done ? 'done' : ''}`}>{step1Done ? <FaCheckCircle size={13} /> : '01'}</div>
                <div className="hd-step-line" />
              </div>
              <div className="hd-step-body">
                <div className="hd-step-card">
                  <div className="hd-step-title">Choose tournament &amp; round</div>
                  <div className="hd-step-sub">This tells the HUD which matches to load.</div>

                  <TournamentSearch onQueryChange={setTournamentQuery} />
                  {tournamentQuery ? (
                    <div className="hd-search-count">
                      {tournaments.length === 0
                        ? 'No tournaments match'
                        : `${tournaments.length}${tournaments.length >= TOURNAMENT_LIST_LIMIT ? '+' : ''} tournament${tournaments.length === 1 ? '' : 's'} match`}
                    </div>
                  ) : tournamentTotal > tournaments.length && (
                    <div className="hd-search-count">
                      Latest {tournaments.length} of {tournamentTotal} — search to find older ones
                    </div>
                  )}

                  <div className="hd-select-row">
                    <div>
                      <label className="hd-field-label" htmlFor="hd-tournament">Tournament</label>
                      <select id="hd-tournament" className="hd-select" value={tournamentId} onChange={e => handleTournamentChange(e.target.value)}>
                        <option value="">Select a tournament…</option>
                        {filteredTournaments.map(t => <option key={t._id} value={t._id}>{t.tournamentName}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="hd-field-label" htmlFor="hd-round">
                        Round {roundsLoading && <span className="hd-spinner" />}
                      </label>
                      <select id="hd-round" className="hd-select" value={roundId} disabled={!tournamentId || roundsLoading} onChange={e => handleRoundChange(e.target.value)}>
                        <option value="">
                          {!tournamentId ? 'Choose a tournament first' : roundsLoading ? 'Loading rounds…' : 'Select a round…'}
                        </option>
                        {rounds.map(r => <option key={r._id} value={r._id}>{r.roundName}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* STEP 2 — Match */}
            <div className="hd-step">
              <div className="hd-step-num-wrap">
                <div className={`hd-step-num ${step2Done ? 'done' : ''}`}>{step2Done ? <FaCheckCircle size={13} /> : '02'}</div>
                <div className="hd-step-line" />
              </div>
              <div className="hd-step-body">
                <div className={`hd-step-card ${step1Done ? '' : 'locked'}`}>
                  <div className="hd-step-title">Choose a match</div>
                  <div className="hd-step-sub">
                    {!step1Done
                      ? 'Finish step 1 first.'
                      : matchesLoading
                        ? 'Loading matches…'
                        : `${matches.length} match${matches.length === 1 ? '' : 'es'} in ${selectedTournamentName}`}
                  </div>

                  {step1Done && !matchesLoading && matches.length === 0 && (
                    <div className="hd-note">This round has no matches yet.</div>
                  )}

                  {matches.length > 0 && (
                    <>
                      <div className="hd-chip-group">
                        <div className="hd-chip-hdr">
                          <FaBroadcastTower size={11} style={{ color: '#4ADE80' }} />
                          <span className="hd-mono hd-chip-hdr-label" style={{ color: '#4ADE80' }}>Live now</span>
                          <span className="hd-chip-hdr-sub">— pick one match</span>
                        </div>
                        <div className="hd-chips">
                          {matches.map(m => {
                            const on = liveMatchId === m._id;
                            return (
                              <div key={m._id} className={`hd-chip${on ? ' on-live' : ''}`} onClick={() => toggleLiveMatch(m._id, !on)}>
                                Match {m.matchNo ?? m._matchNo ?? '?'}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="hd-chip-group">
                        <div className="hd-chip-hdr">
                          <FaCalendarAlt size={11} style={{ color: '#E11D2E' }} />
                          <span className="hd-mono hd-chip-hdr-label" style={{ color: '#E11D2E' }}>Schedule</span>
                          <span className="hd-chip-hdr-sub">— pick any number of matches</span>
                        </div>
                        <div className="hd-chips">
                          {matches.map(m => {
                            const on = schedMatchIds.includes(m._id);
                            return (
                              <div key={`s-${m._id}`} className={`hd-chip${on ? ' on-sched' : ''}`} onClick={() => toggleSchedMatch(m._id, !on)}>
                                Match {m.matchNo ?? m._matchNo ?? '?'}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* STEP 3 — Theme */}
            <div className="hd-step">
              <div className="hd-step-num-wrap">
                <div className="hd-step-num done"><FaCheckCircle size={13} /></div>
                <div className="hd-step-line" />
              </div>
              <div className="hd-step-body">
                <div className="hd-step-card">
                  <div className="hd-step-title">Pick a theme</div>
                  <div className="hd-step-sub">Applies to every overlay you open below. Defaults to Theme1.</div>
                  <div className="hd-theme-row">
                    {THEMES.map(th => (
                      <button
                        key={th}
                        className={`hd-theme-btn ${!customTheme && theme === th ? 'on' : ''}`}
                        disabled={!tournamentId}
                        onClick={() => tournamentId && setThemeMap(p => ({ ...p, [tournamentId]: th }))}
                      >
                        {th}
                      </button>
                    ))}
                    {customThemes.map(ct => (
                      <button
                        key={ct._id}
                        className={`hd-theme-btn ${customTheme?._id === ct._id ? 'on' : ''}`}
                        disabled={!tournamentId}
                        title={`${ct.label} — built in the Designer`}
                        data-custom-theme={ct.label}
                        onClick={() => tournamentId && setThemeMap(p => ({ ...p, [tournamentId]: `custom:${ct._id}` }))}
                      >
                        {ct.name || ct.label}
                      </button>
                    ))}
                    <button
                      className="hd-theme-btn"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderStyle: 'dashed' }}
                      title="Import a theme file (.sstheme) into your account"
                      onClick={() => setImportOpen(true)}
                    >
                      <FaFileImport size={11} /> IMPORT THEME
                    </button>
                  </div>
                  {importNote && <div className="hd-step-sub" style={{ marginTop: 10, marginBottom: 0 }}>{importNote}</div>}
                </div>
              </div>
            </div>

            {/* STEP 4 — Overlays */}
            <div className="hd-step">
              <div className="hd-step-num-wrap">
                <div className={`hd-step-num ${step4Open ? 'done' : ''}`}>{step4Open ? <FaCheckCircle size={13} /> : '04'}</div>
              </div>
              <div className="hd-step-body">
                <div className={`hd-step-card ${step1Done || permanentOn ? '' : 'locked'}`}>
                  <div className="hd-step-title">Open an overlay</div>
                  <div className="hd-step-sub">
                    {permanentOn
                      ? 'Click a tile to open it, or its link icon to copy the permanent link for OBS.'
                      : step2Done ? 'Click any tile to open it in a new tab.' : 'Pick a live match or schedule matches in step 2 first.'}
                  </div>

                  {(step1Done || permanentOn) && (
                    <div style={{ marginTop: 16 }}>
                      <div className="hd-data-link-row">
                        {liveMatchId && (
                          <button className="hd-data-link-btn" onClick={openDataLink}>
                            Copy Data Link
                          </button>
                        )}
                        <button className="hd-data-link-btn" onClick={() => navigate('/designer')} title="Build a custom overlay in the Designer">
                          <FaPencilRuler size={12} /> DESIGNER
                        </button>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={permanentOn}
                          className={`hd-switch ${permanentOn ? 'on' : ''}`}
                          onClick={togglePermanent}
                          disabled={syncBusy || (!permanentOn && !step1Done)}
                          title={permanentOn
                            ? 'Switch off: tiles go back to links for one tournament / round / match'
                            : 'Give every overlay one permanent link that always shows the round picked here'}
                        >
                          <span className="hd-switch-track"><span className="hd-switch-knob" /></span>
                          PERMANENT LINKS
                        </button>
                        {permanentOn && (
                          <div className="hd-sync-note">
                            {apiRound && syncTarget!.roundId === apiRound.roundId
                              ? <>Permanent links are on and show the API round ({apiTournamentName} — {apiRound.roundName}) and its selected match. Enabling the API on another round moves them there at once.</>
                              : syncTarget!.tournamentId === tournamentId && syncTarget!.roundId === roundId
                              ? 'Permanent links are on and show this round. Paste them into OBS once — picking another round here moves them all.'
                              : step1Done
                                ? 'Moving the permanent links to this round…'
                                : <>Permanent links are on and show {syncTargetName}. Pick a tournament and round above to move them.</>}
                          </div>
                        )}
                      </div>
                      {customTheme && visibleGroups.length === 0 && (permanentOn || liveMatchId) && (
                        <div className="hd-step-sub" style={{ marginBottom: 12 }}>
                          No published layouts in {customTheme.name || customTheme.label} yet — open the DESIGNER, publish a layout and add it to this theme.
                        </div>
                      )}
                      {visibleGroups.map(group => (
                        <OverlayGroup
                          key={group.id}
                          group={group}
                          onTileClick={handleTileClick}
                          onCopy={permanentOn ? copyTileLink : undefined}
                          copiedId={copiedTile}
                          pagers={rankingPagers}
                        />
                      ))}
                      {(permanentOn || liveMatchId) && (
                        <OverlayGroup group={OBSERVER_GROUP} onTileClick={handleTileClick} onCopy={copyTileLink} copiedId={copiedTile} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      {dataLinkOpen && (
        <DataLinkModal
          url={dataLinkUrl}
          docsUrl={dataLinkDocsUrl}
          copied={dataLinkCopied}
          onCopy={copyDataLink}
          onClose={closeDataLink}
          inputRef={dataLinkInputRef}
          tournamentId={tournamentId}
          roundId={roundId}
          jsonLoading={dataLinkJsonLoading}
          jsonData={dataLinkJsonData}
          jsonError={dataLinkJsonError}
          onShowJson={showDataLinkJson}
        />
      )}
      {importOpen && <ImportThemeDialog onClose={() => setImportOpen(false)} onImported={onThemeImported} />}
    </div>
  );
};

export default DisplayHud;