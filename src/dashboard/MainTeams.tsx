import React, {
  useState, useEffect, useRef, ChangeEvent, FormEvent,
  useCallback, useMemo, useTransition, memo
} from 'react';
import {
  FaTrash, FaEdit, FaUpload, FaUsers,
  FaSearch, FaTimes, FaPlus, FaCheck, FaPaste
} from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import Papa from 'papaparse';
import api from '../login/api.tsx';
import { uploadToCloudinary } from '../utils/cloudinaryUpload.tsx';
import { getOrFetch, setCache, removeCache } from './cache';
import Navbar from './Navbar';

const TEAMS_LIST_CACHE_KEY = 'cache:v1:teams:list';
const teamByIdKey = (teamId: string) => `cache:v1:teams:byId:${teamId}`;

interface Player {
  _id?: string;
  playerName: string;
  playerId?: string;
  photo?: string;
}

interface Team {
  _id: string;
  teamFullName: string;
  teamTag: string;
  teamFlag?: string;
  logo?: string;
  players: Player[];
  // Provided by the list endpoint (getAllTeams), which does NOT send the
  // full players array for perf reasons — just a count. Detail/edit fetches
  // (getTeamById) return the real `players` array, which we also keep in
  // sync here once loaded.
  playersCount?: number;
}

interface TeamForm {
  teamFullName: string;
  teamTag: string;
  logo: string;
  teamFlag: string;
}

const EMPTY_FORM: TeamForm = { teamFullName: '', teamTag: '', logo: '', teamFlag: '' };
const EMPTY_PLAYER: Player = { playerName: '', playerId: '', photo: '' };

// ── CSV bulk import ──────────────────────────────────────────────────────────
// Mirrors the backend's exact per-player rules (teams.controller.js
// PLAYER_ID_FORMAT / validatePlayerIds) so bad rows are caught in the
// preview instead of failing an otherwise-good team server-side.
const CSV_PLAYER_ID_FORMAT = /^\d{5,20}$/;
const CSV_REQUIRED_COLUMNS = ['team_name', 'team_tag', 'player_name', 'player_uid'];

interface CsvRow {
  team_name?: string;
  team_tag?: string;
  team_logo_url?: string;
  team_flag_url?: string;
  player_name?: string;
  player_uid?: string;
  player_photo_url?: string;
}

interface ParsedTeamGroup {
  teamFullName: string;
  teamTag: string;
  logo: string;
  teamFlag: string;
  players: Player[];
}

interface BulkImportResult {
  createdCount: number;
  failedCount: number;
  created: Team[];
  failed: { teamFullName: string; teamTag: string; reason: string }[];
}

// Groups CSV rows (one row per player, team columns repeated) into one entry
// per team, keyed by teamTag — the field with a unique index on the backend,
// so grouping matches what the backend actually treats as team identity.
function parseCsvRows(rows: CsvRow[]): { groups: ParsedTeamGroup[]; warnings: string[] } {
  const groups = new Map<string, ParsedTeamGroup>();
  const warnings: string[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2; // +1 for 0-index, +1 for the header row
    const teamName = (row.team_name || '').trim();
    const teamTag = (row.team_tag || '').trim();
    const playerName = (row.player_name || '').trim();
    const playerUid = (row.player_uid || '').trim();

    if (!teamName || !teamTag) {
      warnings.push(`Row ${rowNum}: missing team_name/team_tag, row skipped`);
      return;
    }

    let group = groups.get(teamTag);
    if (!group) {
      group = {
        teamFullName: teamName,
        teamTag,
        logo: (row.team_logo_url || '').trim(),
        teamFlag: (row.team_flag_url || '').trim(),
        players: [],
      };
      groups.set(teamTag, group);
    } else if (group.teamFullName !== teamName) {
      warnings.push(`Row ${rowNum}: team_name "${teamName}" doesn't match "${group.teamFullName}" already seen for tag "${teamTag}" — kept the first name`);
    }

    if (!playerName) {
      warnings.push(`Row ${rowNum}: missing player_name, player skipped`);
      return;
    }
    if (!CSV_PLAYER_ID_FORMAT.test(playerUid)) {
      warnings.push(`Row ${rowNum}: player_uid "${playerUid}" for "${playerName}" isn't a valid PUBG UID (digits only, 5-20 chars), player skipped`);
      return;
    }
    if (group.players.some(p => p.playerId === playerUid)) {
      warnings.push(`Row ${rowNum}: player_uid "${playerUid}" is already used by another player on team "${teamTag}" in this file, player skipped`);
      return;
    }

    group.players.push({
      playerName,
      playerId: playerUid,
      photo: (row.player_photo_url || '').trim(),
    });
  });

  return { groups: Array.from(groups.values()), warnings };
}

// ── CSV bulk-search (separate from the import flow above — 2 columns,
// no player rows, header row optional) ──────────────────────────────────
interface BulkSearchQueryRow { teamName: string; teamTag: string; }
interface BulkSearchResultRow { teamName: string; teamTag: string; matches: Team[]; truncated?: boolean; }
interface BulkSearchResponse { results: BulkSearchResultRow[]; matchedRows: number; unmatchedRows: number; totalTeamsFound: number; }
const MAX_BULK_SEARCH_ROWS = 1000; // mirrors the backend's cap so the UI can warn before the request 400s

// Aggressive match key: lowercase and strip ALL whitespace (not just the
// edges), mirroring the backend's bulkSearchTeams matching — keeps the
// in-modal "search within results" filter consistent with what the server
// already matched, so spacing differences don't hide a result here either.
const normalizeForMatch = (s: string) => s.toLowerCase().replace(/\s+/g, '');

// Auto-detects an optional header row (col0 ~ "team name"/"team_name",
// col1 ~ "team tag"/"team_tag") — the feature's own sample CSV had none,
// so parsing must work both with and without one.
const HEADER_NAME_RE = /^team[\s_]*name$/i;
const HEADER_TAG_RE = /^team[\s_]*tag$/i;

function parseBulkSearchRows(rows: string[][]): { queries: BulkSearchQueryRow[]; truncatedCount: number } {
  let data = rows;
  if (data.length && HEADER_NAME_RE.test((data[0][0] || '').trim()) && HEADER_TAG_RE.test((data[0][1] || '').trim())) {
    data = data.slice(1);
  }
  const queries = data
    .map(r => ({ teamName: (r[0] || '').trim(), teamTag: (r[1] || '').trim() }))
    .filter(r => r.teamName || r.teamTag);
  return { queries: queries.slice(0, MAX_BULK_SEARCH_ROWS), truncatedCount: Math.max(0, queries.length - MAX_BULK_SEARCH_ROWS) };
}

// ── Design system ────────────────────────────────────────────────────────────
// PERF NOTES (read before touching this file again):
// - No setInterval/rAF loops anywhere in this file. A 30fps timecode ticker
//   used to live in TopNav and forced a full re-render of the nav (and
//   anything under it) 30x/second, forever — that was the actual jank
//   source, not CSS. Do not reintroduce a polling/ticking clock here.
// - No CSS keyframe animations. No continuous transitions. Hover states use
//   instant property swaps (no `transition`) so there's zero animation work
//   on interaction, matching the "no animation" requirement.
// - The nav uses a solid background instead of backdrop-filter: blur(). A
//   blurred sticky element repaints its blur every scroll frame — solid bg
//   is functionally identical here (nothing meaningful scrolls under it)
//   and costs nothing.
//
// DATA NOTES (read before touching fetch/search logic again):
// - The list endpoint (getAllTeams) intentionally returns `playersCount`
//   instead of the full `players` array, for performance on big rosters.
//   Any UI that needs to show "how many players" for a card in the LIST
//   must read `playersCount`, not `players.length` — the list-loaded
//   `players` array is always `[]` until that specific team's detail is
//   fetched (via openDetail/openEdit).
// - Search is server-side (backend already supports ?search=&page=&limit=).
//   Do not filter `teams` client-side against a partially-loaded page —
//   that's how teams outside the first page silently "go missing" from
//   search results.
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

