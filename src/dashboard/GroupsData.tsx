import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { FaTrash, FaEdit, FaTimes, FaSearch, FaChevronDown, FaChevronUp, FaUsers, FaPlus, FaCheck, FaLayerGroup, FaSpinner, FaPaste } from "react-icons/fa";
import { useParams } from "react-router-dom";
import Papa from "papaparse";
import api from "../login/api.tsx";
import { getOrFetch, setCache } from "./cache";

const TEAMS_LIST_CACHE_KEY = "cache:v1:teams:list";

interface Team {
  _id: string;
  teamFullName: string;
  teamTag: string;
  logo?: string;
}

interface Slot {
  _id: string;
  slot: number;
  team: Team;
}

interface Group {
  _id: string;
  groupName: string;
  slots?: Slot[];
}

interface SelectedTeam {
  teamId: string;
  slot: number | null;
}

// ── Bulk add via pasted CSV ──────────────────────────────────────────────────
interface BulkAddParsedRow { slot: number | null; teamName: string; teamTag: string; rowNum: number; }
interface BulkSearchResultRow { teamName: string; teamTag: string; matches: Team[]; truncated?: boolean; }
interface BulkSearchResponse { results: BulkSearchResultRow[]; matchedRows: number; unmatchedRows: number; totalTeamsFound: number; }

const MAX_BULK_ADD_ROWS = 1000; // mirrors backend's MAX_BULK_SEARCH_ROWS cap
const HEADER_SLOT_RE = /^slot$/i;
const HEADER_NAME_RE = /^team[\s_]*name$/i;
const HEADER_TAG_RE = /^team[\s_]*tag$/i;
const STRICT_INT_RE = /^\d+$/; // must be the WHOLE cell — parseInt alone is too lenient (see below)

// Accepts two shapes, auto-detected per row, header row optional:
//   slot,team_name,team_tag   (explicit slot)
//   team_name,team_tag        (no slot — assigned later on apply)
function parseBulkAddRows(rows: string[][]): { parsed: BulkAddParsedRow[]; warnings: string[]; truncatedCount: number } {
  let data = rows;
  let headerOffset = 0;
  if (data.length) {
    const r0 = data[0].map(c => (c || '').trim());
    const isSlotHeader = r0.length >= 3 && HEADER_SLOT_RE.test(r0[0]) && HEADER_NAME_RE.test(r0[1]) && HEADER_TAG_RE.test(r0[2]);
    const isNameHeader = !isSlotHeader && r0.length >= 2 && HEADER_NAME_RE.test(r0[0]) && HEADER_TAG_RE.test(r0[1]);
    if (isSlotHeader || isNameHeader) { data = data.slice(1); headerOffset = 1; }
  }
  const warnings: string[] = [];
  const parsed: BulkAddParsedRow[] = [];
  data.forEach((cells, i) => {
    const rowNum = i + 1 + headerOffset;
    const c = cells.map(x => (x || '').trim());
    let slot: number | null = null, teamName = '', teamTag = '';
    // Strict full-cell integer match — plain parseInt would misparse a
    // digit-leading team name like "4 MAN MAIN ESPORTS" as slot=4 if a
    // stray trailing comma ever turns a 2-column row into 3 cells.
    if (c.length >= 3 && STRICT_INT_RE.test(c[0]) && parseInt(c[0], 10) >= 1) {
      slot = parseInt(c[0], 10); teamName = c[1] || ''; teamTag = c[2] || '';
    } else {
      teamName = c[0] || ''; teamTag = c[1] || '';
    }
    if (!teamName || !teamTag) { warnings.push(`Row ${rowNum}: missing team name or tag, skipped`); return; }
    parsed.push({ slot, teamName, teamTag, rowNum });
  });
  const truncatedCount = Math.max(0, parsed.length - MAX_BULK_ADD_ROWS);
  return { parsed: parsed.slice(0, MAX_BULK_ADD_ROWS), warnings, truncatedCount };
}

interface GroupProps {
  onSelectionChange?: (groupIds: string[]) => void;
}

export interface GroupRef {
  openForm: () => void;
}

// ── Styles ────────────────────────────────────────────────────────────────────
// PERF NOTES:
// - Initial data (teams + groups) is fetched once on mount, in parallel via
//   Promise.all, regardless of whether the panel is open — so by the time
//   openForm() fires, the data is already sitting in state. openForm() no
//   longer blocks on a network round trip.
// - sessionStorage is read synchronously on mount to paint stale-but-fast
//   content immediately (stale-while-revalidate), then replaced once the
//   network response lands. Both teams and groups are cached now (only
//   groups were cached before).
// - TEAM SEARCH IS SERVER-SIDE. The backend caps /teams at limit=100 per
//   request (see teams.controller.js), so preloading "all" teams and
//   filtering them in memory silently hid any team outside the first 100
//   (sorted newest-first). Typing in the search box now debounces and hits
//   GET /teams?search=... the same way the working standalone call does,
//   so results aren't limited to whatever happened to load on mount.
// - Because search results can now change the `teams` array out from under
//   already-selected teams, a small selectedTeamsCache keeps a copy of any
//   team the user has picked (or is editing into a group) so chips/slot
//   rows never go blank just because a later search replaced the grid.
// - Every network call is guarded against a slow response from a previous
//   tournament (or a stale keystroke) clobbering the current one, via an
//   AbortController signal checked after the await. The initial groups/teams
//   load (loadInitialData) deliberately does NOT pass that signal into the
//   request itself, since GROUPS_CACHE_KEY/TEAMS_LIST_CACHE_KEY are shared
//   with other components' getOrFetch calls (e.g. Match.tsx) via the same
//   in-flight-promise dedup — aborting the request on unmount here would
//   cancel it for those other callers too, even if they're still mounted.
// - Team cards, slot rows and group cards are extracted into their own
//   React.memo'd components. Selecting one team previously re-rendered the
//   entire grid; now only the affected card re-renders.
// - Hover states use color/border/opacity transitions only (no glow
//   box-shadow animation, no transform-on-hover, no blur-on-scroll) —
//   cheap, compositor-friendly, and consistent with the broadcast site's
//   "no animation work on interaction" rule.
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');

.gx-root *, .gx-root *::before, .gx-root *::after { box-sizing: border-box; margin: 0; padding: 0; }
.gx-root {
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --gx-bg: #0B0C0E;
  --gx-panel: #131418;
  --gx-panel-raised: #17181D;
  --gx-line: #24262B;
  --gx-text: #F4F2EE;
  --gx-text-muted: #93959C;
  --gx-text-dim: #55565C;
  --gx-red: #E11D2E;
  --gx-red-dim: #8C1220;
}
.gx-disp { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif; }
.gx-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

/* ── Overlay ── */
.gx-overlay {
  position: relative; z-index: 1;
  height: 70vh;
  margin-bottom: 26px;
  border: 1px solid var(--gx-line);
  background: rgba(6,6,8,0.96);
  backdrop-filter: blur(10px);
  display: flex; flex-direction: column;
  overflow: hidden;
}

/* ── Top bar ── */
.gx-topbar {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--gx-line);
  background: rgba(0,0,0,0.55);
  flex-shrink: 0;
}
.gx-topbar-title {
  font-size: 14px; font-weight: 800;
  color: var(--gx-text); letter-spacing: 1px; text-transform: uppercase;
  flex: 1;
}
.gx-live-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--gx-red); flex-shrink: 0;
}
.gx-topbar-badge {
  display: flex; align-items: center; gap: 7px;
  background: rgba(225,29,46,0.08);
  border: 1px solid rgba(225,29,46,0.35);
  color: var(--gx-red);
  font-size: 9px; font-weight: 700;
  padding: 5px 10px; letter-spacing: 1.5px;
  cursor: pointer;
}
.gx-topbar-badge.on { background: rgba(225,29,46,0.22); }

.gx-close-btn {
  width: 32px; height: 32px;
  background: transparent;
  border: 1px solid var(--gx-line);
  color: var(--gx-text-dim); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; flex-shrink: 0;
  transition: border-color 0.1s, color 0.1s;
}
.gx-close-btn:hover { border-color: var(--gx-red); color: var(--gx-red); }

/* ── Step tabs ── */
.gx-steps {
  display: flex; gap: 0;
  border-bottom: 1px solid var(--gx-line);
  background: rgba(0,0,0,0.35);
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
}
.gx-steps::-webkit-scrollbar { display: none; }

