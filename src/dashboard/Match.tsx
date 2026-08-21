import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { FaEdit, FaTrash, FaClock, FaMap, FaChevronRight, FaPlus } from 'react-icons/fa';
import api from '../login/api.tsx';
import { getOrFetch, setCache } from './cache';

interface Match {
  _id: string;
  matchNo: number;
  time: string;
  map: string;
  groups?: {
    _id: string;
    groupName: string;
    slots?: { _id: string; slot: number; team: { _id: string; teamFullName: string } }[];
  }[];
}

interface GroupData {
  _id: string;
  groupName: string;
  slots?: { _id: string; slot: number; team: { _id: string; teamFullName: string } }[];
}

// ── 4 maps only ───────────────────────────────────────────────────────────────
const MAPS = ['Erangel', 'Miramar', 'Rondo', 'Sanhok'] as const;
type MapName = typeof MAPS[number];

// Muted broadcast-safe identifiers — distinct enough to scan a list fast,
// desaturated so they sit quietly inside the red/black system instead of
// competing with the tally-red accent.
const MAP_COLORS: Record<MapName, string> = {
  Erangel: '#5BC98A',
  Miramar: '#E0A64D',
  Rondo:   '#5B9FE0',
  Sanhok:  '#4DBFA8',
};

const MAP_DESC: Record<MapName, string> = {
  Erangel: 'Temperate · 8×8 km',
  Miramar: 'Desert · 8×8 km',
  Rondo:   'Urban · 8×8 km',
  Sanhok:  'Tropical · 4×4 km',
};