.tm-root * { box-sizing: border-box; }
.tm-root { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
.tm-orb { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif !important; }
.tm-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

.tm-hex {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background: radial-gradient(ellipse 80% 40% at 50% 0%, rgba(225,29,46,0.07), transparent);
}

/* ── Tags / badges ── */
.tm-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #93959C; letter-spacing: 0.22em; text-transform: uppercase; }
.tm-eyebrow-dot { width: 6px; height: 6px; background: #E11D2E; flex-shrink: 0; }
.tm-pill { display: inline-flex; align-items: center; background: rgba(225,29,46,0.08); border: 1px solid rgba(225,29,46,0.3); color: #E11D2E; font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 3px 9px; letter-spacing: 0.05em; font-weight: 700; }

/* ── Buttons ── */
.tm-btn-primary { display: inline-flex; align-items: center; gap: 8px; background: #E11D2E; color: #fff; border: 1px solid #E11D2E; font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; padding: 12px 22px; cursor: pointer; }
.tm-btn-primary:hover { background: #F4F2EE; color: #0B0C0E; border-color: #F4F2EE; }
.tm-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.tm-btn-ghost { background: transparent; color: #93959C; border: 1px solid #24262B; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600; padding: 10px 18px; cursor: pointer; }
.tm-btn-ghost:hover { border-color: #E11D2E; color: #F4F2EE; }
.tm-btn-outline { background: transparent; color: #E11D2E; border: 1px solid rgba(225,29,46,0.35); font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; padding: 9px 16px; cursor: pointer; }
.tm-btn-outline:hover { background: rgba(225,29,46,0.1); }
.tm-btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }
.tm-icon-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: #131418; border: 1px solid #24262B; color: #93959C; cursor: pointer; flex-shrink: 0; }
.tm-icon-btn:hover { border-color: #F4F2EE; color: #F4F2EE; }
.tm-icon-btn.danger:hover { border-color: #E11D2E; color: #E11D2E; }
.tm-icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* ── Inputs ── */
.tm-input { width: 100%; padding: 11px 13px; background: #0B0C0E; border: 1px solid #24262B; color: #F4F2EE; font-family: 'Inter', sans-serif; font-size: 14px; outline: none; }
.tm-input::placeholder { color: #55565C; }
.tm-input:focus { border-color: #E11D2E; }

/* ── Page layout ── */
.tm-page { max-width: 1280px; margin: 0 auto; padding: 36px 20px 64px; position: relative; z-index: 1; }
.tm-header-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
.tm-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
.tm-search-wrap { position: relative; flex: 1; min-width: 220px; max-width: 380px; }
.tm-search-ic { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #55565C; font-size: 12px; pointer-events: none; }
.tm-stats { display: flex; gap: 10px; margin-left: auto; flex-wrap: wrap; }
.tm-stat { background: #131418; border: 1px solid #24262B; padding: 8px 14px; display: flex; align-items: baseline; gap: 7px; }

/* ── Team card grid ── */
.tm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.tm-card { position: relative; background: #131418; border: 1px solid #24262B; padding: 18px; cursor: pointer; }
.tm-card:hover { border-color: rgba(225,29,46,0.4); }
.tm-card-top { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
.tm-card-logo { width: 48px; height: 48px; object-fit: cover; border: 1px solid #24262B; flex-shrink: 0; }
.tm-card-logo-ph { width: 48px; height: 48px; flex-shrink: 0; background: #0B0C0E; border: 1px solid #24262B; display: flex; align-items: center; justify-content: center; }
.tm-card-actions { position: absolute; top: 14px; right: 14px; display: flex; gap: 6px; }
.tm-card-tag { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #E11D2E; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; }
.tm-card-flag { width: 18px; height: 13px; object-fit: cover; border: 1px solid #24262B; }
.tm-card-name { font-family: 'Space Grotesk', sans-serif; font-size: 16px; font-weight: 700; color: #F4F2EE; text-transform: uppercase; line-height: 1.25; margin-top: 4px; }
.tm-card-foot { display: flex; align-items: center; justify-content: space-between; padding-top: 14px; border-top: 1px solid #24262B; }
.tm-card-count { display: flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #93959C; }
.tm-card-view { font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600; color: #55565C; }
.tm-card:hover .tm-card-view { color: #E11D2E; }

/* ── Modals ── */
.tm-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 16px; }
.tm-modal-box { width: 100%; max-width: 640px; max-height: 90vh; overflow-y: auto; background: #0B0C0E; border: 1px solid rgba(225,29,46,0.35); box-shadow: 0 40px 80px rgba(0,0,0,0.7); }
.tm-modal-box::-webkit-scrollbar { width: 5px; }
.tm-modal-box::-webkit-scrollbar-thumb { background: rgba(225,29,46,0.35); }
.tm-modal-hdr { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px 14px; border-bottom: 1px solid #24262B; position: sticky; top: 0; background: #0B0C0E; z-index: 2; }
.tm-modal-body { padding: 20px 22px 22px; }

/* ── Player rows (detail modal) ── */
.tm-player-row { display: flex; align-items: center; gap: 10px; padding: 9px 10px; background: #131418; border: 1px solid #24262B; margin-bottom: 6px; }
.tm-player-row:hover { border-color: rgba(225,29,46,0.3); }
.tm-player-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid #24262B; flex-shrink: 0; }
.tm-player-avatar-ph { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; background: #0B0C0E; border: 1px solid #24262B; display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #E11D2E; font-weight: 700; }
.tm-checkbox { width: 17px; height: 17px; flex-shrink: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.tm-checkbox.checked { background: #E11D2E; border: 1px solid #E11D2E; }
.tm-checkbox.unchecked { background: #0B0C0E; border: 1px solid #24262B; }
.tm-checkbox.unchecked:hover { border-color: #E11D2E; }
.tm-player-info { flex: 1; min-width: 0; }
.tm-player-name { font-size: 13px; color: #F4F2EE; font-weight: 600; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tm-player-id { font-size: 10px; color: #55565C; font-family: 'JetBrains Mono', monospace; }

/* ── Player form row (create/edit modal) ── */
.tm-player-form-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: #131418; border: 1px solid #24262B; padding: 10px 12px; margin-bottom: 8px; }

/* ── Empty state ── */
.tm-empty { text-align: center; padding: 72px 24px; border: 1px dashed #24262B; }
.tm-empty-icon-wrap { width: 68px; height: 68px; border-radius: 50%; margin: 0 auto 20px; background: rgba(225,29,46,0.08); border: 1px solid rgba(225,29,46,0.3); display: flex; align-items: center; justify-content: center; }

/* ── CSV import modal ── */
.tm-import-drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 36px 20px; border: 1px dashed #24262B; cursor: pointer; text-align: center; }
.tm-import-drop:hover { border-color: rgba(225,29,46,0.5); }
.tm-import-summary { display: flex; flex-wrap: wrap; gap: 20px; padding: 12px 14px; background: #131418; border: 1px solid #24262B; }
.tm-import-summary-stat { display: flex; flex-direction: column; gap: 2px; }
.tm-import-table-wrap { max-height: 240px; overflow-y: auto; border: 1px solid #24262B; margin-top: 14px; }
.tm-import-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.tm-import-table th { position: sticky; top: 0; background: #131418; text-align: left; padding: 8px 10px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #55565C; letter-spacing: 0.05em; text-transform: uppercase; border-bottom: 1px solid #24262B; }
.tm-import-table td { padding: 7px 10px; color: #93959C; border-bottom: 1px solid #1a1b1f; }
.tm-import-table tr:last-child td { border-bottom: none; }
.tm-import-warnings { max-height: 160px; overflow-y: auto; border: 1px solid rgba(225,29,46,0.3); background: rgba(225,29,46,0.05); padding: 10px 12px 10px 26px; margin-top: 14px; font-size: 12px; color: #93959C; }
.tm-import-warnings li { margin-bottom: 4px; }
.tm-import-result-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #131418; border: 1px solid #24262B; margin-bottom: 6px; font-size: 12px; }
.tm-import-result-row.fail { border-color: rgba(225,29,46,0.35); }

/* ── CSV bulk-search modal ── */
.tm-bulksearch-list { max-height: 420px; overflow-y: auto; margin-top: 14px; }
.tm-bulksearch-row { padding: 10px 0; border-bottom: 1px solid #24262B; }
.tm-bulksearch-row:last-child { border-bottom: none; }
.tm-bulksearch-query { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #55565C; margin-bottom: 8px; }
.tm-bulksearch-match { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: #131418; border: 1px solid #24262B; margin-bottom: 6px; }

@media (max-width: 560px) {
  .tm-header-row { align-items: flex-start; flex-direction: column; }
  .tm-header-row .tm-btn-primary, .tm-header-row .tm-btn-outline { width: 100%; justify-content: center; }
  .tm-stats { width: 100%; margin-left: 0; }
  .tm-stat { flex: 1; justify-content: center; }
  .tm-grid { grid-template-columns: 1fr; }
}
`;

// ── SearchInput ───────────────────────────────────────────────────────────────
const SearchInput = memo(({ onSearchChange }: { onSearchChange: (q: string) => void }) => {
  const [localQuery, setLocalQuery] = useState('');
  const [, startTransition] = useTransition();

  useEffect(() => {
    const id = setTimeout(() => {
      startTransition(() => onSearchChange(localQuery));
    }, localQuery === '' ? 0 : 280);
    return () => clearTimeout(id);
  }, [localQuery, onSearchChange]);

  return (
    <div className="tm-search-wrap">
      <FaSearch className="tm-search-ic" />
      <input
        type="text" value={localQuery}
        onChange={e => setLocalQuery(e.target.value)}
        placeholder="Search teams by name or tag…"
        className="tm-input" style={{ paddingLeft: 34 }}
      />
    </div>
  );
});

// ── TeamCard ──────────────────────────────────────────────────────────────────
// IMPORTANT: the list endpoint only sends `playersCount`, not a real
// `players` array (that only exists once a team's detail has been fetched).
// So the card must read `playersCount` first and only fall back to
// `players.length` for teams whose detail happens to already be loaded.
const TeamCard = memo(({
  team, onOpenDetail, onEdit, onDelete, isDeleting,
}: {
  team: Team;
  onOpenDetail: (team: Team) => void;
  onEdit: (team: Team) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) => {
  const playerCount = team.playersCount ?? team.players?.length ?? 0;
  return (
    <div className="tm-card" onClick={() => onOpenDetail(team)}>
      <div className="tm-card-actions" onClick={e => e.stopPropagation()}>
        <button className="tm-icon-btn" onClick={() => onEdit(team)} aria-label="Edit team"><FaEdit size={12} /></button>
        <button className="tm-icon-btn danger" onClick={() => onDelete(team._id)} disabled={isDeleting} aria-label="Delete team"><FaTrash size={12} /></button>
      </div>

      <div className="tm-card-top">
        {team.logo
          ? <img src={team.logo} alt={team.teamFullName} className="tm-card-logo" width={48} height={48} loading="lazy" decoding="async" onError={e => e.currentTarget.src = './logo.png'} />
          : <div className="tm-card-logo-ph"><FaUsers size={18} style={{ color: '#E11D2E', opacity: 0.5 }} /></div>}
        <div style={{ minWidth: 0, paddingRight: 60 }}>
          <div className="tm-card-tag">
            [{team.teamTag}]
            {team.teamFlag && <img src={team.teamFlag} alt="" className="tm-card-flag" width={18} height={13} loading="lazy" decoding="async" onError={e => e.currentTarget.style.display = 'none'} />}
          </div>
          <div className="tm-card-name">{team.teamFullName}</div>
        </div>
      </div>

      <div className="tm-card-foot">
        <span className="tm-card-count"><FaUsers size={10} /> {playerCount} player{playerCount === 1 ? '' : 's'}</span>
        <span className="tm-card-view">View roster →</span>
      </div>
    </div>
  );
});

// ── Detail modal: view + prune roster ───────────────────────────────────────
const DetailModal: React.FC<{
  team: Team;
  loading: boolean;
  onClose: () => void;
  onEdit: (team: Team) => void;
  onDeletePlayer: (teamId: string, playerId: string) => Promise<void>;
  onDeleteSelectedPlayers: (teamId: string, playerIds: string[]) => Promise<void>;
  deletingPlayerIds: Set<string>;
}> = ({ team, loading, onClose, onEdit, onDeletePlayer, onDeleteSelectedPlayers, deletingPlayerIds }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected player(s)?`)) return;
    try { await onDeleteSelectedPlayers(team._id, Array.from(selected)); setSelected(new Set()); } catch {}
  };

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal-box" onClick={e => e.stopPropagation()}>
        <div className="tm-modal-hdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {team.logo
              ? <img src={team.logo} alt="" width={36} height={36} style={{ width: 36, height: 36, objectFit: 'cover', border: '1px solid #24262B', flexShrink: 0 }} />
              : <div style={{ width: 36, height: 36, background: '#131418', border: '1px solid #24262B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FaUsers size={15} style={{ color: '#E11D2E' }} /></div>}
            <div style={{ minWidth: 0 }}>
              <div className="tm-card-tag" style={{ fontSize: 10 }}>[{team.teamTag}]</div>
              <div className="tm-orb" style={{ fontSize: 15, fontWeight: 700, color: '#F4F2EE', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.teamFullName}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, background: 'transparent', border: '1px solid #24262B', color: '#93959C', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FaTimes size={13} />
          </button>
        </div>

        <div className="tm-modal-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
            <span className="tm-mono" style={{ fontSize: 9, color: '#55565C', letterSpacing: '2px' }}>
              ROSTER — {loading ? '…' : team.players.length}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {selected.size > 0 && (
                <button className="tm-btn-outline" style={{ fontSize: 11, padding: '6px 12px' }} onClick={handleDeleteSelected}>
                  Delete {selected.size} selected
                </button>
              )}
              <button className="tm-btn-outline" style={{ fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => { onEdit(team); onClose(); }}>
                <FaEdit size={11} /> Edit team & players
              </button>
            </div>
          </div>

          {loading ? (
            <p className="tm-mono" style={{ color: '#55565C', fontSize: 12, padding: '20px 0', letterSpacing: 1, textAlign: 'center' }}>LOADING ROSTER…</p>
          ) : (team.players?.length ?? 0) === 0 ? (
            <p className="tm-mono" style={{ color: '#55565C', fontSize: 12, padding: '20px 0', letterSpacing: 1, textAlign: 'center' }}>NO PLAYERS ADDED YET</p>
          ) : (
           (team.players ?? []).map(player => {
              const initials = player.playerName?.slice(0, 2).toUpperCase() || '??';
              const isSelected = !!player._id && selected.has(player._id);
              return (
                <div key={player._id || player.playerName} className="tm-player-row">
                  <div className={`tm-checkbox ${isSelected ? 'checked' : 'unchecked'}`} onClick={() => player._id && toggle(player._id)}>
                    {isSelected && <FaCheck size={8} color="#fff" />}
                  </div>
                  {player.photo
                    ? <img src={player.photo} alt={player.playerName} className="tm-player-avatar" width={32} height={32} loading="lazy" decoding="async" onError={e => e.currentTarget.src = './def_char.png'} />
                    : <div className="tm-player-avatar-ph">{initials}</div>}
                  <div className="tm-player-info">
                    <div className="tm-player-name">{player.playerName}</div>
                    {player.playerId && <div className="tm-player-id">#{player.playerId}</div>}
                  </div>
                  {player._id && (
                    <button className="tm-icon-btn danger" style={{ width: 28, height: 28 }} onClick={() => onDeletePlayer(team._id, player._id!)} disabled={deletingPlayerIds.has(player._id)} aria-label="Delete player">
                      <FaTrash size={10} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

// ── FormFields (shared between create + edit) ─────────────────────────────────
const FormFields = memo(({
  form, playersForm, editingTeamId,
  handleTeamInputChange, handlePlayerChange,
  addPlayerInput, removePlayerInput,
  handleSubmit, onCancel, submitting,
  handleLogoUpload, handleFlagUpload, handlePlayerPhotoUpload,
}: {
  form: TeamForm;
  playersForm: Player[];
  editingTeamId: string | null;
  handleTeamInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handlePlayerChange: (index: number, e: ChangeEvent<HTMLInputElement>) => void;
  addPlayerInput: () => void;
  removePlayerInput: (index: number) => void;
  handleSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  submitting: boolean;
  handleLogoUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  handleFlagUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  handlePlayerPhotoUpload: (index: number, e: ChangeEvent<HTMLInputElement>) => void;
}) => {
  const idPrefix = editingTeamId ? 'edit' : 'new';
  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
        <input type="text" name="teamFullName" placeholder="Team full name"
          value={form.teamFullName} onChange={handleTeamInputChange} required autoFocus
          className="tm-input" />
        <input type="text" name="teamTag" placeholder="TAG"
          value={form.teamTag} onChange={handleTeamInputChange} required
          className="tm-input" style={{ width: 100 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label htmlFor={`${idPrefix}-logo`} className="tm-input" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', width: 'auto', flex: 1 }}>
            <FaUpload size={12} style={{ color: '#E11D2E', flexShrink: 0 }} />
            <span style={{ color: '#93959C', fontSize: 13 }}>Team logo</span>
          </label>
          <input id={`${idPrefix}-logo`} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
          {form.logo && <img src={form.logo} alt="Logo" width={40} height={40} style={{ width: 40, height: 40, objectFit: 'contain', border: '1px solid #24262B', flexShrink: 0 }} loading="lazy" decoding="async" onError={e => (e.currentTarget.src = './logo.png')} />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label htmlFor={`${idPrefix}-flag`} className="tm-input" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', width: 'auto', flex: 1 }}>
            <FaUpload size={12} style={{ color: '#E11D2E', flexShrink: 0 }} />
            <span style={{ color: '#93959C', fontSize: 13 }}>Team flag</span>
          </label>
          <input id={`${idPrefix}-flag`} type="file" accept="image/*" onChange={handleFlagUpload} style={{ display: 'none' }} />
          {form.teamFlag && <img src={form.teamFlag} alt="Flag" width={40} height={40} style={{ width: 40, height: 40, objectFit: 'cover', border: '1px solid #24262B', flexShrink: 0 }} loading="lazy" decoding="async" onError={e => (e.currentTarget.src = './def_flag.avif')} />}
        </div>
      </div>

      <div className="tm-mono" style={{ fontSize: 9, color: '#E11D2E', letterSpacing: '2px', paddingTop: 4 }}>PLAYERS</div>

      {playersForm.map((player, index) => (
        <div key={player._id || index} className="tm-player-form-row">
          <input type="text" name="playerName" placeholder="Player name"
            value={player.playerName} onChange={e => handlePlayerChange(index, e)} required
            className="tm-input" style={{ flex: '1 1 150px', width: 'auto' }} />
          <input type="text" name="playerId" placeholder="ID / IGN"
            value={player.playerId ?? ''} onChange={e => handlePlayerChange(index, e)}
            className="tm-input" style={{ flex: '0 0 100px', width: 100 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label htmlFor={`${idPrefix}-photo-${index}`} className="tm-input" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', width: 'auto', padding: '10px 12px', whiteSpace: 'nowrap' }}>
              <FaUpload size={11} style={{ color: '#E11D2E', flexShrink: 0 }} />
              Photo
            </label>
            <input id={`${idPrefix}-photo-${index}`} type="file" accept="image/*" onChange={e => handlePlayerPhotoUpload(index, e)} style={{ display: 'none' }} />
            {player.photo && <img src={player.photo} alt="Preview" width={32} height={32} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid #24262B' }} loading="lazy" decoding="async" onError={e => e.currentTarget.src = './def_char.png'} />}
            {playersForm.length > 1 && (
              <button type="button" onClick={() => removePlayerInput(index)} className="tm-icon-btn danger" aria-label="Remove player"><FaTrash size={11} /></button>
            )}
          </div>
        </div>
      ))}

      <button type="button" onClick={addPlayerInput} className="tm-btn-outline" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <FaPlus size={10} /> Add player
      </button>

      <div style={{ display: 'flex', gap: 10, paddingTop: 6, borderTop: '1px solid #24262B', marginTop: 2 }}>
        <button type="button" onClick={onCancel} className="tm-btn-ghost">Cancel</button>
        <button type="submit" className="tm-btn-primary" disabled={submitting}>
          {submitting ? 'SAVING…' : editingTeamId ? 'SAVE CHANGES' : 'CREATE TEAM'}
        </button>
      </div>
    </form>
  );
});

// ── Create/Edit modal ────────────────────────────────────────────────────────
// `onSaved` reports the fully-saved team (with real players + playersCount)
// back up to the parent so the list, card, and any open detail view all stay
// in sync — this is what prevents the "edit wiped the roster" bug: we only
// ever submit players we actually loaded via getTeamById, never a stale
// empty array from the list endpoint.
const FormModal: React.FC<{
  editingTeam: Team | null;
  onClose: () => void;
  onSaved: (team: Team, isNew: boolean) => void;
}> = ({ editingTeam, onClose, onSaved }) => {
  const [form, setForm] = useState<TeamForm>(editingTeam ? {
    teamFullName: editingTeam.teamFullName,
    teamTag: editingTeam.teamTag,
    logo: editingTeam.logo || '',
    teamFlag: editingTeam.teamFlag || '',
  } : EMPTY_FORM);
  const [playersForm, setPlayersForm] = useState<Player[]>(
    editingTeam && editingTeam.players?.length ? editingTeam.players : [{ ...EMPTY_PLAYER }]
  );
  const [submitting, setSubmitting] = useState(false);

  const handleTeamInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }, []);

  const handlePlayerChange = useCallback((index: number, e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPlayersForm(prev => { const c = [...prev]; c[index] = { ...c[index], [name]: value }; return c; });
  }, []);

  const addPlayerInput = useCallback(() => setPlayersForm(prev => [...prev, { ...EMPTY_PLAYER }]), []);
  const removePlayerInput = useCallback((index: number) => setPlayersForm(prev => prev.filter((_, i) => i !== index)), []);

  const handleLogoUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try { const url = await uploadToCloudinary(file, 'teams/logos', 'team_logo'); setForm(p => ({ ...p, logo: url })); }
    catch { alert('Upload failed'); }
  }, []);

  const handleFlagUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try { const url = await uploadToCloudinary(file, 'teams/flags', 'team_flag'); setForm(prev => ({ ...prev, teamFlag: url })); }
    catch { alert('Flag upload failed'); }
  }, []);

  const handlePlayerPhotoUpload = useCallback(async (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const url = await uploadToCloudinary(file, 'players/photos', 'player_photo');
      setPlayersForm(prev => { const c = [...prev]; c[index] = { ...c[index], photo: url }; return c; });
    } catch { alert('Upload failed'); }
  }, []);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (playersForm.some(p => p.playerName.trim() === '')) { alert('Fill in all player names'); return; }
    setSubmitting(true);
    try {
      const payload = { ...form, players: playersForm };
      if (editingTeam) {
        const res = await api.put(`/teams/${editingTeam._id}`, payload);
        onSaved({ ...res.data, playersCount: res.data.players?.length ?? 0 }, false);
      } else {
        const res = await api.post('/teams', payload);
        onSaved({ ...res.data, playersCount: res.data.players?.length ?? 0 }, true);
      }
      onClose();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to save team');
    } finally {
      setSubmitting(false);
    }
  }, [form, playersForm, editingTeam, onSaved, onClose, submitting]);

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal-box" onClick={e => e.stopPropagation()}>
        <div className="tm-modal-hdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="tm-pill">{editingTeam ? 'EDIT' : 'NEW'}</span>
            <span className="tm-orb" style={{ color: '#F4F2EE', fontSize: 15, fontWeight: 700, textTransform: 'uppercase' }}>
              {editingTeam ? 'Edit team' : 'Create team'}
            </span>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, background: 'transparent', border: '1px solid #24262B', color: '#93959C', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FaTimes size={13} />
          </button>
        </div>
        <div className="tm-modal-body">
          <FormFields
            form={form} playersForm={playersForm} editingTeamId={editingTeam?._id ?? null}
            handleTeamInputChange={handleTeamInputChange} handlePlayerChange={handlePlayerChange}
            addPlayerInput={addPlayerInput} removePlayerInput={removePlayerInput}
            handleSubmit={handleSubmit} onCancel={onClose} submitting={submitting}
            handleLogoUpload={handleLogoUpload} handleFlagUpload={handleFlagUpload}
            handlePlayerPhotoUpload={handlePlayerPhotoUpload}
          />
        </div>
      </div>
    </div>
  );
};

// ── CSV bulk-import modal ────────────────────────────────────────────────────
// Second, additive entry point next to the manual "NEW TEAM" form — parses
// the CSV client-side (one row per player, team columns repeated), groups it
// into teams, and hands the whole batch to POST /teams/bulk-import in a
// single request instead of looping createTeam per row.
const ImportCsvModal: React.FC<{
  onClose: () => void;
  onImported: () => void;
}> = ({ onClose, onImported }) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [groups, setGroups] = useState<ParsedTeamGroup[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  const totalPlayers = useMemo(() => groups.reduce((s, g) => s + g.players.length, 0), [groups]);
  const previewGroups = useMemo(() => groups.slice(0, 50), [groups]);

  const handleFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after fixing it
    if (!file) return;

    setFileName(file.name);
    setParsing(true);
    setParseError(null);
    setGroups([]);
    setWarnings([]);
    setResult(null);
    setImportError(null);

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setParsing(false);
        const fields = results.meta.fields || [];
        const missing = CSV_REQUIRED_COLUMNS.filter(c => !fields.includes(c));
        if (missing.length) {
          setParseError(`CSV is missing required column(s): ${missing.join(', ')}`);
          return;
        }
        const { groups: parsedGroups, warnings: parsedWarnings } = parseCsvRows(results.data);
        setGroups(parsedGroups);
        setWarnings(parsedWarnings);
      },
      error: (err: Error) => {
        setParsing(false);
        setParseError(err.message || 'Failed to parse CSV file');
      },
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (importing || groups.length === 0) return;
    setImporting(true);
    setImportError(null);
    try {
      const payload = {
        teams: groups.map(g => ({
          teamFullName: g.teamFullName,
          teamTag: g.teamTag,
          logo: g.logo,
          teamFlag: g.teamFlag,
          players: g.players,
        })),
      };
      const res = await api.post('/teams/bulk-import', payload);
      setResult(res.data);
      onImported();
    } catch (err: any) {
      setImportError(err?.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [groups, importing, onImported]);

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal-box" onClick={e => e.stopPropagation()}>
        <div className="tm-modal-hdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="tm-pill">CSV</span>
            <span className="tm-orb" style={{ color: '#F4F2EE', fontSize: 15, fontWeight: 700, textTransform: 'uppercase' }}>
              Import teams from CSV
            </span>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, background: 'transparent', border: '1px solid #24262B', color: '#93959C', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FaTimes size={13} />
          </button>
        </div>
        <div className="tm-modal-body">
          {result ? (
            <>
              <div className="tm-import-summary">
                <div className="tm-import-summary-stat">
                  <span className="tm-orb" style={{ fontSize: 20, fontWeight: 800, color: '#F4F2EE' }}>{result.createdCount}</span>
                  <span className="tm-mono" style={{ fontSize: 10, color: '#55565C' }}>TEAMS CREATED</span>
                </div>
                {result.failedCount > 0 && (
                  <div className="tm-import-summary-stat">
                    <span className="tm-orb" style={{ fontSize: 20, fontWeight: 800, color: '#E11D2E' }}>{result.failedCount}</span>
                    <span className="tm-mono" style={{ fontSize: 10, color: '#55565C' }}>FAILED</span>
                  </div>
                )}
              </div>

              {result.failed.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  {result.failed.map((f, i) => (
                    <div key={i} className="tm-import-result-row fail">
                      <FaTimes size={11} style={{ color: '#E11D2E', flexShrink: 0 }} />
                      <span style={{ color: '#F4F2EE', fontWeight: 600 }}>{f.teamFullName} ({f.teamTag})</span>
                      <span style={{ color: '#93959C' }}>— {f.reason}</span>
                    </div>
                  ))}
                </div>
              )}

              <button type="button" className="tm-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={onClose}>
                DONE
              </button>
            </>
          ) : (
            <>
              <label htmlFor="csv-import-file" className="tm-import-drop">
                <FaUpload size={20} style={{ color: '#E11D2E' }} />
                <span style={{ color: '#F4F2EE', fontWeight: 600, fontSize: 14 }}>
                  {fileName || 'Click to choose a CSV file'}
                </span>
                <span style={{ color: '#55565C', fontSize: 12 }}>
                  Columns: team_name, team_tag, team_logo_url, team_flag_url, player_name, player_uid, player_photo_url
                </span>
              </label>
              <input id="csv-import-file" type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFile} />

              {parsing && <p style={{ color: '#93959C', fontSize: 13, marginTop: 14 }}>Parsing…</p>}

              {parseError && (
                <p style={{ color: '#E11D2E', fontSize: 13, marginTop: 14 }}>{parseError}</p>
              )}

              {!parsing && !parseError && fileName && (
                <>
                  <div className="tm-import-summary" style={{ marginTop: 16 }}>
                    <div className="tm-import-summary-stat">
                      <span className="tm-orb" style={{ fontSize: 20, fontWeight: 800, color: '#F4F2EE' }}>{groups.length}</span>
                      <span className="tm-mono" style={{ fontSize: 10, color: '#55565C' }}>TEAMS</span>
                    </div>
                    <div className="tm-import-summary-stat">
                      <span className="tm-orb" style={{ fontSize: 20, fontWeight: 800, color: '#F4F2EE' }}>{totalPlayers}</span>
                      <span className="tm-mono" style={{ fontSize: 10, color: '#55565C' }}>PLAYERS</span>
                    </div>
                    {warnings.length > 0 && (
                      <div className="tm-import-summary-stat">
                        <span className="tm-orb" style={{ fontSize: 20, fontWeight: 800, color: '#E11D2E' }}>{warnings.length}</span>
                        <span className="tm-mono" style={{ fontSize: 10, color: '#55565C' }}>WARNINGS</span>
                      </div>
                    )}
                  </div>

                  {groups.length > 0 && (
                    <div className="tm-import-table-wrap">
                      <table className="tm-import-table">
                        <thead>
                          <tr><th>Team</th><th>Tag</th><th>Players</th></tr>
                        </thead>
                        <tbody>
                          {previewGroups.map(g => (
                            <tr key={g.teamTag}>
                              <td style={{ color: '#F4F2EE' }}>{g.teamFullName}</td>
                              <td className="tm-mono">{g.teamTag}</td>
                              <td>{g.players.length}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {groups.length > previewGroups.length && (
                        <p style={{ color: '#55565C', fontSize: 11, padding: '6px 10px' }}>+{groups.length - previewGroups.length} more</p>
                      )}
                    </div>
                  )}

                  {warnings.length > 0 && (
                    <ul className="tm-import-warnings">
                      {warnings.slice(0, 50).map((w, i) => <li key={i}>{w}</li>)}
                      {warnings.length > 50 && <li>+{warnings.length - 50} more warnings</li>}
                    </ul>
                  )}

                  {importError && <p style={{ color: '#E11D2E', fontSize: 13, marginTop: 14 }}>{importError}</p>}

                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    <button type="button" className="tm-btn-ghost" onClick={onClose}>CANCEL</button>
                    <button
                      type="button"
                      className="tm-btn-primary"
                      style={{ flex: 1, justifyContent: 'center' }}
                      disabled={groups.length === 0 || importing}
                      onClick={handleImport}
                    >
                      {importing ? 'IMPORTING…' : `IMPORT ${groups.length} TEAM${groups.length === 1 ? '' : 'S'}`}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const BulkSearchModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [csvText, setCsvText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [response, setResponse] = useState<BulkSearchResponse | null>(null);
  const [filterText, setFilterText] = useState('');

  // Parsing pasted text is synchronous (no File I/O), so this just re-derives
  // on every keystroke instead of needing separate parsing/fileName state.
  const { queryRows, truncatedCount } = useMemo(() => {
    if (!csvText.trim()) return { queryRows: [] as BulkSearchQueryRow[], truncatedCount: 0 };
    const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: true });
    const { queries, truncatedCount: tc } = parseBulkSearchRows(parsed.data);
    return { queryRows: queries, truncatedCount: tc };
  }, [csvText]);

  const previewRows = useMemo(() => queryRows.slice(0, 50), [queryRows]);

  const handleTextChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setCsvText(e.target.value);
    setResponse(null);
    setSearchError(null);
    setFilterText('');
  }, []);

  const handleSearch = useCallback(async () => {
    if (searching || queryRows.length === 0) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await api.post<BulkSearchResponse>('/teams/bulk-search', { queries: queryRows });
      setResponse(res.data);
    } catch (err: any) {
      setSearchError(err?.response?.data?.error || 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [queryRows, searching]);

  const filteredResults = useMemo(() => {
    if (!response) return [];
    const q = normalizeForMatch(filterText);
    if (!q) return response.results;
    return response.results.filter(r =>
      normalizeForMatch(r.teamName).includes(q) ||
      normalizeForMatch(r.teamTag).includes(q) ||
      r.matches.some(m => normalizeForMatch(m.teamFullName).includes(q) || normalizeForMatch(m.teamTag).includes(q))
    );
  }, [response, filterText]);

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal-box" onClick={e => e.stopPropagation()}>
        <div className="tm-modal-hdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="tm-pill">BULK</span>
            <span className="tm-orb" style={{ color: '#F4F2EE', fontSize: 15, fontWeight: 700, textTransform: 'uppercase' }}>
              Bulk search teams
            </span>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, background: 'transparent', border: '1px solid #24262B', color: '#93959C', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FaTimes size={13} />
          </button>
        </div>
        <div className="tm-modal-body">
          {response ? (
            <>
              <div className="tm-import-summary">
                <div className="tm-import-summary-stat">
                  <span className="tm-orb" style={{ fontSize: 20, fontWeight: 800, color: '#F4F2EE' }}>{response.results.length}</span>
                  <span className="tm-mono" style={{ fontSize: 10, color: '#55565C' }}>ROWS SEARCHED</span>
                </div>
                <div className="tm-import-summary-stat">
                  <span className="tm-orb" style={{ fontSize: 20, fontWeight: 800, color: '#F4F2EE' }}>{response.matchedRows}</span>
                  <span className="tm-mono" style={{ fontSize: 10, color: '#55565C' }}>ROWS MATCHED</span>
                </div>
                <div className="tm-import-summary-stat">
                  <span className="tm-orb" style={{ fontSize: 20, fontWeight: 800, color: '#F4F2EE' }}>{response.totalTeamsFound}</span>
                  <span className="tm-mono" style={{ fontSize: 10, color: '#55565C' }}>TEAMS FOUND</span>
                </div>
              </div>

              <div className="tm-search-wrap" style={{ maxWidth: 'none', marginTop: 14 }}>
                <FaSearch className="tm-search-ic" />
                <input
                  type="text" value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  placeholder="Search within results…"
                  className="tm-input" style={{ paddingLeft: 34 }}
                />
              </div>

              <div className="tm-bulksearch-list">
                {filteredResults.map((row, i) => (
                  <div key={i} className="tm-bulksearch-row">
                    <div className="tm-bulksearch-query">{row.teamName}{row.teamTag ? ` [${row.teamTag}]` : ''}</div>
                    {row.matches.length === 0 ? (
                      <div className="tm-import-result-row fail">
                        <FaTimes size={11} style={{ color: '#E11D2E', flexShrink: 0 }} />
                        <span style={{ color: '#93959C' }}>No match found</span>
                      </div>
                    ) : (
                      <>
                        {row.matches.map(m => (
                          <div key={m._id} className="tm-bulksearch-match">
                            {m.logo
                              ? <img src={m.logo} alt={m.teamFullName} className="tm-card-logo" width={32} height={32} loading="lazy" decoding="async" onError={e => e.currentTarget.src = './logo.png'} />
                              : <div className="tm-card-logo-ph" style={{ width: 32, height: 32 }}><FaUsers size={13} style={{ color: '#E11D2E', opacity: 0.5 }} /></div>}
                            <span style={{ color: '#F4F2EE', fontWeight: 600, fontSize: 13 }}>{m.teamFullName}</span>
                            <span className="tm-mono" style={{ color: '#E11D2E', fontSize: 11 }}>[{m.teamTag}]</span>
                            <span className="tm-mono" style={{ color: '#55565C', fontSize: 11, marginLeft: 'auto' }}>{m.playersCount ?? m.players?.length ?? 0} players</span>
                          </div>
                        ))}
                        {row.truncated && (
                          <p style={{ color: '#55565C', fontSize: 11 }}>+more matches — refine this row's name/tag</p>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>

              <button type="button" className="tm-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={onClose}>
                DONE
              </button>
            </>
          ) : (
            <>
              <label htmlFor="csv-bulksearch-text" style={{ display: 'block', color: '#F4F2EE', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                Paste team name / tag pairs
              </label>
              <textarea
                id="csv-bulksearch-text"
                value={csvText}
                onChange={handleTextChange}
                placeholder={'team_name,team_tag\nCYBERHERO,CH\nGEEKAY ESPORTS,Geekay\nGOAT TEAM,Goat\n…'}
                rows={8}
                className="tm-input tm-mono"
                style={{ resize: 'vertical', minHeight: 140, lineHeight: 1.5 }}
              />
              <span style={{ color: '#55565C', fontSize: 12, display: 'block', marginTop: 6 }}>
                One team per line: team name, comma, team tag. Header row optional.
              </span>

              {csvText.trim() !== '' && queryRows.length === 0 && (
                <p style={{ color: '#E11D2E', fontSize: 13, marginTop: 14 }}>No valid rows found — check the format (team name, team tag per line).</p>
              )}

              {queryRows.length > 0 && (
                <>
                  <div className="tm-import-summary" style={{ marginTop: 16 }}>
                    <div className="tm-import-summary-stat">
                      <span className="tm-orb" style={{ fontSize: 20, fontWeight: 800, color: '#F4F2EE' }}>{queryRows.length}</span>
                      <span className="tm-mono" style={{ fontSize: 10, color: '#55565C' }}>ROWS</span>
                    </div>
                    {truncatedCount > 0 && (
                      <div className="tm-import-summary-stat">
                        <span className="tm-orb" style={{ fontSize: 20, fontWeight: 800, color: '#E11D2E' }}>{truncatedCount}</span>
                        <span className="tm-mono" style={{ fontSize: 10, color: '#55565C' }}>DROPPED (LIMIT)</span>
                      </div>
                    )}
                  </div>

                  {queryRows.length > 0 && (
                    <div className="tm-import-table-wrap">
                      <table className="tm-import-table">
                        <thead>
                          <tr><th>Team name</th><th>Tag</th></tr>
                        </thead>
                        <tbody>
                          {previewRows.map((r, i) => (
                            <tr key={i}>
                              <td style={{ color: '#F4F2EE' }}>{r.teamName}</td>
                              <td className="tm-mono">{r.teamTag}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {queryRows.length > previewRows.length && (
                        <p style={{ color: '#55565C', fontSize: 11, padding: '6px 10px' }}>+{queryRows.length - previewRows.length} more</p>
                      )}
                    </div>
                  )}

                  {searchError && <p style={{ color: '#E11D2E', fontSize: 13, marginTop: 14 }}>{searchError}</p>}

                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    <button type="button" className="tm-btn-ghost" onClick={onClose}>CANCEL</button>
                    <button
                      type="button"
                      className="tm-btn-primary"
                      style={{ flex: 1, justifyContent: 'center' }}
                      disabled={queryRows.length === 0 || searching}
                      onClick={handleSearch}
                    >
                      {searching ? 'SEARCHING…' : `SEARCH ${queryRows.length} ROW${queryRows.length === 1 ? '' : 'S'}`}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Teams root ────────────────────────────────────────────────────────────────
const Teams: React.FC = () => {
  const { t } = useTranslation();
  const [teams, setTeams] = useState<Team[]>([]);
  const [totalTeams, setTotalTeams] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const [formTeam, setFormTeam] = useState<Team | 'new' | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBulkSearchModal, setShowBulkSearchModal] = useState(false);
  const [viewingTeamId, setViewingTeamId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [deletingTeamIds, setDeletingTeamIds] = useState<Set<string>>(new Set());
  const [deletingPlayerIds, setDeletingPlayerIds] = useState<Set<string>>(new Set());
  const deletingTeamIdsRef = useRef(deletingTeamIds);
  const deletingPlayerIdsRef = useRef(deletingPlayerIds);
  useEffect(() => { deletingTeamIdsRef.current = deletingTeamIds; }, [deletingTeamIds]);
  useEffect(() => { deletingPlayerIdsRef.current = deletingPlayerIds; }, [deletingPlayerIds]);

  // Single source of truth for loading the list. Always goes through the
  // backend's own search/limit support so results aren't silently clipped
  // to whatever happened to be on the first page.
  const fetchTeams = useCallback(async (search: string) => {
    try {
      // The unfiltered baseline list is cache-first and shared with
      // GroupsData.tsx's team picker; live searches always hit the network.
      const data = search
        ? (await api.get('/teams', { params: { search, limit: 100 } })).data
        : await getOrFetch(
            TEAMS_LIST_CACHE_KEY,
            () => api.get('/teams', { params: { limit: 100 } }).then(r => r.data),
            { maxAge: 90 * 1000, storage: 'session' }
          );
      const normalized: Team[] = data.teams.map((team: any) => ({
        ...team,
        players: Array.isArray(team.players) ? team.players : [],
        playersCount: team.playersCount ?? (Array.isArray(team.players) ? team.players.length : 0),
      }));
      setTeams(normalized);
      setTotalTeams(data.total ?? normalized.length);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchTeams('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch whenever the search query changes, skipping the redundant call
  // on first mount (already handled above). No debounce here — SearchInput
  // (above) already debounces 280ms before it calls onSearchChange/updates
  // searchQuery, so debouncing again here just doubled the delay between
  // "stop typing" and results landing for no benefit.
  const isFirstSearchRun = useRef(true);
  useEffect(() => {
    if (isFirstSearchRun.current) { isFirstSearchRun.current = false; return; }
    fetchTeams(searchQuery);
  }, [searchQuery, fetchTeams]);

  const viewingTeam = useMemo(() => teams.find(t => t._id === viewingTeamId) || null, [teams, viewingTeamId]);

  // Stats reflect the currently loaded (possibly search-filtered) set.
  // totalTeams comes straight from the backend's total count for that
  // filter; totalPlayers/avgSize are computed from playersCount so they're
  // accurate even though most list rows don't carry a full `players` array.
  const teamStats = useMemo(() => {
    const totalPlayers = teams.reduce((s, t) => s + (t.playersCount ?? t.players?.length ?? 0), 0);
    return {
      totalTeams,
      totalPlayers,
      avgSize: teams.length ? (totalPlayers / teams.length).toFixed(1) : '—',
    };
  }, [teams, totalTeams]);

  const deleteTeam = useCallback(async (id: string) => {
    if (!window.confirm('Delete this team?')) return;
    if (deletingTeamIdsRef.current.has(id)) return;
    setDeletingTeamIds(prev => new Set(prev).add(id));
    setTeams(prev => prev.filter(t => t._id !== id));
    setTotalTeams(prev => Math.max(0, prev - 1));
    try {
      await api.delete(`/teams/${id}`);
      removeCache(TEAMS_LIST_CACHE_KEY, 'session');
      removeCache(teamByIdKey(id), 'session');
    }
    catch { alert('Failed to delete team'); fetchTeams(searchQuery); }
    finally { setDeletingTeamIds(prev => { const c = new Set(prev); c.delete(id); return c; }); }
  }, [fetchTeams, searchQuery]);

  const deletePlayer = useCallback(async (teamId: string, playerId: string) => {
    if (deletingPlayerIdsRef.current.has(playerId)) return;
    setDeletingPlayerIds(prev => new Set(prev).add(playerId));
    try {
      await api.delete(`/teams/${teamId}/players/${playerId}`);
      setTeams(prev => prev.map(t => t._id === teamId
        ? { ...t, players: t.players.filter(p => p._id !== playerId), playersCount: (t.playersCount ?? t.players.length) - 1 }
        : t));
      removeCache(teamByIdKey(teamId), 'session');
      removeCache(TEAMS_LIST_CACHE_KEY, 'session');
    } catch { alert('Failed to delete player'); }
    finally { setDeletingPlayerIds(prev => { const c = new Set(prev); c.delete(playerId); return c; }); }
  }, []);

  const deleteSelectedPlayers = useCallback(async (teamId: string, playerIds: string[]) => {
    try {
      await api.delete(`/teams/${teamId}/players`, { data: { playerIds } });
      setTeams(prev => prev.map(t => t._id === teamId
        ? { ...t, players: t.players.filter(p => !playerIds.includes(p._id!)), playersCount: (t.playersCount ?? t.players.length) - playerIds.length }
        : t));
      removeCache(teamByIdKey(teamId), 'session');
      removeCache(TEAMS_LIST_CACHE_KEY, 'session');
    } catch { alert('Failed to delete selected players'); throw new Error('delete failed'); }
  }, []);

  const openNewForm = useCallback(() => setFormTeam('new'), []);
  const closeForm = useCallback(() => setFormTeam(null), []);
  const closeDetail = useCallback(() => setViewingTeamId(null), []);
  const closeImportModal = useCallback(() => setShowImportModal(false), []);
  const handleImported = useCallback(() => {
    removeCache(TEAMS_LIST_CACHE_KEY, 'session');
    fetchTeams(searchQuery);
  }, [fetchTeams, searchQuery]);

  // Both detail view and edit need the REAL players array, which the list
  // endpoint never sends. Fetch it on demand and merge it into `teams` so
  // every consumer (card, detail modal, edit form) sees the same data.
  const openDetail = useCallback(async (t2: Team) => {
    setViewingTeamId(t2._id);
    setDetailLoading(true);
    try {
      const data = await getOrFetch(
        teamByIdKey(t2._id),
        () => api.get(`/teams/${t2._id}`).then(r => r.data),
        { maxAge: 2 * 60 * 1000, storage: 'session' }
      );
      setTeams(prev => prev.map(t => t._id === data._id ? { ...t, ...data, playersCount: data.players?.length ?? 0 } : t));
    } catch {
      alert('Failed to load team roster');
      setViewingTeamId(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Shares the `teams:byId` cache with openDetail (and with
  // matchDataController.tsx's roster editor) — opening detail then
  // immediately editing the same team is now a cache hit, not a refetch.
  const openEdit = useCallback(async (t2: Team) => {
    try {
      const data = await getOrFetch(
        teamByIdKey(t2._id),
        () => api.get(`/teams/${t2._id}`).then(r => r.data),
        { maxAge: 2 * 60 * 1000, storage: 'session' }
      );
      const fullTeam: Team = { ...data, playersCount: data.players?.length ?? 0 };
      setTeams(prev => prev.map(t => t._id === fullTeam._id ? { ...t, ...fullTeam } : t));
      setFormTeam(fullTeam);
    } catch {
      alert('Failed to load team for editing');
    }
  }, []);

  const handleSaved = useCallback((saved: Team, isNew: boolean) => {
    setTeams(prev => {
      if (isNew) return [saved, ...prev];
      return prev.map(t => t._id === saved._id ? saved : t);
    });
    if (isNew) setTotalTeams(prev => prev + 1);
    setCache(teamByIdKey(saved._id), saved, 'session');
    removeCache(TEAMS_LIST_CACHE_KEY, 'session');
  }, []);

  return (
    <div className="tm-root" style={{ minHeight: '100vh', background: '#0B0C0E' }}>
      <style>{STYLES}</style>
      <div className="tm-hex" />

      <Navbar active="teams" brandText="TEAM OPS" />

      <div className="tm-page">
        <div className="tm-header-row">
          <div>
            <div className="tm-eyebrow" style={{ marginBottom: 8 }}>
              <span className="tm-eyebrow-dot" /> TEAM MANAGEMENT
            </div>
            <h1 className="tm-orb" style={{ fontSize: 28, fontWeight: 800, color: '#F4F2EE', letterSpacing: '-0.01em', marginBottom: 6, textTransform: 'uppercase' }}>
              {t('teams.header.title')}
            </h1>
            <p style={{ color: '#93959C', fontSize: 14, maxWidth: 480 }}>{t('teams.header.subtitle')}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="tm-btn-outline" onClick={() => setShowImportModal(true)}>
              <FaUpload size={12} /> IMPORT CSV
            </button>
            <button className="tm-btn-outline" onClick={() => setShowBulkSearchModal(true)}>
              <FaPaste size={12} /> BULK SEARCH
            </button>
            <button className="tm-btn-primary" onClick={openNewForm}>
              <FaPlus size={12} /> NEW TEAM
            </button>
          </div>
        </div>

        <div className="tm-toolbar">
          <SearchInput onSearchChange={setSearchQuery} />
          <span className="tm-mono" style={{ fontSize: 11, color: '#55565C' }}>{teams.length} / {totalTeams} shown</span>
          <div className="tm-stats">
            <div className="tm-stat">
              <span className="tm-orb" style={{ fontSize: 15, fontWeight: 800, color: '#E11D2E' }}>{teamStats.totalTeams}</span>
              <span className="tm-mono" style={{ fontSize: 9, color: '#55565C', letterSpacing: '1px' }}>TEAMS</span>
            </div>
            <div className="tm-stat">
              <span className="tm-orb" style={{ fontSize: 15, fontWeight: 800, color: '#E11D2E' }}>{teamStats.totalPlayers}</span>
              <span className="tm-mono" style={{ fontSize: 9, color: '#55565C', letterSpacing: '1px' }}>PLAYERS</span>
            </div>
            <div className="tm-stat">
              <span className="tm-orb" style={{ fontSize: 15, fontWeight: 800, color: '#E11D2E' }}>{teamStats.avgSize}</span>
              <span className="tm-mono" style={{ fontSize: 9, color: '#55565C', letterSpacing: '1px' }}>AVG SIZE</span>
            </div>
          </div>
        </div>

        {teams.length === 0 ? (
          <div className="tm-empty">
            <div className="tm-empty-icon-wrap"><FaUsers size={26} style={{ color: '#E11D2E', opacity: 0.7 }} /></div>
            <h3 className="tm-orb" style={{ fontSize: 16, color: '#F4F2EE', marginBottom: 8, textTransform: 'uppercase' }}>
              {totalTeams === 0 && !searchQuery ? t('teams.messages.noTeams') : 'No teams match your search'}
            </h3>
            <p style={{ color: '#93959C', marginBottom: 24, fontSize: 14 }}>
              {totalTeams === 0 && !searchQuery ? t('teams.messages.createFirst') : 'Try a different name or tag.'}
            </p>
            {totalTeams === 0 && !searchQuery && (
              <button className="tm-btn-primary" style={{ margin: '0 auto' }} onClick={openNewForm}>
                <FaPlus size={12} /> CREATE TEAM
              </button>
            )}
          </div>
        ) : (
          <div className="tm-grid">
            {teams.map(team => (
              <TeamCard
                key={team._id}
                team={team}
                onOpenDetail={openDetail}
                onEdit={openEdit}
                onDelete={deleteTeam}
                isDeleting={deletingTeamIds.has(team._id)}
              />
            ))}
          </div>
        )}
      </div>

      {formTeam && (
        <FormModal
          editingTeam={formTeam === 'new' ? null : formTeam}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      )}

      {viewingTeam && (
        <DetailModal
          team={viewingTeam}
          loading={detailLoading}
          onClose={closeDetail}
          onEdit={openEdit}
          onDeletePlayer={deletePlayer}
          onDeleteSelectedPlayers={deleteSelectedPlayers}
          deletingPlayerIds={deletingPlayerIds}
        />
      )}

      {showImportModal && (
        <ImportCsvModal onClose={closeImportModal} onImported={handleImported} />
      )}

      {showBulkSearchModal && (
        <BulkSearchModal onClose={() => setShowBulkSearchModal(false)} />
      )}
    </div>
  );
};

export default Teams;