.gx-step-tab {
  display: flex; align-items: center; gap: 9px;
  padding: 12px 20px;
  border: none; background: transparent;
  color: var(--gx-text-dim); cursor: pointer;
  font-size: 10px;
  font-weight: 700; letter-spacing: 1.8px;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  transition: color 0.1s;
  flex-shrink: 0;
}
.gx-step-tab:hover { color: var(--gx-text-muted); }
.gx-step-tab.active {
  color: var(--gx-red);
  border-bottom-color: var(--gx-red);
}
.gx-step-num {
  width: 19px; height: 19px;
  background: transparent;
  border: 1px solid var(--gx-line);
  color: var(--gx-text-dim); font-size: 9px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
}
.gx-step-tab.active .gx-step-num {
  background: var(--gx-red); border-color: var(--gx-red); color: #fff;
}
.gx-step-num.done {
  background: rgba(225,29,46,0.12);
  border-color: rgba(225,29,46,0.4);
  color: var(--gx-red);
}

/* ── Main body ── */
.gx-body { flex: 1; display: flex; overflow: hidden; position: relative; }
.gx-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

/* ── Panel header ── */
.gx-panel-hdr {
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--gx-line);
  flex-shrink: 0;
}
.gx-panel-label {
  font-size: 9px;
  font-weight: 700; letter-spacing: 2.5px; color: var(--gx-red);
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px; text-transform: uppercase;
}
.gx-panel-label::before { content: ''; width: 10px; height: 2px; background: var(--gx-red); }

/* ── Search bar ── */
.gx-search-wrap { position: relative; }
.gx-search {
  width: 100%; padding: 10px 14px 10px 36px;
  background: var(--gx-bg);
  border: 1px solid var(--gx-line);
  color: var(--gx-text);
  font-family: 'Inter', sans-serif; font-size: 14px;
  outline: none;
}
.gx-search::placeholder { color: var(--gx-text-dim); }
.gx-search:focus { border-color: var(--gx-red); }
.gx-search-ic { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--gx-text-dim); font-size: 12px; pointer-events: none; }
.gx-search-spin { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--gx-red); font-size: 11px; }

/* ── Step 1: Team grid ── */
.gx-team-grid-wrap { flex: 1; overflow-y: auto; padding: 16px 20px; scrollbar-width: thin; scrollbar-color: rgba(225,29,46,0.2) transparent; }
.gx-team-grid-wrap::-webkit-scrollbar { width: 3px; }
.gx-team-grid-wrap::-webkit-scrollbar-thumb { background: rgba(225,29,46,0.25); }
.gx-team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
@media (max-width: 600px) { .gx-team-grid { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; } }

/* ── Team card (with corner-bracket framing, matches broadcast HUD motif) ── */
.gx-team-card {
  position: relative; cursor: pointer;
  background: var(--gx-panel);
  border: 1px solid var(--gx-line);
  padding: 16px 10px 12px;
  display: flex; flex-direction: column;
  align-items: center; gap: 8px;
  text-align: center;
  transition: border-color 0.1s, background-color 0.1s;
  user-select: none;
}
.gx-team-card:hover { border-color: rgba(225,29,46,0.4); background: var(--gx-panel-raised); }
.gx-team-card.selected { border-color: var(--gx-red); background: rgba(225,29,46,0.06); }
.gx-team-card.selected::before,
.gx-team-card.selected::after {
  content: ''; position: absolute; width: 10px; height: 10px;
  border-top: 2px solid var(--gx-red); border-left: 2px solid var(--gx-red);
  top: -1px; left: -1px;
}
.gx-team-card.selected::after { top: auto; left: auto; bottom: -1px; right: -1px; border: none; border-bottom: 2px solid var(--gx-red); border-right: 2px solid var(--gx-red); }

.gx-card-check {
  position: absolute; top: 6px; right: 6px;
  width: 16px; height: 16px;
  background: var(--gx-red);
  display: flex; align-items: center; justify-content: center;
}
.gx-card-slot-pip {
  position: absolute; top: 6px; left: 6px;
  font-size: 8px; font-weight: 800; color: #fff;
  background: rgba(0,0,0,0.6); border: 1px solid var(--gx-red);
  padding: 1px 5px; line-height: 1.4;
}
.gx-card-logo { width: 46px; height: 46px; object-fit: cover; border: 1px solid var(--gx-line); }
.gx-card-logo-placeholder {
  width: 46px; height: 46px;
  background: var(--gx-bg); border: 1px solid var(--gx-line);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 800; color: var(--gx-red); opacity: 0.6;
}
.gx-card-tag { font-size: 10px; font-weight: 700; color: var(--gx-text); letter-spacing: 0.5px; }
.gx-card-name { font-size: 11px; color: var(--gx-text-dim); line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-weight: 500; }