// ── Styles ─────────────────────────────────────────────────────────────────────
// PERF NOTES (mirrors home.tsx):
// - No backdrop-blur anywhere (recomputes every scroll/paint frame on some GPUs).
// - No decorative keyframe animation — only the two functional spinners.
// - Hover states are instant color/border swaps, no transition on color/background
//   so interaction never waits on a tween. The few `transition` rules that remain
//   are opacity-only on transform-free properties and kept under 120ms.
// - Single font import, three weights per family max.
// - Selectors are single-class where possible to keep specificity flat and cheap.
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

  .m-root {
    --bg: #0B0C0E;
    --panel: #131418;
    --panel-raised: #17181D;
    --line: #24262B;
    --text: #F4F2EE;
    --text-muted: #93959C;
    --text-dim: #55565C;
    --tally: #E11D2E;
    --tally-dim: #8C1220;
    font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  }
  .m-root, .m-root *, .m-root *::before, .m-root *::after { box-sizing: border-box; }
  .m-display { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif; }
  .m-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

  .m-root a, .m-root button, .m-root input { font-family: inherit; }
  .m-root button:focus-visible, .m-root input:focus-visible {
    outline: 2px solid var(--tally); outline-offset: 2px;
  }

  /* ── Page shell ── */
  .m-page { min-height: 100vh; background: var(--bg); padding: 40px 32px 64px; position: relative; }
  .m-inner { max-width: 1100px; margin: 0 auto; }

  /* ── Page header ── */
  .m-page-hdr {
    display: flex; justify-content: space-between; align-items: flex-end; gap: 20px;
    margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid var(--line);
  }
  .m-eyebrow { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .m-eyebrow-dot { width: 6px; height: 6px; background: var(--tally); flex-shrink: 0; }
  .m-eyebrow-txt { font-size: 11px; letter-spacing: 0.22em; color: var(--text-muted); text-transform: uppercase; }
  .m-page-title { font-size: 30px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; text-transform: uppercase; margin: 0 0 6px; line-height: 1.05; }
  .m-page-sub { color: var(--text-muted); font-size: 14px; }

  /* ── Buttons ── */
  .m-btn-primary {
    background: var(--tally); color: #fff; border: 1px solid var(--tally);
    font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 700;
    letter-spacing: 0.01em; padding: 12px 22px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px; white-space: nowrap;
  }
  .m-btn-primary:hover { background: var(--text); color: var(--bg); border-color: var(--text); }
  .m-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .m-btn-primary:disabled:hover { background: var(--tally); color: #fff; border-color: var(--tally); }

  .m-btn-ghost {
    background: transparent; color: var(--text); border: 1px solid var(--line);
    font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 700;
    padding: 12px 22px; cursor: pointer; white-space: nowrap;
  }
  .m-btn-ghost:hover { border-color: var(--tally); color: var(--tally); }

  .m-btn-save {
    background: var(--tally); color: #fff; border: 1px solid var(--tally);
    font-family: 'Space Grotesk', sans-serif; font-size: 12px; font-weight: 700;
    padding: 10px 18px; cursor: pointer;
  }
  .m-btn-save:hover { background: var(--tally-dim); border-color: var(--tally-dim); }

  .m-btn-cancel {
    background: transparent; color: var(--text-muted); border: 1px solid var(--line);
    font-size: 13px; font-weight: 600; padding: 10px 18px; cursor: pointer;
  }
  .m-btn-cancel:hover { color: var(--text); border-color: var(--text-dim); }

  /* ── Stats bar ── */
  .m-statsbar { display: flex; flex-wrap: wrap; gap: 1px; background: var(--line); border: 1px solid var(--line); margin-bottom: 28px; }
  .m-stat { background: var(--panel); padding: 16px 22px; display: flex; flex-direction: column; gap: 4px; min-width: 130px; flex: 1; }
  .m-stat-val { font-family: 'Space Grotesk', sans-serif; font-size: 24px; font-weight: 800; color: var(--tally); }
  .m-stat-lbl { font-size: 10px; color: var(--text-muted); letter-spacing: 0.14em; text-transform: uppercase; }

  /* ── Form panel ── */
  .m-form-panel { background: var(--panel); border: 1px solid var(--line); margin-bottom: 28px; }

  .m-form-topbar {
    display: flex; align-items: center; gap: 10px; padding: 16px 24px;
    border-bottom: 1px solid var(--line); background: var(--panel-raised);
  }
  .m-form-tag {
    background: var(--tally); color: #fff; font-family: 'JetBrains Mono', monospace;
    font-size: 10px; letter-spacing: 0.1em; padding: 3px 8px; text-transform: uppercase;
  }
  .m-form-title { font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 700; color: var(--text); letter-spacing: 0.01em; text-transform: uppercase; }

  .m-form-body { display: grid; grid-template-columns: 1fr 1fr; }
  .m-form-left { padding: 24px; border-right: 1px solid var(--line); }
  .m-form-right { padding: 24px; display: flex; flex-direction: column; min-height: 0; }

  .m-field-lbl {
    font-size: 10px; color: var(--text-muted); letter-spacing: 0.12em; text-transform: uppercase;
    margin: 0 0 8px; display: flex; align-items: center; gap: 7px;
  }
  .m-field-lbl::before { content: ''; width: 3px; height: 11px; background: var(--tally); }

  .m-input {
    width: 100%; padding: 11px 13px; background: var(--bg); border: 1px solid var(--line);
    color: var(--text); font-size: 15px; outline: none; color-scheme: dark;
  }
  .m-input::placeholder { color: var(--text-dim); }
  .m-input:focus { border-color: var(--tally); }

  .m-fields-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 22px; }

  /* ── Map picker ── */
  .m-map-picker-lbl { margin-bottom: 12px; }
  .m-map-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

  .m-map-card {
    position: relative; cursor: pointer; user-select: none;
    background: var(--bg); border: 1px solid var(--line); padding: 13px 13px 11px;
  }
  .m-map-card:hover { border-color: var(--text-dim); }
  .m-map-card.mc-sel { border-color: var(--mc); box-shadow: inset 0 0 0 1px var(--mc); }
  .m-map-card-bar { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--mc); opacity: 0.35; }
  .m-map-card.mc-sel .m-map-card-bar { opacity: 1; }
  .m-map-card-name { font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 700; color: var(--text-muted); letter-spacing: 0.01em; margin-bottom: 3px; text-transform: uppercase; }
  .m-map-card.mc-sel .m-map-card-name { color: var(--mc); }
  .m-map-card-desc { font-size: 11px; color: var(--text-dim); font-family: 'JetBrains Mono', monospace; }
  .m-map-check {
    position: absolute; top: 8px; right: 9px; width: 15px; height: 15px;
    background: var(--mc); display: none; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 900; color: #000;
  }
  .m-map-card.mc-sel .m-map-check { display: flex; }

  /* ── Group chips ── */
  .m-groups-lbl { margin-bottom: 12px; }
  .m-groups-list { display: flex; flex-direction: column; gap: 6px; flex: 1; overflow-y: auto; max-height: 260px; }

  .m-group-chip {
    display: flex; align-items: center; gap: 10px; padding: 11px 13px; cursor: pointer;
    background: var(--bg); border: 1px solid var(--line); user-select: none;
  }
  .m-group-chip:hover { border-color: var(--text-dim); }
  .m-group-chip.gc-active { border-color: var(--tally); background: rgba(225,29,46,0.06); }
  .m-group-chip-dot { width: 6px; height: 6px; flex-shrink: 0; background: var(--line); border: 1px solid var(--text-dim); }
  .m-group-chip.gc-active .m-group-chip-dot { background: var(--tally); border-color: var(--tally); }
  .m-group-chip-name { font-family: 'Space Grotesk', sans-serif; font-size: 12px; font-weight: 700; color: var(--text-muted); letter-spacing: 0.01em; flex: 1; text-transform: uppercase; }
  .m-group-chip.gc-active .m-group-chip-name { color: var(--text); }
  .m-group-chip-check { font-size: 10px; color: var(--tally); font-weight: 900; opacity: 0; }
  .m-group-chip.gc-active .m-group-chip-check { opacity: 1; }

  .m-no-groups {
    font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-dim);
    letter-spacing: 0.08em; text-align: center; padding: 28px; border: 1px dashed var(--line);
  }

  /* ── Form footer ── */
  .m-form-footer {
    display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    padding: 16px 24px; border-top: 1px solid var(--line); background: var(--panel-raised);
  }
  .m-form-footer-info { font-size: 11px; color: var(--text-dim); font-family: 'JetBrains Mono', monospace; letter-spacing: 0.06em; }
  .m-form-footer-info b { color: var(--tally); font-weight: 700; }
  .m-form-footer-actions { display: flex; gap: 10px; }

  .m-spinner-sm {
    width: 13px; height: 13px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
    border-radius: 50%; animation: m-spin 0.7s linear infinite; display: inline-block;
  }

  /* ── Section divider ── */
  .m-divider { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .m-divider-txt { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.2em; color: var(--tally); white-space: nowrap; text-transform: uppercase; }
  .m-divider-line { flex: 1; height: 1px; background: var(--line); }

  /* ── Match list ── */
  .m-list { display: flex; flex-direction: column; gap: 1px; background: var(--line); border: 1px solid var(--line); }

  .m-row { position: relative; background: var(--panel); cursor: pointer; }
  .m-row:hover { background: var(--panel-raised); }

  .m-row-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }
  .m-row-body { padding: 16px 18px; display: flex; align-items: center; gap: 16px; }

  .m-match-num {
    font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #000;
    padding: 6px 11px; flex-shrink: 0; letter-spacing: 0.03em;
  }

  .m-map-block { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .m-map-name { font-family: 'Space Grotesk', sans-serif; font-size: 16px; font-weight: 700; color: var(--text); letter-spacing: 0.01em; margin-bottom: 5px; text-transform: uppercase; }
  .m-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

  .m-time-chip {
    display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace; border: 1px solid var(--line); padding: 3px 9px;
  }
  .m-group-pill {
    font-size: 10px; color: var(--tally); border: 1px solid rgba(225,29,46,0.35);
    padding: 3px 9px; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.04em;
  }

  .m-row-actions { display: flex; gap: 6px; flex-shrink: 0; opacity: 0; }
  .m-row:hover .m-row-actions { opacity: 1; }
  .m-nav-arrow { color: var(--line); flex-shrink: 0; }
  .m-row:hover .m-nav-arrow { color: var(--tally); }

  .m-ic-btn { width: 32px; height: 32px; border: 1px solid var(--line); background: var(--bg); cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .m-ic-edit:hover { border-color: #5B9FE0; background: rgba(91,159,224,0.1); }
  .m-ic-del:hover { border-color: var(--tally); background: rgba(225,29,46,0.1); }

  /* ── Inline edit ── */
  .m-edit-header { padding: 14px 18px 0; display: flex; align-items: center; gap: 10px; }
  .m-edit-flag { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--tally); letter-spacing: 0.16em; text-transform: uppercase; }
  .m-edit-form { padding: 14px 18px 18px; }
  .m-edit-grid { display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 12px; margin-bottom: 14px; }

  .m-edit-map-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .m-edit-map-chip {
    flex: 1 1 70px; padding: 9px 8px; cursor: pointer; text-align: center;
    background: var(--bg); border: 1px solid var(--line);
    font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700;
    color: var(--text-dim); letter-spacing: 0.03em; user-select: none; text-transform: uppercase;
  }
  .m-edit-map-chip:hover { border-color: var(--text-dim); color: var(--text-muted); }
  .m-edit-map-chip.emc-sel { border-color: var(--mc); color: var(--mc); box-shadow: inset 0 0 0 1px var(--mc); }

  .m-edit-actions { display: flex; gap: 8px; justify-content: flex-end; }

  /* ── Loading / error ── */
  .m-loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); flex-direction: column; gap: 18px; }
  .m-spinner { width: 40px; height: 40px; border: 3px solid var(--line); border-top-color: var(--tally); border-radius: 50%; animation: m-spin 0.9s linear infinite; }
  @keyframes m-spin { to { transform: rotate(360deg); } }
  .m-loading-txt { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-muted); letter-spacing: 0.2em; text-transform: uppercase; }
  .m-error-txt { font-family: 'JetBrains Mono', monospace; color: var(--tally); font-size: 13px; letter-spacing: 0.04em; }

  /* ── Empty state ── */
  .m-empty { text-align: center; padding: 72px 24px; border: 1px dashed var(--line); }
  .m-empty-icon {
    width: 60px; height: 60px; margin: 0 auto 20px; background: var(--panel);
    border: 1px solid var(--line); display: flex; align-items: center; justify-content: center;
  }
  .m-empty-title { font-family: 'Space Grotesk', sans-serif; font-size: 17px; font-weight: 700; color: var(--text); margin: 0 0 8px; text-transform: uppercase; }
  .m-empty-sub { color: var(--text-muted); font-size: 14px; margin-bottom: 26px; }

  /* ══════════════════════════════════════════
     RESPONSIVE — tablet & mobile
  ══════════════════════════════════════════ */
  @media (max-width: 860px) {
    .m-form-body { grid-template-columns: 1fr; }
    .m-form-left { border-right: none; border-bottom: 1px solid var(--line); }
    .m-groups-list { max-height: 220px; }
  }

  @media (max-width: 640px) {
    .m-page { padding: 24px 16px 48px; }
    .m-page-hdr { flex-direction: column; align-items: stretch; gap: 16px; }
    .m-page-hdr .m-btn-primary, .m-page-hdr .m-btn-ghost { width: 100%; justify-content: center; }
    .m-page-title { font-size: 24px; }

    .m-statsbar { flex-wrap: nowrap; overflow-x: auto; }
    .m-stat { min-width: 108px; padding: 13px 16px; }
    .m-stat-val { font-size: 20px; }

    .m-form-left, .m-form-right { padding: 18px; }
    .m-fields-row { grid-template-columns: 1fr; gap: 12px; margin-bottom: 18px; }
    .m-form-footer { flex-direction: column; align-items: stretch; }
    .m-form-footer-actions { justify-content: stretch; }
    .m-form-footer-actions button { flex: 1; }

    .m-row-body { padding: 14px; gap: 12px; flex-wrap: wrap; }
    .m-map-block { flex-basis: 100%; order: 3; }
    /* Actions live on touch devices — no hover, so keep them visible */
    .m-row-actions { opacity: 1; }
    .m-nav-arrow { display: none; }

    .m-edit-grid { grid-template-columns: 1fr 1fr; }
    .m-edit-grid > div:nth-child(3) { grid-column: 1 / -1; }

    .m-map-grid { gap: 7px; }
  }

  @media (max-width: 420px) {
    .m-edit-grid { grid-template-columns: 1fr; }
  }

  @media (hover: none) {
    .m-row-actions { opacity: 1; }
  }
`;

const isCanceled = (err: any) => err?.name === 'CanceledError' || err?.name === 'AbortError' || err?.code === 'ERR_CANCELED';

// ── Component ──────────────────────────────────────────────────────────────────
const Match: React.FC = () => {
  const { t } = useTranslation();
  const { tournamentId, roundId } = useParams<{ tournamentId: string; roundId: string }>();
  const navigate = useNavigate();

  const [matches, setMatches]           = useState<Match[]>([]);
  const [groups, setGroups]             = useState<GroupData[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [showAddForm, setShowAddForm]   = useState(false);
  const [newMatchNo, setNewMatchNo]     = useState<number>(1);
  const [newTime, setNewTime]           = useState<string>('00:00');
  const [newMap, setNewMap]             = useState<MapName | ''>('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [editMatchId, setEditMatchId]   = useState<string | null>(null);
  const [editMatchNo, setEditMatchNo]   = useState<number>(1);
  const [editTime, setEditTime]         = useState<string>('00:00');
  const [editMap, setEditMap]           = useState<MapName | ''>('');
  const [isCreating, setIsCreating]     = useState(false);

  const to24Hour = (time: string) => {
    if (!time) return '00:00';
    if (!time.includes('AM') && !time.includes('PM')) return time;
    const [t, mod] = time.split(' ');
    let [h, m] = t.split(':').map(Number);
    if (mod === 'PM' && h < 12) h += 12;
    if (mod === 'AM' && h === 12) h = 0;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
  };

  // Matches key is shared with DisplayHud.tsx; groups key is shared with
  // GroupsData.tsx/DisplayHud.tsx — cache-first, so revisiting a tournament
  // already loaded elsewhere skips the network entirely.
  const fetchData = async () => {
    if (!tournamentId || !roundId) return;
    setLoading(true);
    try {
      const [matchesData, groupsData] = await Promise.all([
        getOrFetch(
          `cache:v1:matches:${tournamentId}:${roundId}`,
          () => api.get(`/tournaments/${tournamentId}/rounds/${roundId}/matches`).then(r => r.data),
          { maxAge: 90 * 1000, storage: 'session' }
        ),
        getOrFetch(
          `cache:v1:groups:${tournamentId}`,
          () => api.get(`/tournaments/${tournamentId}/groups`).then(r => r.data),
          { maxAge: 90 * 1000, storage: 'session' }
        ),
      ]);
      // A cached or live response can be a non-array (e.g. a backend error
      // body that slipped through as a 200) — degrade to empty rather than
      // crash the .map/.filter calls below.
      setMatches(Array.isArray(matchesData) ? matchesData : []);
      setGroups(Array.isArray(groupsData) ? groupsData : []);
      setError(null);
    } catch (err: any) {
      if (isCanceled(err)) return;
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [tournamentId, roundId]);

  const handleAddMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMap) return alert('Please select a map.');
    if (!newTime) return alert('Please enter a valid time.');
    if (selectedGroupIds.length === 0) return alert('Select at least one group.');
    setIsCreating(true);
    try {
      const res = await api.post(`/tournaments/${tournamentId}/rounds/${roundId}/matches`, {
        matchNo: newMatchNo, time: newTime, map: newMap, groupIds: selectedGroupIds,
      });
      const added = { ...res.data.match, groups: groups.filter(g => selectedGroupIds.includes(g._id)) };
      const next = [...matches, added];
      setMatches(next);
      setCache(`cache:v1:matches:${tournamentId}:${roundId}`, next, 'session');
      setNewMatchNo(newMatchNo + 1);
      setNewTime('00:00'); setNewMap(''); setSelectedGroupIds([]);
      setShowAddForm(false);
    } catch (err: any) {
      alert(err.message || 'Error adding match');
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (match: Match) => {
    setEditMatchId(match._id);
    setEditMatchNo(match.matchNo);
    setEditTime(to24Hour(match.time));
    setEditMap((match.map as MapName) || '');
  };

  const handleUpdateMatch = async (matchId: string) => {
    if (!editMap) return alert('Please select a map.');
    if (!editTime) return alert('Please enter a valid time.');
    try {
      const res = await api.put(`/tournaments/${tournamentId}/rounds/${roundId}/matches/${matchId}`, {
        matchNo: editMatchNo, time: editTime, map: editMap, groupIds: selectedGroupIds,
      });
      const next = matches.map(m => m._id === matchId ? res.data : m);
      setMatches(next);
      setCache(`cache:v1:matches:${tournamentId}:${roundId}`, next, 'session');
      setEditMatchId(null);
    } catch (err: any) {
      alert(err.message || 'Error updating match');
    }
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (!window.confirm('Delete this match?')) return;
    try {
      await api.delete(`/tournaments/${tournamentId}/rounds/${roundId}/matches/${matchId}`);
      const next = matches.filter(m => m._id !== matchId);
      setMatches(next);
      setCache(`cache:v1:matches:${tournamentId}:${roundId}`, next, 'session');
    } catch (err: any) {
      alert(err.message || 'Error deleting match');
    }
  };

  const toggleGroup = (id: string) =>
    setSelectedGroupIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // ── Loading / Error ──────────────────────────────────────────────────────────
  if (loading) return (
    <>
      <style>{STYLES}</style>
      <div className="m-root m-loading">
        <div className="m-spinner" />
        <p className="m-loading-txt">Loading matches</p>
      </div>
    </>
  );

  if (error) return (
    <>
      <style>{STYLES}</style>
      <div className="m-root m-loading">
        <p className="m-error-txt">ERROR: {error}</p>
      </div>
    </>
  );

  const uniqueMaps = Array.from(new Set(matches.map(m => m.map)));

  return (
    <>
      <style>{STYLES}</style>
      <div className="m-root m-page">
        <div className="m-inner">

          {/* ── Page Header ── */}
          <div className="m-page-hdr">
            <div>
              <div className="m-eyebrow">
                <span className="m-eyebrow-dot" />
                <span className="m-eyebrow-txt">Match Schedule</span>
              </div>
              <h1 className="m-display m-page-title">{t('matches.title')}</h1>
              <p className="m-page-sub">{t('matches.subtitle')}</p>
            </div>
            <button
              className={showAddForm ? 'm-btn-ghost' : 'm-btn-primary'}
              onClick={() => setShowAddForm(p => !p)}
            >
              {showAddForm ? t('matches.cancel') : <><FaPlus size={11} />{t('matches.addMatch')}</>}
            </button>
          </div>

          {/* ── Stats Bar ── */}
          <div className="m-statsbar">
            <div className="m-stat">
              <span className="m-display m-stat-val">{matches.length}</span>
              <span className="m-stat-lbl">Total Matches</span>
            </div>
            <div className="m-stat">
              <span className="m-display m-stat-val">{uniqueMaps.length}</span>
              <span className="m-stat-lbl">Maps Used</span>
            </div>
            <div className="m-stat">
              <span className="m-display m-stat-val">{groups.length}</span>
              <span className="m-stat-lbl">Groups</span>
            </div>
          </div>

          {/* ── Add Form ── */}
          {showAddForm && (
            <div className="m-form-panel">

              <div className="m-form-topbar">
                <span className="m-form-tag">New</span>
                <span className="m-display m-form-title">{t('matches.addNewMatch')}</span>
              </div>

              <form onSubmit={handleAddMatch}>
                <div className="m-form-body">

                  {/* ── LEFT: fields + map picker ── */}
                  <div className="m-form-left">

                    <div className="m-fields-row">
                      <div>
                        <p className="m-field-lbl">{t('matches.matchNumber')}</p>
                        <input
                          type="number" value={newMatchNo}
                          onChange={e => setNewMatchNo(parseInt(e.target.value))}
                          className="m-input" required
                        />
                      </div>
                      <div>
                        <p className="m-field-lbl">{t('matches.matchTime')}</p>
                        <input
                          type="time" value={newTime}
                          onChange={e => setNewTime(e.target.value)}
                          className="m-input" required
                        />
                      </div>
                    </div>

                    <p className="m-field-lbl m-map-picker-lbl">{t('matches.mapName')}</p>
                    <div className="m-map-grid">
                      {MAPS.map(map => {
                        const color = MAP_COLORS[map];
                        const isSelected = newMap === map;
                        return (
                          <div
                            key={map}
                            className={`m-map-card${isSelected ? ' mc-sel' : ''}`}
                            style={{ '--mc': color } as React.CSSProperties}
                            onClick={() => setNewMap(map)}
                          >
                            <div className="m-map-card-bar" />
                            <div className="m-map-check">✓</div>
                            <div className="m-map-card-name">{map}</div>
                            <div className="m-map-card-desc">{MAP_DESC[map]}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── RIGHT: group selection ── */}
                  <div className="m-form-right">
                    <p className="m-field-lbl m-groups-lbl">{t('matches.selectGroups')}</p>
                    {groups.length === 0 ? (
                      <div className="m-no-groups">No groups available</div>
                    ) : (
                      <div className="m-groups-list">
                        {groups.map(group => {
                          const isActive = selectedGroupIds.includes(group._id);
                          return (
                            <div
                              key={group._id}
                              className={`m-group-chip${isActive ? ' gc-active' : ''}`}
                              onClick={() => toggleGroup(group._id)}
                            >
                              <span className="m-group-chip-dot" />
                              <span className="m-group-chip-name">{group.groupName}</span>
                              <span className="m-group-chip-check">✓</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="m-form-footer">
                  <span className="m-form-footer-info">
                    MAP: <b>{newMap || '—'}</b> &nbsp;·&nbsp; GROUPS: <b>{selectedGroupIds.length}</b>
                  </span>
                  <div className="m-form-footer-actions">
                    <button type="button" className="m-btn-cancel" onClick={() => setShowAddForm(false)}>
                      {t('matches.cancel')}
                    </button>
                    <button type="submit" className="m-btn-primary" disabled={isCreating}>
                      {isCreating
                        ? <><span className="m-spinner-sm" />{t('matches.creating')}</>
                        : t('matches.createMatch')
                      }
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* ── Match List ── */}
          {matches.length === 0 ? (
            <div className="m-empty">
              <div className="m-empty-icon">
                <FaMap size={22} color="#E11D2E" />
              </div>
              <h3 className="m-display m-empty-title">{t('matches.noMatches')}</h3>
              <p className="m-empty-sub">{t('matches.clickAddMatch')}</p>
              <button className="m-btn-primary" style={{ margin: '0 auto' }} onClick={() => setShowAddForm(true)}>
                <FaPlus size={11} />{t('matches.addMatch')}
              </button>
            </div>
          ) : (
            <>
              <div className="m-divider">
                <span className="m-divider-txt">Scheduled Matches</span>
                <span className="m-divider-line" />
              </div>
              <div className="m-list">
                {matches.map(match => {
                  const mapColor  = MAP_COLORS[match.map as MapName] || '#E11D2E';
                  const isEditing = editMatchId === match._id;

                  return (
                    <div
                      key={match._id}
                      className="m-row"
                      onClick={() => { if (!isEditing) navigate(`/tournaments/${tournamentId}/rounds/${roundId}/matches/${match._id}`); }}
                    >
                      <div className="m-row-bar" style={{ background: mapColor }} />

                      {!isEditing ? (
                        <div className="m-row-body">
                          <div className="m-match-num" style={{ background: mapColor }}>
                            M{match.matchNo}
                          </div>
                          <div className="m-map-block">
                            <div className="m-display m-map-name" style={{ color: mapColor }}>{match.map}</div>
                            <div className="m-meta">
                              <span className="m-time-chip">
                                <FaClock size={10} />{match.time}
                              </span>
                              {match.groups?.map(g => (
                                <span key={g._id} className="m-group-pill">{g.groupName}</span>
                              ))}
                            </div>
                          </div>
                          <div className="m-row-actions" onClick={e => e.stopPropagation()}>
                            <button className="m-ic-btn m-ic-edit" onClick={() => startEdit(match)} title="Edit">
                              <FaEdit color="#F4F2EE" size={13} />
                            </button>
                            <button className="m-ic-btn m-ic-del" onClick={() => handleDeleteMatch(match._id)} title="Delete">
                              <FaTrash color="#F4F2EE" size={13} />
                            </button>
                          </div>
                          <FaChevronRight className="m-nav-arrow" size={14} />
                        </div>
                      ) : (
                        /* ── Inline edit mode ── */
                        <div onClick={e => e.stopPropagation()}>
                          <div className="m-edit-header">
                            <div className="m-match-num" style={{ background: mapColor }}>M{match.matchNo}</div>
                            <span className="m-edit-flag">Editing</span>
                          </div>
                          <div className="m-edit-form">
                            <div className="m-edit-grid">
                              <div>
                                <p className="m-field-lbl">Match No</p>
                                <input type="number" min={1} value={editMatchNo}
                                  onChange={e => setEditMatchNo(parseInt(e.target.value) || 1)}
                                  className="m-input" />
                              </div>
                              <div>
                                <p className="m-field-lbl">Time</p>
                                <input type="time" value={editTime}
                                  onChange={e => setEditTime(e.target.value)}
                                  className="m-input" />
                              </div>
                              <div>
                                <p className="m-field-lbl">Map</p>
                                <div className="m-edit-map-row">
                                  {MAPS.map(map => {
                                    const color = MAP_COLORS[map];
                                    return (
                                      <div
                                        key={map}
                                        className={`m-edit-map-chip${editMap === map ? ' emc-sel' : ''}`}
                                        style={{ '--mc': color } as React.CSSProperties}
                                        onClick={() => setEditMap(map)}
                                      >
                                        {map}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                            <div className="m-edit-actions">
                              <button className="m-btn-cancel" onClick={() => setEditMatchId(null)}>Cancel</button>
                              <button className="m-btn-save" onClick={() => handleUpdateMatch(match._id)}>Save Changes</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

        </div>
      </div>
    </>
  );
};

export default Match;