/* ── Selection bar ── */
.gx-sel-bar { padding: 12px 20px; border-top: 1px solid var(--gx-line); background: rgba(0,0,0,0.4); display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.gx-sel-count { font-size: 9px; color: var(--gx-text-dim); letter-spacing: 1px; text-transform: uppercase; }
.gx-sel-count span { color: var(--gx-red); font-size: 14px; font-weight: 800; }
.gx-sel-chips { flex: 1; display: flex; gap: 6px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
.gx-sel-chips::-webkit-scrollbar { display: none; }
.gx-sel-chip {
  display: flex; align-items: center; gap: 5px;
  background: rgba(225,29,46,0.08); border: 1px solid rgba(225,29,46,0.35);
  padding: 3px 8px; font-size: 9px; font-weight: 700; color: var(--gx-red);
  white-space: nowrap; cursor: pointer; flex-shrink: 0;
  transition: background-color 0.1s, border-color 0.1s;
}
.gx-sel-chip:hover { background: rgba(225,29,46,0.2); }
.gx-sel-chip-x { font-size: 8px; opacity: 0.7; }

/* ── Step 2: Slots ── */
.gx-slots-wrap { flex: 1; overflow-y: auto; padding: 16px 20px; scrollbar-width: thin; scrollbar-color: rgba(225,29,46,0.2) transparent; }
.gx-slots-wrap::-webkit-scrollbar { width: 3px; }
.gx-slots-wrap::-webkit-scrollbar-thumb { background: rgba(225,29,46,0.25); }

.gx-slot-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; margin-bottom: 6px;
  background: var(--gx-panel); border: 1px solid var(--gx-line);
  transition: border-color 0.1s;
}
.gx-slot-row:hover { border-color: rgba(225,29,46,0.35); }

.gx-slot-num-badge {
  font-size: 11px; font-weight: 800; color: #fff; background: var(--gx-red);
  min-width: 30px; height: 26px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.gx-slot-logo { width: 32px; height: 32px; object-fit: cover; border: 1px solid var(--gx-line); flex-shrink: 0; }
.gx-slot-nlogo { width: 32px; height: 32px; flex-shrink: 0; background: var(--gx-bg); border: 1px solid var(--gx-line); display: flex; align-items: center; justify-content: center; font-size: 9px; color: var(--gx-red); opacity: 0.6; }
.gx-slot-info { flex: 1; min-width: 0; }
.gx-slot-tag { font-size: 11px; font-weight: 700; color: var(--gx-text); }
.gx-slot-full { font-size: 12px; color: var(--gx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gx-slot-num-input {
  width: 50px; padding: 5px 6px; text-align: center;
  background: var(--gx-bg); border: 1px solid var(--gx-line);
  color: var(--gx-red); font-size: 11px; font-weight: 700; outline: none; flex-shrink: 0;
}
.gx-slot-num-input:focus { border-color: var(--gx-red); }
.gx-slot-rm {
  width: 24px; height: 24px; flex-shrink: 0;
  background: transparent; border: 1px solid var(--gx-line); color: var(--gx-text-dim); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: border-color 0.1s, color 0.1s;
}
.gx-slot-rm:hover { border-color: var(--gx-red); color: var(--gx-red); }

/* ── Group name input ── */
.gx-group-name-input {
  width: 100%; padding: 11px 15px;
  background: var(--gx-bg); border: 1px solid var(--gx-line);
  color: var(--gx-text); font-size: 13px; font-weight: 700; letter-spacing: 0.5px; outline: none;
}
.gx-group-name-input::placeholder { color: var(--gx-text-dim); font-family: 'Inter', sans-serif; font-weight: 400; letter-spacing: 0; }
.gx-group-name-input:focus { border-color: var(--gx-red); }

/* ── Step 3: Groups list ── */
.gx-groups-scroll { flex: 1; overflow-y: auto; padding: 16px 20px; scrollbar-width: thin; scrollbar-color: rgba(225,29,46,0.2) transparent; }
.gx-groups-scroll::-webkit-scrollbar { width: 3px; }
.gx-groups-scroll::-webkit-scrollbar-thumb { background: rgba(225,29,46,0.25); }

.gx-group-card { background: var(--gx-panel); border: 1px solid var(--gx-line); border-left: 2px solid var(--gx-red); margin-bottom: 10px; transition: border-color 0.1s; }
.gx-group-card:hover { border-color: rgba(225,29,46,0.4); border-left-color: var(--gx-red); }

.gx-group-card-hdr { display: flex; align-items: center; padding: 13px 16px; cursor: pointer; gap: 10px; }
.gx-group-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--gx-red); flex-shrink: 0; }
.gx-group-card-name { font-size: 12px; font-weight: 700; color: var(--gx-text); letter-spacing: 0.4px; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; }
.gx-group-card-badge { font-size: 9px; font-weight: 700; color: var(--gx-red); background: rgba(225,29,46,0.08); border: 1px solid rgba(225,29,46,0.3); padding: 2px 8px; flex-shrink: 0; }
.gx-group-card-actions { display: flex; gap: 5px; flex-shrink: 0; }
.gx-group-ic { width: 26px; height: 26px; border: 1px solid var(--gx-line); cursor: pointer; display: flex; align-items: center; justify-content: center; background: transparent; transition: border-color 0.1s, background-color 0.1s; }
.gx-group-ic-e:hover { border-color: #3b82f6; background: rgba(59,130,246,0.12); }
.gx-group-ic-d:hover { border-color: var(--gx-red); background: rgba(225,29,46,0.12); }
.gx-chevron { color: var(--gx-text-dim); font-size: 9px; margin-left: 2px; flex-shrink: 0; }

.gx-group-teams { border-top: 1px solid var(--gx-line); background: rgba(0,0,0,0.2); padding: 8px 16px 12px; }
.gx-group-team-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; margin-bottom: 3px; transition: background-color 0.1s; }
.gx-group-team-row:hover { background: rgba(225,29,46,0.05); }
.gx-group-slot-pill { font-size: 9px; font-weight: 800; color: #fff; background: var(--gx-red); min-width: 28px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.gx-group-tlogo { width: 32px; height: 32px; object-fit: cover; border: 1px solid var(--gx-line); flex-shrink: 0; }
.gx-group-tnlogo { width: 32px; height: 32px; flex-shrink: 0; background: var(--gx-bg); border: 1px solid var(--gx-line); display: flex; align-items: center; justify-content: center; font-size: 9px; color: var(--gx-red); opacity: 0.5; }
.gx-group-ttag { font-size: 11px; font-weight: 700; color: var(--gx-text-muted); }
.gx-group-tname { font-size: 12px; color: var(--gx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── Footer ── */
.gx-footer { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--gx-line); background: rgba(0,0,0,0.5); flex-shrink: 0; }
.gx-btn-primary {
  flex: 1; padding: 12px 20px;
  background: var(--gx-red); color: #fff; border: 1px solid var(--gx-red);
  font-size: 11px; font-weight: 700; letter-spacing: 1.5px;
  cursor: pointer; text-transform: uppercase;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: background-color 0.1s, opacity 0.1s;
}
.gx-btn-primary:hover:not(:disabled) { background: var(--gx-red-dim); border-color: var(--gx-red-dim); }
.gx-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
.gx-btn-ghost {
  padding: 12px 16px; background: transparent; color: var(--gx-text-dim);
  border: 1px solid var(--gx-line); font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: border-color 0.1s, color 0.1s;
}
.gx-btn-ghost:hover { color: var(--gx-text-muted); border-color: rgba(225,29,46,0.4); }
.gx-btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }
.gx-spin { animation: gx-spin 0.7s linear infinite; }
@keyframes gx-spin { to { transform: rotate(360deg); } }

/* ── Empty state ── */
.gx-empty { text-align: center; padding: 40px 20px; color: var(--gx-text-dim); font-size: 9px; letter-spacing: 2px; border: 1px dashed var(--gx-line); text-transform: uppercase; }
.gx-empty-icon { font-size: 26px; margin-bottom: 12px; opacity: 0.3; color: var(--gx-red); }

/* ── Desktop layout ── */
@media (min-width: 768px) {
  .gx-body { flex-direction: row; }
  .gx-left-panel { flex: 1; display: flex; flex-direction: column; border-right: 1px solid var(--gx-line); overflow: hidden; }
  .gx-right-panel { width: 320px; display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; }
}
@media (max-width: 767px) {
  .gx-left-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .gx-right-panel { display: none; }
  .gx-body.show-groups .gx-left-panel { display: none; }
  .gx-body.show-groups .gx-right-panel { display: flex; flex: 1; flex-direction: column; }
}

/* ── Ambient scanlines — static, no animation, cheap to paint ── */
.gx-scan {
  position: absolute; inset: 0; pointer-events: none; z-index: 2; opacity: 0.02;
  background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(225,29,46,0.6) 2px, rgba(225,29,46,0.6) 4px);
}

/* ── Bulk-add-via-paste modal ── */
/* ── Bulk-add-via-paste modal ── */


/*
  IMPORTANT:
  BulkAddModal uses createPortal(..., document.body), so it is OUTSIDE
  .gx-root. Therefore this modal must not depend on CSS variables that
  only exist inside .gx-root.
*/

.gx-modal-overlay {
  --gx-modal-red: #E11D2E;
  --gx-modal-red-bright: #FF2633;
  --gx-modal-white: #FFFFFF;
  --gx-modal-bg: #09090B;
  --gx-modal-panel: #111114;
  --gx-modal-panel-hover: #17171B;
  --gx-modal-border: #2B2B30;
  --gx-modal-border-light: #3A3A40;

  position: fixed;
  inset: 0;

  width: 100vw;
  height: 100vh;

  background: rgba(0, 0, 0, 0.84);

  display: flex;
  align-items: center;
  justify-content: center;

  z-index: 99999;

  padding: 16px;

  color: #FFFFFF;
}


/* ── Make sizing consistent inside portal ── */

.gx-modal-overlay *,
.gx-modal-overlay *::before,
.gx-modal-overlay *::after {
  box-sizing: border-box;
}


/* ── Main modal ── */

.gx-modal-box {
  width: 100%;
  max-width: 680px;
  max-height: 88vh;

  overflow-y: auto;
  overflow-x: hidden;

  position: relative;

  background: var(--gx-modal-bg);

  border: 1px solid var(--gx-modal-border);
  border-top: 3px solid var(--gx-modal-red);

  color: #FFFFFF;

  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.90),
    0 0 45px rgba(225, 29, 46, 0.08);

  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
}


/* Inner border */

.gx-modal-box::before {
  content: '';

  position: absolute;
  inset: 0;

  pointer-events: none;

  border: 1px solid rgba(255, 255, 255, 0.035);

  z-index: 10;
}


/* ── FORCE MODAL TEXT WHITE ── */

.gx-modal-box,
.gx-modal-box div,
.gx-modal-box span,
.gx-modal-box p,
.gx-modal-box label,
.gx-modal-box h1,
.gx-modal-box h2,
.gx-modal-box h3,
.gx-modal-box h4,
.gx-modal-box h5,
.gx-modal-box h6,
.gx-modal-box button,
.gx-modal-box textarea,
.gx-modal-box input {
  color: #FFFFFF;
}


/* ── Header ── */

.gx-modal-hdr {
  position: sticky;
  top: 0;

  z-index: 20;

  display: flex;
  align-items: center;
  justify-content: space-between;

  padding: 17px 20px;

  min-height: 58px;

  background: #0D0D10;

  border-bottom: 1px solid #242428;
}


/* Small red header accent */

.gx-modal-hdr::after {
  content: '';

  position: absolute;

  left: 20px;
  bottom: -1px;

  width: 44px;
  height: 2px;

  background: var(--gx-modal-red);
}


/* Modal title */

.gx-modal-hdr .gx-disp {
  color: #FFFFFF !important;

  font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;

  font-size: 15px;
  font-weight: 800;

  letter-spacing: 0.8px;

  text-transform: uppercase;
}


/* ── Close button ── */

.gx-modal-hdr .gx-close-btn {
  width: 32px;
  height: 32px;

  padding: 0;
  margin: 0;

  flex-shrink: 0;

  display: flex;
  align-items: center;
  justify-content: center;

  background: transparent;

  border: 1px solid #303035;

  color: #FFFFFF !important;

  cursor: pointer;

  transition:
    border-color 0.12s ease,
    background-color 0.12s ease,
    color 0.12s ease;
}

.gx-modal-hdr .gx-close-btn svg {
  color: #FFFFFF !important;
  fill: #FFFFFF !important;
}

.gx-modal-hdr .gx-close-btn:hover {
  background: rgba(225, 29, 46, 0.12);

  border-color: var(--gx-modal-red);

  color: #FFFFFF !important;
}


/* ── Body ── */

.gx-modal-body {
  padding: 20px;

  background: var(--gx-modal-bg);

  color: #FFFFFF;
}


/* ── CSV textarea ── */

.gx-modal-body textarea.gx-search {
  width: 100%;

  min-height: 140px;

  padding: 14px;

  resize: vertical;

  background: #050507;

  border: 1px solid #303035;

  color: #FFFFFF !important;

  caret-color: var(--gx-modal-red);

  outline: none;

  font-family: 'JetBrains Mono', ui-monospace, monospace;

  font-size: 12px;

  line-height: 1.5;

  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}


/* Textarea placeholder */

.gx-modal-body textarea.gx-search::placeholder {
  color: #77777E !important;

  opacity: 1;
}


/* Textarea focus */

.gx-modal-body textarea.gx-search:focus {
  background: #08080A;

  border-color: var(--gx-modal-red);

  color: #FFFFFF !important;

  box-shadow:
    0 0 0 1px rgba(225, 29, 46, 0.18),
    0 0 18px rgba(225, 29, 46, 0.08);
}


/* ── Instruction text ── */

.gx-modal-body > span {
  display: block;

  margin-top: 6px;

  color: #FFFFFF !important;

  font-size: 12px;
}


/* ── Warning ── */

.gx-modal-body > div[style*="color"] {
  color: #FFFFFF;
}


/* ── Error ── */

.gx-modal-body p {
  color: #FFFFFF;
}

.gx-modal-body p[style*="var(--gx-red)"] {
  color: var(--gx-modal-red-bright) !important;
}


/* ── Bulk rows ── */

.gx-bulk-row {
  padding: 12px 0;

  border-bottom: 1px solid #242428;

  color: #FFFFFF;
}


/* ── Search query ── */

.gx-bulk-query {
  margin-bottom: 8px;

  color: #FFFFFF !important;

  font-family: 'JetBrains Mono', ui-monospace, monospace;

  font-size: 11px;
}


/* ── Search match ── */

.gx-bulk-match {
  display: flex;
  align-items: center;

  gap: 10px;

  width: 100%;

  padding: 10px 12px;

  margin-bottom: 6px;

  background: var(--gx-modal-panel);

  border: 1px solid var(--gx-modal-border);

  color: #FFFFFF !important;

  cursor: pointer;

  transition:
    background-color 0.12s ease,
    border-color 0.12s ease,
    box-shadow 0.12s ease;
}


/* Every child inside match */

.gx-bulk-match span,
.gx-bulk-match div {
  color: #FFFFFF;
}


/* Hover */

.gx-bulk-match:hover {
  background: var(--gx-modal-panel-hover);

  border-color: #55555C;

  box-shadow:
    inset 3px 0 0 var(--gx-modal-red);
}


/* Selected */

.gx-bulk-match.marked {
  background:
    linear-gradient(
      90deg,
      rgba(225, 29, 46, 0.16),
      rgba(225, 29, 46, 0.04)
    );

  border-color: var(--gx-modal-red);

  box-shadow:
    inset 3px 0 0 var(--gx-modal-red),
    0 0 14px rgba(225, 29, 46, 0.06);
}


/* ── Match checkbox ── */

.gx-bulk-match-check {
  width: 16px;
  height: 16px;

  flex-shrink: 0;

  display: flex;
  align-items: center;
  justify-content: center;

  background: #08080A;

  border: 1px solid #55555C;

  color: #FFFFFF !important;
}

.gx-bulk-match-check svg {
  color: #FFFFFF !important;
  fill: #FFFFFF !important;
}


.gx-bulk-match.marked .gx-bulk-match-check {
  background: var(--gx-modal-red);

  border-color: var(--gx-modal-red-bright);

  color: #FFFFFF !important;
}


/* ── Team logo inside results ── */

.gx-modal-box .gx-card-logo {
  width: 28px;
  height: 28px;

  flex-shrink: 0;

  object-fit: cover;

  border: 1px solid var(--gx-modal-border);
}


/* ── Logo placeholder ── */

.gx-modal-box .gx-card-logo-placeholder {
  width: 28px;
  height: 28px;

  flex-shrink: 0;

  display: flex;
  align-items: center;
  justify-content: center;

  background: #08080A;

  border: 1px solid var(--gx-modal-border);

  color: #FFFFFF !important;

  font-size: 9px;
}


/* ── No match ── */

.gx-bulk-nomatch {
  display: flex;
  align-items: center;

  gap: 8px;

  padding: 10px 12px;

  background: #0D0D10;

  border: 1px solid #252529;

  color: #FFFFFF !important;

  font-size: 12px;
}

.gx-bulk-nomatch svg {
  color: var(--gx-modal-red) !important;
}


/* ── Summary ── */

.gx-bulk-summary {
  position: relative;

  display: flex;
  align-items: center;

  gap: 22px;

  padding: 12px 14px 12px 17px;

  background: var(--gx-modal-panel);

  border: 1px solid #303035;

  color: #FFFFFF !important;

  font-family: 'JetBrains Mono', ui-monospace, monospace;
}


/* Red vertical accent */

.gx-bulk-summary::before {
  content: '';

  position: absolute;

  left: 0;
  top: 0;
  bottom: 0;

  width: 3px;

  background: var(--gx-modal-red);
}


/* ALL summary text white */

.gx-bulk-summary span,
.gx-bulk-summary span:first-child,
.gx-bulk-summary span:nth-child(2),
.gx-bulk-summary span:nth-child(3) {
  color: #FFFFFF !important;

  font-size: 11px;
}


/* ── Result list scrollbar ── */

.gx-modal-box div[style*="max-height"]::-webkit-scrollbar {
  width: 5px;
}

.gx-modal-box div[style*="max-height"]::-webkit-scrollbar-track {
  background: #08080A;
}

.gx-modal-box div[style*="max-height"]::-webkit-scrollbar-thumb {
  background: #401419;
}

.gx-modal-box div[style*="max-height"]::-webkit-scrollbar-thumb:hover {
  background: var(--gx-modal-red);
}


/* ── Modal scrollbar ── */

.gx-modal-box::-webkit-scrollbar {
  width: 6px;
}

.gx-modal-box::-webkit-scrollbar-track {
  background: #08080A;
}

.gx-modal-box::-webkit-scrollbar-thumb {
  background: #401419;
}

.gx-modal-box::-webkit-scrollbar-thumb:hover {
  background: var(--gx-modal-red);
}


/* ── Buttons ── */

.gx-modal-box .gx-btn-ghost {
  padding: 12px 16px;

  background: transparent;

  border: 1px solid #303035;

  color: #FFFFFF !important;

  font-family: 'Inter', sans-serif;

  font-size: 13px;
  font-weight: 600;

  cursor: pointer;

  transition:
    border-color 0.12s ease,
    background-color 0.12s ease;
}

.gx-modal-box .gx-btn-ghost:hover {
  background: rgba(225, 29, 46, 0.08);

  border-color: var(--gx-modal-red);

  color: #FFFFFF !important;
}


/* ── Primary button ── */

.gx-modal-box .gx-btn-primary {
  flex: 1;

  padding: 12px 20px;

  background: var(--gx-modal-red);

  border: 1px solid var(--gx-modal-red);

  color: #FFFFFF !important;

  font-size: 11px;
  font-weight: 700;

  letter-spacing: 1.5px;

  text-transform: uppercase;

  cursor: pointer;

  display: flex;
  align-items: center;
  justify-content: center;

  gap: 8px;

  transition:
    background-color 0.12s ease,
    border-color 0.12s ease,
    opacity 0.12s ease;
}

.gx-modal-box .gx-btn-primary:hover:not(:disabled) {
  background: #FF1622;

  border-color: #FF1622;
}

.gx-modal-box .gx-btn-primary:disabled {
  opacity: 0.45;

  cursor: not-allowed;
}


/* ── Spinner ── */

.gx-modal-box .gx-spin {
  color: #FFFFFF !important;
}


/* ── Mono text ── */

.gx-modal-box .gx-mono {
  color: #FFFFFF;
}


/* ── Explicit red text where needed ── */

.gx-modal-box .gx-bulk-match .gx-mono {
  color: var(--gx-modal-red-bright) !important;
}


/* ── "Already in group" text ── */

.gx-modal-box .gx-bulk-match span[style*="marginLeft"] {
  color: #FFFFFF !important;

  opacity: 0.7;
}


/* ── Mobile ── */

@media (max-width: 600px) {
  .gx-modal-overlay {
    padding: 10px;
  }

  .gx-modal-box {
    max-height: 94vh;
  }

  .gx-modal-hdr {
    padding: 14px 16px;
  }

  .gx-modal-body {
    padding: 15px;
  }

  .gx-bulk-summary {
    gap: 12px;

    flex-wrap: wrap;
  }
}
`;

// ── Memoized subcomponents ─────────────────────────────────────────────────────
// Extracted so selecting/editing one item only re-renders its own row/card,
// not the whole list.

const TeamCard = React.memo(function TeamCard({
  team, isSelected, slot, onToggle,
}: { team: Team; isSelected: boolean; slot: number | null | undefined; onToggle: (team: Team) => void }) {
  return (
    <div className={`gx-team-card${isSelected ? ' selected' : ''}`} onClick={() => onToggle(team)}>
      {isSelected && (
        <div className="gx-card-check">
          <FaCheck size={8} color="#fff" />
        </div>
      )}
      {isSelected && slot != null && <span className="gx-card-slot-pip">S{slot}</span>}
      {team.logo
        ? <img src={team.logo} alt={team.teamTag} className="gx-card-logo" loading="lazy" decoding="async" />
        : <div className="gx-card-logo-placeholder">{team.teamTag?.slice(0, 2)}</div>
      }
      <span className="gx-card-tag gx-mono">{team.teamTag}</span>
      <span className="gx-card-name">{team.teamFullName}</span>
    </div>
  );
});

const SlotRow = React.memo(function SlotRow({
  team, slot, onSlotChange, onRemove,
}: { team: Team | undefined; slot: number | null; onSlotChange: (id: string, val: string) => void; onRemove: (id: string) => void }) {
  if (!team) return null;
  return (
    <div className="gx-slot-row">
      <div className="gx-slot-num-badge gx-mono">{slot ?? '?'}</div>
      {team.logo
        ? <img src={team.logo} alt="" className="gx-slot-logo" loading="lazy" decoding="async" />
        : <div className="gx-slot-nlogo gx-mono">{team.teamTag?.slice(0, 2)}</div>
      }
      <div className="gx-slot-info">
        <div className="gx-slot-tag gx-mono">{team.teamTag}</div>
        <div className="gx-slot-full">{team.teamFullName}</div>
      </div>
      <input
        type="number" min={1} value={slot ?? ""}
        onChange={e => onSlotChange(team._id, e.target.value)}
        className="gx-slot-num-input gx-mono"
        title="Slot number"
      />
      <button className="gx-slot-rm" onClick={() => onRemove(team._id)} aria-label={`Remove ${team.teamTag}`}>
        <FaTimes size={9} />
      </button>
    </div>
  );
});

const GroupCard = React.memo(function GroupCard({
  group, isExpanded, onToggleExpand, onEdit, onDelete,
}: { group: Group; isExpanded: boolean; onToggleExpand: (id: string) => void; onEdit: (g: Group) => void; onDelete: (id: string) => void }) {
  const sorted = useMemo(() => [...(group.slots || [])].sort((a, b) => a.slot - b.slot), [group.slots]);
  return (
    <div className="gx-group-card">
      <div className="gx-group-card-hdr" onClick={() => onToggleExpand(group._id)}>
        <span className="gx-group-dot" />
        <span className="gx-group-card-name">{group.groupName}</span>
        <span className="gx-group-card-badge gx-mono">{sorted.length}T</span>
        <div className="gx-group-card-actions">
          <button className="gx-group-ic gx-group-ic-e"
            onClick={e => { e.stopPropagation(); onEdit(group); }}
            onMouseDown={e => e.preventDefault()}
            aria-label="Edit group">
            <FaEdit color="#93959C" size={11} />
          </button>
          <button className="gx-group-ic gx-group-ic-d"
            onClick={e => { e.stopPropagation(); onDelete(group._id); }}
            onMouseDown={e => e.preventDefault()}
            aria-label="Delete group">
            <FaTrash color="#93959C" size={11} />
          </button>
        </div>
        <span className="gx-chevron">{isExpanded ? <FaChevronUp size={9} /> : <FaChevronDown size={9} />}</span>
      </div>
      {isExpanded && (
        <div className="gx-group-teams">
          {sorted.length === 0 ? (
            <div className="gx-empty" style={{ padding: '12px' }}>No teams assigned</div>
          ) : sorted.map((slot, idx) => (
            <React.Fragment key={slot._id}>
              <div className="gx-group-team-row">
                <div className="gx-group-slot-pill gx-mono">S{slot.slot}</div>
                {slot.team?.logo
                  ? <img src={slot.team.logo} alt="" className="gx-group-tlogo" loading="lazy" decoding="async" />
                  : <div className="gx-group-tnlogo gx-mono">{slot.team?.teamTag?.slice(0, 2)}</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="gx-group-ttag gx-mono">{slot.team?.teamTag || '—'}</div>
                  <div className="gx-group-tname">{slot.team?.teamFullName || 'Unknown'}</div>
                </div>
              </div>
              {idx < sorted.length - 1 && <div style={{ height: 1, background: 'rgba(225,29,46,0.08)', margin: '0 4px' }} />}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
});

// ── Bulk add modal ──────────────────────────────────────────────────────────────
// Portals to document.body: .gx-overlay sets backdrop-filter (a containing
// block for position:fixed descendants) plus overflow:hidden, so a plain
// fixed-position modal rendered inside it would get clipped to the 70vh
// panel instead of covering the viewport.
const BulkAddModal: React.FC<{
  onClose: () => void;
  onApply: (marked: { team: Team; slot: number | null }[]) => void;
  alreadySelectedIds: Set<string>;
}> = ({ onClose, onApply, alreadySelectedIds }) => {
  const [csvText, setCsvText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [response, setResponse] = useState<BulkSearchResponse | null>(null);
  const [markedByRow, setMarkedByRow] = useState<Record<number, string | null>>({});

  const { parsed, warnings } = useMemo(() => {
    if (!csvText.trim()) return { parsed: [] as BulkAddParsedRow[], warnings: [] as string[], truncatedCount: 0 };
    const raw = Papa.parse<string[]>(csvText, { skipEmptyLines: true });
    return parseBulkAddRows(raw.data);
  }, [csvText]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCsvText(e.target.value);
    setResponse(null);
    setSearchError(null);
    setMarkedByRow({});
  }, []);

  const handleSearch = useCallback(async () => {
    if (searching || parsed.length === 0) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await api.post<BulkSearchResponse>('/teams/bulk-search', {
        queries: parsed.map(p => ({ teamName: p.teamName, teamTag: p.teamTag })),
      });
      setResponse(res.data);
      const initial: Record<number, string | null> = {};
      res.data.results.forEach((r, i) => { if (r.matches.length === 1) initial[i] = r.matches[0]._id; });
      setMarkedByRow(initial);
    } catch (err: any) {
      setSearchError(err?.response?.data?.error || 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [parsed, searching]);

  const toggleMark = useCallback((rowIndex: number, teamId: string) => {
    setMarkedByRow(prev => ({ ...prev, [rowIndex]: prev[rowIndex] === teamId ? null : teamId }));
  }, []);

  const markedCount = useMemo(() => Object.values(markedByRow).filter(Boolean).length, [markedByRow]);

  const handleApply = useCallback(() => {
    if (!response) return;
    const marked: { team: Team; slot: number | null }[] = [];
    response.results.forEach((r, i) => {
      const teamId = markedByRow[i];
      if (!teamId) return;
      const team = r.matches.find(m => m._id === teamId);
      if (team) marked.push({ team, slot: parsed[i]?.slot ?? null });
    });
    if (marked.length === 0) return;
    onApply(marked);
    onClose();
  }, [response, markedByRow, parsed, onApply, onClose]);

  return createPortal(
    <div className="gx-modal-overlay" onClick={onClose}>
      <div className="gx-modal-box" onClick={e => e.stopPropagation()}>
        <div className="gx-modal-hdr">
          <span className="gx-disp" style={{ color: 'var(--gx-text)', fontSize: 15, fontWeight: 800, textTransform: 'uppercase' }}>Bulk add from CSV</span>
          <button className="gx-close-btn" onClick={onClose} aria-label="Close"><FaTimes size={13} /></button>
        </div>
        <div className="gx-modal-body">
          {!response ? (
            <>
              <textarea
                value={csvText}
                onChange={handleTextChange}
                rows={8}
                placeholder={'slot,team_name,team_tag\n1,CYBERHERO,CH\n2,GEEKAY ESPORTS,Geekay\n…\n\n— or —\n\nteam_name,team_tag\nCYBERHERO,CH\nGEEKAY ESPORTS,Geekay\n…'}
                className="gx-search gx-mono"
                style={{ paddingLeft: 14, resize: 'vertical', minHeight: 140, lineHeight: 1.5, width: '100%' }}
              />
              <span style={{ color: 'var(--gx-text-dim)', fontSize: 12, display: 'block', marginTop: 6 }}>
                Either "slot,team_name,team_tag" or "team_name,team_tag" (no slot). Header row optional.
              </span>
              {warnings.length > 0 && (
                <div style={{ color: 'var(--gx-red)', fontSize: 12, marginTop: 8 }}>{warnings.length} row(s) skipped — missing name/tag.</div>
              )}
              {searchError && <p style={{ color: 'var(--gx-red)', fontSize: 13, marginTop: 12 }}>{searchError}</p>}
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="gx-btn-ghost" onClick={onClose}>Cancel</button>
                <button className="gx-btn-primary" disabled={parsed.length === 0 || searching} onClick={handleSearch}>
                  {searching ? 'Searching…' : `Search ${parsed.length} row${parsed.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="gx-bulk-summary gx-mono">
                <span>{response.matchedRows} matched</span>
                <span>{response.unmatchedRows} unmatched</span>
                <span>{markedCount} marked</span>
              </div>
              <div style={{ maxHeight: 420, overflowY: 'auto', marginTop: 14 }}>
                {response.results.map((row, i) => (
                  <div key={i} className="gx-bulk-row">
                    <div className="gx-bulk-query gx-mono">
                      {parsed[i]?.slot != null ? `S${parsed[i].slot} — ` : ''}{row.teamName} [{row.teamTag}]
                    </div>
                    {row.matches.length === 0 ? (
                      <div className="gx-bulk-nomatch"><FaTimes size={10} /> No match found</div>
                    ) : (
                      <>
                        {row.matches.map(m => (
                          <div
                            key={m._id}
                            className={`gx-bulk-match${markedByRow[i] === m._id ? ' marked' : ''}`}
                            onClick={() => toggleMark(i, m._id)}
                          >
                            <div className="gx-bulk-match-check">{markedByRow[i] === m._id && <FaCheck size={8} color="#fff" />}</div>
                            {m.logo
                              ? <img src={m.logo} alt="" className="gx-card-logo" style={{ width: 28, height: 28 }} />
                              : <div className="gx-card-logo-placeholder" style={{ width: 28, height: 28 }}>{m.teamTag?.slice(0, 2)}</div>}
                            <span style={{ color: 'var(--gx-text)', fontSize: 13 }}>{m.teamFullName}</span>
                            <span className="gx-mono" style={{ color: 'var(--gx-red)', fontSize: 11 }}>[{m.teamTag}]</span>
                            {alreadySelectedIds.has(m._id) && <span style={{ marginLeft: 'auto', color: 'var(--gx-text-dim)', fontSize: 10 }}>already in group</span>}
                          </div>
                        ))}
                        {row.truncated && (
                          <p style={{ color: 'var(--gx-text-dim)', fontSize: 11 }}>+more matches — refine this row's name/tag</p>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
              <p style={{ color: 'var(--gx-text-dim)', fontSize: 11, marginTop: 10 }}>
                Conflicting slot numbers will be auto-adjusted — reviewable on the next step.
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="gx-btn-ghost" onClick={onClose}>Cancel</button>
                <button className="gx-btn-primary" disabled={markedCount === 0} onClick={handleApply}>
                  Add {markedCount} marked team{markedCount === 1 ? '' : 's'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const Group = React.forwardRef<GroupRef, GroupProps>(({ onSelectionChange }, ref) => {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const [groupName, setGroupName] = useState("");
  const [showForm, setShowForm]       = useState(false);
  const [teams, setTeams]             = useState<Team[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<SelectedTeam[]>([]);
  const groupNameRef                  = useRef<HTMLInputElement>(null);
  const [groups, setGroups]           = useState<Group[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm]   = useState("");
  const [teamSearchLoading, setTeamSearchLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [activeStep, setActiveStep]   = useState<1 | 2 | 3>(1);
  const [mobileShowGroups, setMobileShowGroups] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false); // synchronous guard, closes the double-click race that state alone can't
  const [groupSearchTerm, setGroupSearchTerm] = useState("");
  const GROUPS_CACHE_KEY = `cache:v1:groups:${tournamentId}`;

  // Cache of every team object the user has ever selected (or is editing
  // into a group), keyed by _id. Server-side search means `teams` only
  // holds the *current* page of results — without this cache, typing a
  // new search term after selecting a team would make that team's chip /
  // slot row render blank (team lookup by id would miss).
  const [selectedTeamsCache, setSelectedTeamsCache] = useState<Map<string, Team>>(new Map());
  const resolveTeam = useCallback(
    (id: string) => teams.find(t => t._id === id) || selectedTeamsCache.get(id),
    [teams, selectedTeamsCache]
  );

  const filteredGroups = useMemo(() => {
    const q = groupSearchTerm.toLowerCase();
    return groups.filter(group =>
      group.groupName.toLowerCase().includes(q) ||
      group.slots?.some(slot =>
        slot.team?.teamTag?.toLowerCase().includes(q) ||
        slot.team?.teamFullName?.toLowerCase().includes(q)
      )
    );
  }, [groups, groupSearchTerm]);

  React.useImperativeHandle(ref, () => ({
    openForm: () => {
      // Data is already prefetched on mount — just reset and show.
      setShowForm(true);
      clearForm();
      setActiveStep(1);
    }
  }));

  const isCanceled = (err: any) => err?.name === 'CanceledError' || err?.name === 'AbortError' || err?.code === 'ERR_CANCELED';

  // Fetch teams + groups together, in parallel, so opening the panel never waits.
  // Cache-first: a fresh cache entry means no network call at all. Groups use
  // a per-tournament key; the teams baseline list is shared with
  // MainTeams.tsx's/matchDataController.tsx's team cache, so opening this
  // panel after visiting the Teams page (or vice versa) is a cache hit.
  // NOTE: limit is 100 to match the backend's hard cap (Math.min(limit, 100)
  // in getAllTeams) — asking for more just wasted a param, the server was
  // silently truncating to 100 anyway. This initial load only seeds the
  // "no search yet" view of the grid; searching (below) re-queries the
  // server so results aren't limited to this initial page.
  const loadInitialData = useCallback(async (
    signal: AbortSignal,
    options: { forceGroups?: boolean; forceTeams?: boolean } = {}
  ) => {
    const { forceGroups = false, forceTeams = false } = options;
    try {
      // No `signal` on these two requests: GROUPS_CACHE_KEY/TEAMS_LIST_CACHE_KEY
      // are shared with other components' getOrFetch calls (Match.tsx,
      // MainTeams.tsx, matchDataController.tsx) via the same in-flight-promise
      // dedup, so aborting here on unmount would cancel the underlying request
      // for whichever other caller is also waiting on it. Staleness after
      // unmount is instead guarded below via `signal.aborted`.
      const [groupsData, teamsData] = await Promise.all([
        getOrFetch(
          GROUPS_CACHE_KEY,
          () => api.get(`/tournaments/${tournamentId}/groups`).then(r => (Array.isArray(r.data) ? r.data : [])),
          { maxAge: 90 * 1000, storage: 'session', forceRefresh: forceGroups }
        ),
        getOrFetch(
          TEAMS_LIST_CACHE_KEY,
          () => api.get("/teams", { params: { limit: 100 } }).then(r => r.data),
          { maxAge: 90 * 1000, storage: 'session', forceRefresh: forceTeams }
        ),
      ]);

      if (signal.aborted) return;

      // Defensive re-check: getOrFetch's cache-hit path returns whatever was
      // previously serialized under GROUPS_CACHE_KEY as-is, without re-running
      // the fetcher's own Array.isArray guard — a stale sessionStorage entry
      // written before that guard existed (or from a differently-shaped API
      // response) would otherwise reach setGroups() as a non-array and crash
      // filteredGroups' groups.filter() below.
      setGroups(Array.isArray(groupsData) ? groupsData : []);

      const teamList = (teamsData.teams || []).map((team: any) => ({
        _id: team._id,
        teamFullName: team.teamFullName,
        teamTag: team.teamTag,
        logo: team.logo,
      }));
      setTeams(teamList);
    } catch (err: any) {
      if (isCanceled(err)) return;
      console.error("Failed to load groups/teams:", err);
      if (err.response?.status === 401) alert("Unauthorized. Please login.");
    }
  }, [tournamentId, GROUPS_CACHE_KEY]);
  useEffect(() => {
    const controller = new AbortController();
    loadInitialData(controller.signal);
    return () => controller.abort();
  }, [loadInitialData]);

  // Server-side team search. Debounced so we don't fire a request per
  // keystroke. This is what actually fixes "search finds it via /api/teams
  // directly but not in the group panel" — the panel now hits the exact
  // same search endpoint instead of filtering whatever 100 teams happened
  // to load on mount.
  useEffect(() => {
    const controller = new AbortController();
    const q = searchTerm.trim();

    const handle = setTimeout(async () => {
      setTeamSearchLoading(true);
      try {
        const res = await api.get("/teams", {
          signal: controller.signal,
          params: { search: q || undefined, limit: 100 },
        });
        const list = (res.data.teams || []).map((t: any) => ({
          _id: t._id,
          teamFullName: t.teamFullName,
          teamTag: t.teamTag,
          logo: t.logo,
        }));
        setTeams(list);
        if (!q) setCache(TEAMS_LIST_CACHE_KEY, { teams: res.data.teams, total: res.data.total }, 'session');
      } catch (err: any) {
        if (!isCanceled(err)) console.error("Team search failed:", err);
      } finally {
        setTeamSearchLoading(false);
      }
    }, 250);

    return () => { clearTimeout(handle); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const clearForm = () => {
    setGroupName("");
    setSelectedTeams([]);
    setEditingGroupId(null);
    setSearchTerm("");
    setActiveStep(1);
    setShowBulkModal(false);
  };

  // Auto-increment: newly selected teams get the next free slot number.
  const toggleTeam = useCallback((team: Team) => {
    setSelectedTeamsCache(prev => {
      if (prev.has(team._id)) return prev;
      const next = new Map(prev);
      next.set(team._id, team);
      return next;
    });
    setSelectedTeams(prev => {
      const exists = prev.find(t => t.teamId === team._id);
      if (exists) return prev.filter(t => t.teamId !== team._id);
      const nextSlot = prev.length > 0 ? Math.max(...prev.map(t => t.slot || 0)) + 1 : 1;
      return [...prev, { teamId: team._id, slot: nextSlot }];
    });
  }, []);

  // Merges a batch of bulk-search matches the user marked into the draft
  // selection. A CSV slot number already taken by a DIFFERENT team bumps to
  // the next free slot instead of overwriting that team's assignment; a
  // slot-less row gets the next free slot in sequence. Re-marking a team
  // already selected updates its slot instead of duplicating the entry.
  const handleBulkApply = useCallback((marked: { team: Team; slot: number | null }[]) => {
    setSelectedTeamsCache(prevCache => {
      const next = new Map(prevCache);
      marked.forEach(m => next.set(m.team._id, m.team));
      return next;
    });
    setSelectedTeams(prev => {
      const byTeamId = new Map(prev.map(t => [t.teamId, t]));
      const usedSlots = new Set(prev.map(t => t.slot).filter((n): n is number => n != null));
      let nextAuto = prev.length ? Math.max(0, ...prev.map(t => t.slot || 0)) + 1 : 1;
      const takeNextFree = () => { while (usedSlots.has(nextAuto)) nextAuto++; return nextAuto; };
      for (const m of marked) {
        const existing = byTeamId.get(m.team._id);
        if (existing?.slot != null) usedSlots.delete(existing.slot); // free its old slot before recomputing
        let slot = m.slot;
        if (slot == null || usedSlots.has(slot)) slot = takeNextFree();
        usedSlots.add(slot);
        byTeamId.set(m.team._id, { teamId: m.team._id, slot });
      }
      return Array.from(byTeamId.values());
    });
  }, []);

  // toggleTeam by id only — used where we already know the team isn't in
  // hand (e.g. removing from the slot list / chip bar), so fall back to
  // resolveTeam to find the object.
  const toggleTeamById = useCallback((teamId: string) => {
    const team = resolveTeam(teamId);
    if (team) toggleTeam(team);
    else setSelectedTeams(prev => prev.filter(t => t.teamId !== teamId)); // safety net
  }, [resolveTeam, toggleTeam]);

  const handleSlotChange = useCallback((teamId: string, val: string) => {
    const slotNum = val === "" ? null : parseInt(val, 10);
    setSelectedTeams(prev => prev.map(t => t.teamId === teamId ? { ...t, slot: slotNum } : t));
  }, []);

  const openFormForEditGroup = useCallback((group: Group) => {
    setGroupName(group.groupName);
    const slots = (group.slots || []).filter((s): s is Slot & { team: Team } => !!s.team);
    setSelectedTeams(slots.map(s => ({ teamId: s.team._id, slot: s.slot })));
    setSelectedTeamsCache(prev => {
      const next = new Map(prev);
      slots.forEach(s => next.set(s.team._id, s.team));
      return next;
    });
    setEditingGroupId(group._id);
    setActiveStep(1);
    setShowForm(true);
    setMobileShowGroups(false);
  }, []);

  const handleSubmit = async () => {
    if (submittingRef.current) return; // hard stop against rapid double-clicks
    const name = groupName;
    if (!name.trim()) { setActiveStep(2); alert("Group name is required."); return; }
    if (selectedTeams.length === 0) { alert("Select at least one team."); return; }
    for (const t of selectedTeams) {
      if (t.slot === null || isNaN(t.slot as number)) { alert("Please assign a valid slot for all teams."); return; }
    }
    const invalid = selectedTeams.filter(st => !resolveTeam(st.teamId));
    if (invalid.length > 0) {
      alert("Some teams no longer exist. Refresh and try again.");
      const controller = new AbortController();
      loadInitialData(controller.signal, { forceGroups: true, forceTeams: true });
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const payload = { groupName: name, slots: selectedTeams.map(({ teamId, slot }) => ({ team: teamId, slot })) };
      if (editingGroupId) {
        await api.put(`/tournaments/${tournamentId}/groups/${editingGroupId}`, payload);
      } else {
        await api.post(`/tournaments/${tournamentId}/groups`, payload);
      }
      clearForm();
      setShowForm(false);
      const controller = new AbortController();
      loadInitialData(controller.signal, { forceGroups: true });
    } catch (err: any) {
      const msg = err.response?.data?.message || "Failed to submit group.";
      const missing = err.response?.data?.missingTeamIds;
      if (missing?.length > 0) {
        alert(`${msg}\nMissing: ${missing.join(', ')}`);
        const controller = new AbortController();
        loadInitialData(controller.signal, { forceGroups: true, forceTeams: true });
      } else {
        alert(msg);
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleDeleteGroup = useCallback(async (groupId: string) => {
    if (!window.confirm("Delete this group?")) return;
    try {
      await api.delete(`/tournaments/${tournamentId}/groups/${groupId}`);
      const controller = new AbortController();
      loadInitialData(controller.signal, { forceGroups: true });
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to delete group.");
    }
  }, [tournamentId, loadInitialData]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (onSelectionChange) onSelectionChange(groups.map(g => g._id));
  }, [groups, onSelectionChange]);

  // Search is now server-side (see the debounced effect above), so the
  // team grid just renders whatever `teams` currently holds.
  const filteredTeams = teams;

  const selectedMap = useMemo(() => {
    const m = new Map<string, number | null>();
    selectedTeams.forEach(t => m.set(t.teamId, t.slot));
    return m;
  }, [selectedTeams]);

  const alreadySelectedIds = useMemo(() => new Set(selectedTeams.map(t => t.teamId)), [selectedTeams]);

  if (!showForm) return null;

  return (
    <>
      <style>{STYLES}</style>
      <div className="gx-root gx-overlay">
        <div className="gx-scan" />

        {/* ── Top bar ── */}
        <div className="gx-topbar">
          <span className="gx-live-dot" />
          <span className="gx-topbar-title gx-disp">
            {editingGroupId ? 'Edit Group' : 'Group Manager'}
          </span>
          <button
            className={`gx-topbar-badge gx-mono${mobileShowGroups ? ' on' : ''}`}
            onClick={() => setMobileShowGroups(v => !v)}
          >
            <FaUsers size={9} /> {groups.length}
          </button>
          <button className="gx-close-btn" onClick={() => setShowForm(false)} aria-label="Close">
            <FaTimes size={13} />
          </button>
        </div>

        {/* ── Step tabs ── */}
        <div className="gx-steps">
          <button className={`gx-step-tab${activeStep === 1 ? ' active' : ''}`} onClick={() => setActiveStep(1)}>
            <span className={`gx-step-num${selectedTeams.length > 0 && activeStep !== 1 ? ' done' : ''}`}>
              {selectedTeams.length > 0 && activeStep !== 1 ? <FaCheck size={8} /> : '1'}
            </span>
            Select teams
          </button>
          <button className={`gx-step-tab${activeStep === 2 ? ' active' : ''}`} onClick={() => setActiveStep(2)}>
            <span className="gx-step-num">2</span>
            Assign slots
          </button>
          <button
            className={`gx-step-tab${activeStep === 3 ? ' active' : ''}`}
            style={{ display: 'none' }}
            onClick={() => { setActiveStep(3); setMobileShowGroups(true); }}
          >
            <span className="gx-step-num">3</span>
            Groups
          </button>
        </div>

        {/* ── Body ── */}
        <div className={`gx-body${mobileShowGroups ? ' show-groups' : ''}`}>

          <div className="gx-left-panel">

            {/* STEP 1 — Team selection */}
            {activeStep === 1 && (
              <div className="gx-panel">
                <div className="gx-panel-hdr">
                  <div className="gx-panel-label">Select teams</div>
                  <div className="gx-panel-hdr-row">
                    <div className="gx-search-wrap" style={{ flex: 1 }}>
                      <FaSearch className="gx-search-ic" />
                      <input
                        type="text" value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search by name or tag…"
                        className="gx-search"
                      />
                      {teamSearchLoading && <FaSpinner className="gx-search-spin gx-spin" size={11} />}
                    </div>
                    <button className="gx-btn-ghost gx-bulk-btn" onClick={() => setShowBulkModal(true)}>
                      <FaPaste size={12} /> Bulk add
                    </button>
                  </div>
                </div>

                <div className="gx-team-grid-wrap">
                  {filteredTeams.length === 0 ? (
                    <div className="gx-empty">
                      <div className="gx-empty-icon"><FaUsers /></div>
                      No teams found
                    </div>
                  ) : (
                    <div className="gx-team-grid">
                      {filteredTeams.map(team => (
                        <TeamCard
                          key={team._id}
                          team={team}
                          isSelected={selectedMap.has(team._id)}
                          slot={selectedMap.get(team._id)}
                          onToggle={toggleTeam}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="gx-sel-bar">
                  <span className="gx-sel-count gx-mono">
                    <span>{selectedTeams.length}</span> selected
                  </span>
                  <div className="gx-sel-chips">
                    {selectedTeams.map(sel => {
                      const team = resolveTeam(sel.teamId);
                      return (
                        <span key={sel.teamId} className="gx-sel-chip gx-mono" onClick={() => toggleTeamById(sel.teamId)}>
                          {team?.teamTag || '?'}
                          <span className="gx-sel-chip-x">✕</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 — Slots + group name */}
            {activeStep === 2 && (
              <div className="gx-panel">
                <div className="gx-panel-hdr">
                  <div className="gx-panel-label">Name &amp; assign slots</div>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Group name…"
                    className="gx-group-name-input"
                  />
                </div>

                <div className="gx-slots-wrap">
                  {selectedTeams.length === 0 ? (
                    <div className="gx-empty">
                      <div className="gx-empty-icon"><FaPlus /></div>
                      Go back and select teams first
                    </div>
                  ) : (
                    [...selectedTeams]
                      .sort((a, b) => (a.slot || 0) - (b.slot || 0))
                      .map(sel => (
                        <SlotRow
                          key={sel.teamId}
                          team={resolveTeam(sel.teamId)}
                          slot={sel.slot}
                          onSlotChange={handleSlotChange}
                          onRemove={toggleTeamById}
                        />
                      ))
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="gx-footer">
              {activeStep === 1 ? (
                <>
                  <button className="gx-btn-ghost" onClick={clearForm} disabled={isSubmitting}>Clear</button>
                  <button
                    className="gx-btn-primary"
                    onClick={() => setActiveStep(2)}
                    disabled={selectedTeams.length === 0}
                    style={{ opacity: selectedTeams.length === 0 ? 0.4 : 1 }}
                  >
                    Next: assign slots →
                  </button>
                </>
              ) : (
                <>
                  <button className="gx-btn-ghost" onClick={() => setActiveStep(1)} disabled={isSubmitting}>← Back</button>
                  <button className="gx-btn-ghost" onClick={clearForm} disabled={isSubmitting}>Clear</button>
                  <button className="gx-btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting && <FaSpinner size={11} className="gx-spin" />}
                    {isSubmitting ? 'Saving…' : editingGroupId ? 'Update group' : 'Create group'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="gx-right-panel">
            {/* Inlined here (not a separate GroupsColumn() component
                function) so React diffs this panel's children on each
                render instead of remounting the whole thing — a component
                redefined every render gets a new type identity, so React
                used to unmount+remount every GroupCard/logo/expanded row on
                every keystroke in either search box above. */}
            <div className="gx-panel-hdr">
              <div className="gx-panel-label">Existing groups</div>

              <div className="gx-search-wrap" style={{ marginBottom: 12 }}>
                <FaSearch className="gx-search-ic" />
                <input
                  type="text"
                  value={groupSearchTerm}
                  onChange={(e) => setGroupSearchTerm(e.target.value)}
                  placeholder="Search groups or teams..."
                  className="gx-search"
                />
              </div>

              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                <span style={{
                  color: "#93959C",
                  fontSize: 13,
                  fontWeight: 500
                }}>
                  {filteredGroups.length} group{filteredGroups.length !== 1 ? "s" : ""}
                </span>

                <span
                  className="gx-mono"
                  style={{
                    color: "#E11D2E",
                    fontSize: 13,
                    fontWeight: 800
                  }}
                >
                  {filteredGroups.length}
                </span>
              </div>
            </div>
            <div className="gx-groups-scroll">
              {filteredGroups.length === 0 ? (
                <div className="gx-empty">
                  <div className="gx-empty-icon"><FaLayerGroup /></div>
                  No groups yet
                </div>
              ) : filteredGroups.map(group => (
                <GroupCard
                  key={group._id}
                  group={group}
                  isExpanded={expandedGroups.has(group._id)}
                  onToggleExpand={toggleExpand}
                  onEdit={openFormForEditGroup}
                  onDelete={handleDeleteGroup}
                />
              ))}
            </div>
          </div>

        </div>
      </div>

      {showBulkModal && (
        <BulkAddModal
          onClose={() => setShowBulkModal(false)}
          onApply={handleBulkApply}
          alreadySelectedIds={alreadySelectedIds}
        />
      )}
    </>
  );
});

export default Group;