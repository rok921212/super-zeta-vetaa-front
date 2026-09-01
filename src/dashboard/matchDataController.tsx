import React, { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { decode } from '@msgpack/msgpack';
import api from '../login/api';
import { socket } from './socket';
import SocketManager from './socketManager';
import { requestQueue, UpdateBatcher } from './requestQueue';
import { mergeTeamsWithPlayers } from './matchTeamMerge';
import { getOrFetch, setCache, removeCache } from './cache';
import { uploadToCloudinary } from '../utils/cloudinaryUpload';
import Navbar from './Navbar';
import {
  FaUpload, FaEdit, FaTimes, FaPlus, FaCheck,
  FaSearch, FaExclamationTriangle, FaCheckCircle, FaInfoCircle, FaHistory,
} from 'react-icons/fa';

// Shared with MainTeams.tsx's team-by-id cache — same backend resource.
const teamByIdKey = (teamId: string) => `cache:v1:teams:byId:${teamId}`;

// ─────────────────────────────────────────────────────────────────────────────
// Same control-room visual language as the marketing site:
//   bg / void      #0B0C0E
//   panel          #131418
//   panel-raised   #17181D
//   line           #24262B
//   text           #F4F2EE
//   text-muted     #93959C
//   text-dim       #55565C
//   tally          #E11D2E   the one accent — used sparingly
//   tally-dim      #8C1220
//   Display: Space Grotesk / Body: Inter / Data: JetBrains Mono
//
// PERF NOTES (read before touching this file):
// - TeamCard and PlayerRow are React.memo'd. Handlers passed down are created
//   once with useCallback (empty/param-only deps) and read live state through
//   matchDataRef instead of closing over `matchData`, so their identity never
//   changes and memo actually holds. Functional setState updates only ever
//   replace the one team/player object that changed — every other object in
//   the tree keeps its old reference, which is what lets memo skip renders.
// - Live delta updates (many per second while a match is running) no longer
//   go through React state at all. They flash a player row by grabbing its
//   DOM node from a ref map and toggling a CSS class directly. That was the
//   single biggest source of full-tree re-renders in the old version.
// - Ref callbacks (team cards, player rows) are cached per id in a Map so we
//   never hand React a brand-new ref function on every render.
// - The initial fetch uses AbortController so a fast route change can't let
//   a stale response land after a newer one.
//
// FIX LOG (this pass):
// - Place points is now a fixed +/- stepper (like kills) instead of a free
//   text input. It commits on every click, so it no longer depends on a
//   blur event firing — that was the reason edits sometimes never reached
//   the API at all.
// - The "recently updated" guards on kills / points / death-toggle used a
//   200–500ms window that fully DISCARDED the click if it fell inside that
//   window (not queued, not merged — just dropped). That meant two quick
//   real clicks from a user could silently lose the second one. These are
//   now 50ms, which is enough to swallow true duplicate synthetic events
//   (e.g. touchend+click firing together on mobile) without eating
//   legitimate fast clicks.
// - pointsUpdateBatcher window trimmed from 4000ms to 2500ms to match the
//   responsiveness of kills/death so points doesn't feel laggy by comparison.
// ─────────────────────────────────────────────────────────────────────────────

const retryWithBackoff = async (fn: () => Promise<any>, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try { return await fn(); }
    catch (error: any) {
      if ((error.response?.status === 429 || error.response?.status === 500) && attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt) + Math.random() * 1000));
        continue;
      }
      throw error;
    }
  }
};

// Force-restart a CSS animation even if it's already mid-flight.
const pulse = (el: HTMLElement | null | undefined) => {
  if (!el) return;
  el.classList.remove('flash-live');
  void el.offsetWidth; // reflow
  el.classList.add('flash-live');
};

interface Player {
  _id: string; playerName: string; killNum: number;
  uId?: string | number;
  bHasDied: boolean; damage?: number; survivalTime?: number; assists?: number;
  location?: { x: number; y: number; z: number };
  health?: number; liveState?: number; isFiring?: boolean; isOutsideBlueCircle?: boolean;
  photo?: string;
  [key: string]: any;
}
interface Team {
  _id: string; teamId?: string; teamName: string; teamTag?: string;
  slot?: number; placePoints: number; players: Player[]; [key: string]: any;
}
interface MatchData { _id: string; teams: Team[]; [key: string]: any; }

type ToastKind = 'success' | 'error' | 'info';
interface ToastState { kind: ToastKind; msg: string; }

// ── Small shared bits (mirrors the marketing site's building blocks) ─────────
const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="inline-flex items-center gap-2">
    <span className="w-1.5 h-1.5 bg-[#E11D2E]" />
    <span className="font-mono text-[10px] tracking-[0.22em] text-[#93959C]">{children}</span>
  </div>
);

// Corner-bracket "broadcast frame" — reserved for the one card the operator
// just jumped to, so the signature accent stays meaningful instead of noise.
const Framed: React.FC<{ children: React.ReactNode; active: boolean }> = ({ children, active }) => (
  <div className="relative">
    {children}
    {active && (
      <>
        <span className="pointer-events-none absolute -top-[1px] -left-[1px] w-4 h-4 border-t-2 border-l-2 border-[#E11D2E]" />
        <span className="pointer-events-none absolute -top-[1px] -right-[1px] w-4 h-4 border-t-2 border-r-2 border-[#E11D2E]" />
        <span className="pointer-events-none absolute -bottom-[1px] -left-[1px] w-4 h-4 border-b-2 border-l-2 border-[#E11D2E]" />
        <span className="pointer-events-none absolute -bottom-[1px] -right-[1px] w-4 h-4 border-b-2 border-r-2 border-[#E11D2E]" />
      </>
    )}
  </div>
);

// ── PlayerRow ─────────────────────────────────────────────────────────────────
interface PlayerRowProps {
  teamId: string;
  player: Player;
  registerRef: (el: HTMLDivElement | null) => void;
  onKillChange: (teamId: string, playerId: string, change: number) => void;
  onToggleDeath: (teamId: string, playerId: string) => void;
}
const PlayerRow = memo(function PlayerRow({ teamId, player, registerRef, onKillChange, onToggleDeath }: PlayerRowProps) {
  const dead = !!player.bHasDied;
  return (
    <div
      ref={registerRef}
      className={`flex items-center gap-2.5 px-2.5 py-2 border transition-colors ${
        dead ? 'bg-[#E11D2E]/[0.04] border-[#E11D2E]/15' : 'bg-[#17181D] border-[#24262B]'
      }`}
    >
      <span
        className={`flex-1 min-w-0 truncate font-sans text-[13.5px] font-medium ${dead ? 'text-[#55565C] line-through' : 'text-[#D7D5D0]'}`}
        title={player.playerName}
      >
        {player.playerName}
      </span>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          aria-label={`Remove kill from ${player.playerName}`}
          className="w-6 h-6 flex items-center justify-center bg-[#0B0C0E] border border-[#24262B] text-[#93959C] hover:border-[#E11D2E]/50 hover:text-[#E11D2E] leading-none"
          onClick={() => onKillChange(teamId, player._id, -1)}
        >
          −
        </button>
        <span className="font-mono text-[13px] font-bold text-[#F4F2EE] min-w-[20px] text-center tabular-nums">
          {player.killNum ?? 0}
        </span>
        <button
          type="button"
          aria-label={`Add kill to ${player.playerName}`}
          className="w-6 h-6 flex items-center justify-center bg-[#0B0C0E] border border-[#24262B] text-[#93959C] hover:border-[#E11D2E]/50 hover:text-[#E11D2E] leading-none"
          onClick={() => onKillChange(teamId, player._id, 1)}
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={() => onToggleDeath(teamId, player._id)}
        title={dead ? 'Mark alive' : 'Mark eliminated'}
        aria-pressed={dead}
        className={`relative w-11 h-[22px] shrink-0 border transition-colors ${
          dead ? 'bg-[#E11D2E]/20 border-[#E11D2E]/50' : 'bg-[#0B0C0E] border-[#24262B]'
        }`}
      >
        <span
          className={`absolute top-[2px] w-[16px] h-[16px] transition-[left] ${dead ? 'left-[24px] bg-[#E11D2E]' : 'left-[2px] bg-[#55565C]'}`}
        />
        <span className={`absolute font-mono text-[7px] font-bold top-1/2 -translate-y-1/2 tracking-wide ${dead ? 'left-[5px] text-white' : 'right-[5px] text-[#55565C]'}`}>
          {dead ? 'OUT' : 'IN'}
        </span>
      </button>
    </div>
  );
});

// ── TeamCard ──────────────────────────────────────────────────────────────────
interface TeamCardProps {
  team: Team;
  isHighlighted: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
  registerPlayerRef: (playerId: string) => (el: HTMLDivElement | null) => void;
  onToggleAllDeath: (teamId: string) => void;
  onOpenRoster: (teamId: string, teamName: string) => void;
  onPointsChange: (teamId: string, value: number) => void;
  onPointsCommit: (teamId: string, value: number) => void;
  onKillChange: (teamId: string, playerId: string, change: number) => void;
  onToggleDeath: (teamId: string, playerId: string) => void;
}
const TeamCard = memo(function TeamCard({
  team, isHighlighted, registerRef, registerPlayerRef,
  onToggleAllDeath, onOpenRoster, onPointsChange, onPointsCommit, onKillChange, onToggleDeath,
}: TeamCardProps) {
  const allDead = team.players.length > 0 && team.players.every(p => p.bHasDied);
  const totalKills = team.players.reduce((s, p) => s + (p.killNum ?? 0), 0);
  const totalPts = (team.placePoints ?? 0) + totalKills;

  // Fixed-step change: always goes through both the local-state setter and
  // the debounced commit together, on every click — so there's no path
  // where a change only lands in local state and never reaches the API.
  const stepPoints = (delta: number) => {
    const next = Math.max(0, (team.placePoints ?? 0) + delta);
    if (next === (team.placePoints ?? 0)) return;
    onPointsChange(team._id, next);
    onPointsCommit(team._id, next);
  };

  return (
    <div ref={registerRef}>
      <Framed active={isHighlighted}>
        <div
          className={`bg-[#131418] border overflow-hidden ${
            isHighlighted ? 'border-[#E11D2E]' : allDead ? 'border-[#E11D2E]/25' : 'border-[#24262B] hover:border-[#3a3d44]'
          }`}
        >
          <div className={`h-[3px] ${allDead ? 'bg-[#8C1220]' : 'bg-[#E11D2E]'}`} />

          {/* Header */}
          <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2.5 border-b border-[#24262B]">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="font-mono text-[11px] font-bold px-2 py-1 border border-[#E11D2E]/35 text-[#E11D2E] bg-[#E11D2E]/[0.06] shrink-0">
                S{team.slot ?? '-'}
              </span>
              <div className="min-w-0">
                <div className="font-display font-bold text-[13.5px] text-[#F4F2EE] uppercase tracking-tight truncate" title={team.teamName}>
                  {team.teamName}
                </div>
                {team.teamTag && <div className="font-mono text-[10px] text-[#55565C] mt-0.5">[{team.teamTag}]</div>}
              </div>
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onToggleAllDeath(team._id)}
                className="flex items-center gap-1.5"
                aria-pressed={allDead}
                title={allDead ? 'Revive whole team' : 'Eliminate whole team'}
              >
                <span className={`font-mono text-[8px] tracking-wider ${allDead ? 'text-[#E11D2E]' : 'text-[#55565C]'}`}>ELIM</span>
                <span className={`relative w-8 h-[18px] border ${allDead ? 'bg-[#E11D2E]/25 border-[#E11D2E]/60' : 'bg-[#0B0C0E] border-[#24262B]'}`}>
                  <span className={`absolute top-[2px] w-[12px] h-[12px] transition-[left] ${allDead ? 'left-[18px] bg-[#E11D2E]' : 'left-[2px] bg-[#55565C]'}`} />
                </span>
              </button>
              <button
                type="button"
                onClick={() => onOpenRoster(team.teamId || team._id, team.teamName)}
                className="flex items-center gap-1.5 font-mono text-[9px] font-semibold tracking-wide px-2 py-1 border border-[#24262B] text-[#93959C] hover:border-[#E11D2E]/50 hover:text-[#E11D2E]"
              >
                <FaEdit size={9} /> ROSTER
              </button>
            </div>
          </div>

          {/* Points */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#0F1013] border-b border-[#24262B]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] tracking-wider text-[#55565C] uppercase">Place pts</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Decrease place points"
                  className="w-6 h-6 flex items-center justify-center bg-[#0B0C0E] border border-[#24262B] text-[#93959C] hover:border-[#E11D2E]/50 hover:text-[#E11D2E] leading-none disabled:opacity-30 disabled:cursor-not-allowed"
                  disabled={(team.placePoints ?? 0) <= 0}
                  onClick={() => stepPoints(-1)}
                >
                  −
                </button>
                <span className="font-mono text-[14px] font-bold text-[#F4F2EE] min-w-[24px] text-center tabular-nums">
                  {team.placePoints ?? 0}
                </span>
                <button
                  type="button"
                  aria-label="Increase place points"
                  className="w-6 h-6 flex items-center justify-center bg-[#0B0C0E] border border-[#24262B] text-[#93959C] hover:border-[#E11D2E]/50 hover:text-[#E11D2E] leading-none"
                  onClick={() => stepPoints(1)}
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="font-mono text-[8px] tracking-wider text-[#55565C] uppercase">Kills</span>
                <span className="font-mono text-[15px] font-bold text-[#F4F2EE] tabular-nums">{totalKills}</span>
              </div>
              <div className="w-px h-6 bg-[#24262B]" />
              <div className="flex flex-col items-end">
                <span className="font-mono text-[8px] tracking-wider text-[#55565C] uppercase">Total</span>
                <span className="font-mono text-[17px] font-extrabold text-[#E11D2E] tabular-nums">{totalPts}</span>
              </div>
            </div>
          </div>

          {/* Players */}
          <div className="flex flex-col gap-1.5 p-2.5">
            {team.players.map(player => (
              <PlayerRow
                key={player._id}
                teamId={team._id}
                player={player}
                registerRef={registerPlayerRef(player._id)}
                onKillChange={onKillChange}
                onToggleDeath={onToggleDeath}
              />
            ))}
          </div>
        </div>
      </Framed>
    </div>
  );
});

// ── Component ──────────────────────────────────────────────────────────────────
const MatchDataViewer: React.FC = () => {
  const { t } = useTranslation();
  const { tournamentId, roundId, matchId } = useParams<{ tournamentId: string; roundId: string; matchId: string }>();
  const navigate = useNavigate();
  const { state } = useLocation() as { state?: { roundNumber?: number; matchNo?: number } };
  const { roundNumber, matchNo } = state || {};

  const breadcrumb = useMemo(() => {
    const segments: { label: string; onClick?: () => void }[] = [];
    if (roundNumber != null) {
      segments.push({ label: `Round ${roundNumber}`, onClick: () => navigate(`/tournaments/${tournamentId}/rounds`) });
    }
    if (matchNo != null) {
      segments.push({ label: `Match ${matchNo}`, onClick: () => navigate(`/tournaments/${tournamentId}/rounds/${roundId}/matches`) });
    }
    return segments;
  }, [roundNumber, matchNo, tournamentId, roundId, navigate]);

  const [matchData, setMatchData]             = useState<MatchData | null>(null);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [highlightedTeam, setHighlightedTeam] = useState<string | null>(null);
  const [sortBy, setSortBy]                   = useState<'slot' | 'placePoints'>('slot');

  const [editingTeam, setEditingTeam]           = useState<null | { teamId: string; teamName: string }>(null);
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);
  const [selectedPlayers, setSelectedPlayers]   = useState<string[]>([]);
  const [playersLoading, setPlayersLoading]     = useState(false);
  const [savingRoster, setSavingRoster]         = useState(false);
  const [copyingRoster, setCopyingRoster]       = useState(false);
  const [rosterSearch, setRosterSearch]         = useState('');
  const [rosterWarning, setRosterWarning]       = useState<string | null>(null);

  const [newPlayerName, setNewPlayerName]   = useState('');
  const [newPlayerId, setNewPlayerId]       = useState('');
  const [newPlayerPhoto, setNewPlayerPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer]     = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);
  const showToast = useCallback((kind: ToastKind, msg: string) => setToast({ kind, msg }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  // Object URL for the new-player photo preview — created/revoked only when
  // the file actually changes, not on every render (the old code called
  // URL.createObjectURL directly in JSX, leaking a blob URL per re-render).
  useEffect(() => {
    if (!newPlayerPhoto) { setPhotoPreviewUrl(null); return; }
    const url = URL.createObjectURL(newPlayerPhoto);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [newPlayerPhoto]);

  const matchDataRef = useRef<MatchData | null>(null);
  useEffect(() => { matchDataRef.current = matchData; }, [matchData]);

  const teamRefs        = useRef<Record<string, HTMLDivElement | null>>({});
  const playerRowRefs   = useRef<Record<string, HTMLDivElement | null>>({});
  const teamRefCbCache   = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  const playerRefCbCache = useRef(new Map<string, (el: HTMLDivElement | null) => void>());

  const getTeamRefCb = useCallback((id: string) => {
    let cb = teamRefCbCache.current.get(id);
    if (!cb) { cb = (el) => { teamRefs.current[id] = el; }; teamRefCbCache.current.set(id, cb); }
    return cb;
  }, []);
  const getPlayerRefCb = useCallback((id: string) => {
    let cb = playerRefCbCache.current.get(id);
    if (!cb) { cb = (el) => { playerRowRefs.current[id] = el; }; playerRefCbCache.current.set(id, cb); }
    return cb;
  }, []);

  const lastUpdateRef       = useRef<Record<string, number>>({});
  const killUpdateBatcher   = useRef(new UpdateBatcher<{ change: number }>(3000, (e, n) => ({ change: e.change + n.change })));
  const pointsUpdateBatcher = useRef(new UpdateBatcher<{ points: number }>(2500));
  const deathUpdateBatcher  = useRef(new UpdateBatcher<{ bHasDied: boolean }>(2500));

  // How long to treat a repeat call on the same key as a duplicate event
  // (e.g. a browser firing both touchend and click for one tap) rather than
  // a second, genuine user action. Kept short on purpose — anything larger
  // starts silently swallowing real rapid clicks (see FIX LOG at top).
  const DUPLICATE_EVENT_WINDOW_MS = 50;

  const normalizeMatch = (data: any): MatchData => ({
    ...data,
    teams: Array.isArray(data?.teams)
      ? data.teams.map((t: Team) => ({ ...t, _id: t?._id || t?.teamId || null, placePoints: t.placePoints ?? 0 }))
      : [],
  });

  const fetchMatchData = useCallback(async () => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    try {
      const { data } = await api.get(
        `/tournament/${tournamentId}/round/${roundId}/match/${matchId}/matchdata`,
        { signal: controller.signal }
      );
      setMatchData(normalizeMatch(data));
    } catch (err: any) {
      if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
        setError(err.message || 'Failed to fetch match data');
      }
    } finally { setLoading(false); }
    return () => controller.abort();
  }, [tournamentId, roundId, matchId]);

  useEffect(() => {
    let cancelFn: (() => void) | undefined;
    let cancelled = false;
    fetchMatchData().then(fn => {
      if (cancelled) { fn?.(); return; }
      cancelFn = fn;
    });
    return () => { cancelled = true; cancelFn?.(); };
  }, [tournamentId, roundId, matchId, fetchMatchData]);

  // ── Socket wiring ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Bandwidth: the backend now negotiates msgpack for this room per
    // socket (socketManager.tsx sends ?msgpackLiveUpdate=1) — decode
    // defensively (only if it's actually binary) so this stays correct
    // whether the server has picked this socket up as msgpack-capable yet
    // or not, and regardless of client/server deploy order.
    const handleLiveMatchUpdate = (raw: any) => {
      let data: any = raw;
      if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) {
        try {
          data = decode(new Uint8Array(raw));
        } catch (err) {
          console.error('[bw][matchDataController] failed to decode msgpack liveMatchUpdate payload:', err, raw);
          return;
        }
      }
      if (!data) return;
      const inId = typeof data.matchId === 'object' && data.matchId?._id ? data.matchId._id : data.matchId;
      if (inId?.toString?.() !== matchId?.toString?.()) return;
      // Bandwidth: liveMatchUpdate on the user:<id> room is a TEAM-LEVEL
      // (+ player-level) delta now, not the whole match — data.teams is only
      // the teams that changed since the backend's last tick, and a changed
      // team's own `players` is only the changed players. Merge by id onto
      // the current state instead of replacing wholesale, so a team/player
      // absent from this tick keeps its last-known values. The HTTP fetch on
      // mount and the server's user-room hydration on (re)connect both send
      // a full set, which merges the same way (every team present).
      setMatchData((prev) => {
        const incomingTeams: any[] = Array.isArray(data.teams) ? data.teams : [];
        if (!prev || !Array.isArray(prev.teams) || prev.teams.length === 0) {
          return normalizeMatch(data);
        }
        return normalizeMatch({ ...prev, ...data, teams: mergeTeamsWithPlayers(prev.teams, incomingTeams) });
      });
    };

    const handleTeamUpdate = (data: any) => {
      setMatchData((prev) => {
        if (!prev?.teams) return prev;
        return {
          ...prev,
          teams: prev.teams.map((team) => {
            if (team._id !== data.teamId) return team;
            const changes = data?.changes || {};
            const next: any = { ...team, ...changes };
            if (Array.isArray(changes.players)) {
              const byId = new Map(changes.players.map((p: any) => [p._id?.toString?.() || p._id, p]));
              next.players = (team.players || []).map((p: any) => {
                const k = p._id?.toString?.() || p._id;
                const u = byId.get(k);
                return u ? { ...p, ...u } : p;
              });
            }
            return next;
          }),
        };
      });
    };

    const handlePlayerUpdate = (data: any) => {
      setMatchData((prev) => {
        if (!prev?.teams) return prev;
        return {
          ...prev,
          teams: prev.teams.map((team) =>
            team._id !== data.teamId ? team : {
              ...team,
              players: team.players.map((p) => p._id === data.playerId ? { ...p, ...data.updates } : p),
            }
          ),
        };
      });
    };

    // Live delta stream from the PUBG socket engine. This can fire many
    // times a second per player, so it deliberately never touches React
    // state for the "flash" effect — only for the actual stat change.
    const handlePlayerDeltaUpdate = (data: any) => {
      if (!data) return;
      if (data.matchId?.toString() !== matchId?.toString()) return;

      let updatedPlayerId: string | null = null;

      setMatchData((prev) => {
        if (!prev?.teams) return prev;
        const updatedTeams = prev.teams.map((team) => {
          const updatedPlayers = team.players.map((player) => {
            if (String(player.uId) !== String(data.uId)) return player;
            updatedPlayerId = player._id?.toString() || null;
            return {
              ...player,
              ...data.changes,
              ...(data.changes.location && { location: { ...player.location, ...data.changes.location } }),
              ...(data.changes.liveState !== undefined && { bHasDied: data.changes.liveState === 5 }),
            };
          });
          return { ...team, players: updatedPlayers };
        });
        return { ...prev, teams: updatedTeams };
      });

      if (updatedPlayerId) pulse(playerRowRefs.current[updatedPlayerId]);
    };

    socket.on('liveMatchUpdate',    handleLiveMatchUpdate);
    socket.on('matchDataUpdated',   handleTeamUpdate);
    socket.on('playerStatsUpdated', handlePlayerUpdate);
    socket.on('playerDeltaUpdate',  handlePlayerDeltaUpdate);

    return () => {
      socket.off('liveMatchUpdate',    handleLiveMatchUpdate);
      socket.off('matchDataUpdated',   handleTeamUpdate);
      socket.off('playerStatsUpdated', handlePlayerUpdate);
      socket.off('playerDeltaUpdate',  handlePlayerDeltaUpdate);
      SocketManager.getInstance().disconnect();
    };
  }, [matchId]);

  // ── Handlers — stable identity, read live data via matchDataRef ─────────────
  const updateKillCount = useCallback((teamId: string, playerId: string, change: number) => {
    const key = `${teamId}-${playerId}`;
    const now = Date.now();
    if (lastUpdateRef.current[key] && now - lastUpdateRef.current[key] < DUPLICATE_EVENT_WINDOW_MS) return;
    lastUpdateRef.current[key] = now;

    const current = matchDataRef.current;
    const team = current?.teams.find(t => t._id === teamId);
    const player = team?.players.find(p => p._id === playerId);
    if (!current || !team || !player) return;

    const newKillNum = Math.max(0, (player.killNum ?? 0) + change);
    const actualChange = newKillNum - (player.killNum ?? 0);
    if (actualChange === 0) return;

    setMatchData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        teams: prev.teams.map(t => t._id !== teamId ? t : {
          ...t,
          players: t.players.map(p => p._id !== playerId ? p : { ...p, killNum: newKillNum }),
        }),
      };
    });

    killUpdateBatcher.current.batch(key, { change: actualChange }, async (u) => {
      await retryWithBackoff(() => api.patch(
        `/tournament/${tournamentId}/round/${roundId}/match/${matchId}/matchdata/${current._id}/team/${teamId}/player/${playerId}/stats`,
        { killNumChange: u.change }
      ));
    });
  }, [tournamentId, roundId, matchId]);

  const savePlacePointsLocal = useCallback((teamId: string, value: number) => {
    setMatchData(prev => {
      if (!prev) return prev;
      return { ...prev, teams: prev.teams.map(t => t._id !== teamId ? t : { ...t, placePoints: value }) };
    });
  }, []);

  const commitPlacePoints = useCallback((teamId: string, value: number) => {
    const key = `${teamId}-points`;
    const now = Date.now();
    if (lastUpdateRef.current[key] && now - lastUpdateRef.current[key] < DUPLICATE_EVENT_WINDOW_MS) return;
    lastUpdateRef.current[key] = now;
    const current = matchDataRef.current;
    if (!current) return;
    pointsUpdateBatcher.current.batch(key, { points: value }, async (u) => {
      await retryWithBackoff(() => api.patch(
        `/tournament/${tournamentId}/round/${roundId}/match/${matchId}/matchdata/${current._id}/team/${teamId}/points`,
        { placePoints: u.points }
      ));
    });
  }, [tournamentId, roundId, matchId]);

  const togglePlayerDeath = useCallback((teamId: string, playerId: string) => {
    const key = `${teamId}-${playerId}-death`;
    const now = Date.now();
    if (lastUpdateRef.current[key] && now - lastUpdateRef.current[key] < DUPLICATE_EVENT_WINDOW_MS) return;
    lastUpdateRef.current[key] = now;

    const current = matchDataRef.current;
    const team = current?.teams.find(t => t._id === teamId);
    const player = team?.players.find(p => p._id === playerId);
    if (!current || !team || !player) return;
    const newVal = !player.bHasDied;

    setMatchData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        teams: prev.teams.map(t => t._id !== teamId ? t : {
          ...t,
          players: t.players.map(p => p._id !== playerId ? p : { ...p, bHasDied: newVal }),
        }),
      };
    });

    deathUpdateBatcher.current.batch(key, { bHasDied: newVal }, async (u) => {
      await retryWithBackoff(() => api.patch(
        `/tournament/${tournamentId}/round/${roundId}/match/${matchId}/matchdata/${current._id}/team/${teamId}/player/${playerId}/stats`,
        { bHasDied: u.bHasDied }
      ));
    });
  }, [tournamentId, roundId, matchId]);

  const toggleAllPlayersDeath = useCallback((teamId: string) => {
    const key = `team-${teamId}-all-death`;
    const now = Date.now();
    if (lastUpdateRef.current[key] && now - lastUpdateRef.current[key] < DUPLICATE_EVENT_WINDOW_MS) return;
    lastUpdateRef.current[key] = now;

    const current = matchDataRef.current;
    const team = current?.teams.find(t => t._id === teamId);
    if (!current || !team) return;
    const newVal = !team.players.every(p => p.bHasDied);

    setMatchData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        teams: prev.teams.map(t => t._id !== teamId ? t : { ...t, players: t.players.map(p => ({ ...p, bHasDied: newVal })) }),
      };
    });

    requestQueue.add(async () => {
      await api.patch(
        `/tournament/${tournamentId}/round/${roundId}/match/${matchId}/matchdata/${current._id}/team/${teamId}/bulk`,
        { bHasDied: newVal }
      );
    }).catch((err: any) => {
      console.error(err);
      showToast('error', t('matchData.failedToUpdateTeam', 'Could not update that team — try again.'));
    });
  }, [tournamentId, roundId, matchId, showToast, t]);

  // ── Roster modal handlers ────────────────────────────────────────────────
  const openChangePlayers = useCallback(async (teamId: string, teamName: string) => {
    setEditingTeam({ teamId, teamName });
    setRosterSearch(''); setRosterWarning(null);
    setPlayersLoading(true);
    try {
      const teamData = await getOrFetch(
        teamByIdKey(teamId),
        () => api.get(`/teams/${teamId}`).then(r => r.data),
        { maxAge: 2 * 60 * 1000, storage: 'session' }
      );
      const playersForTeam = (teamData.players || []).filter((p: any) => p && p.playerName && p._id);
      const teamOnBoard = matchDataRef.current?.teams.find(t => (t.teamId || t._id) === teamId);
      const preselected = (teamOnBoard?.players || []).filter((p: any) => p && p.playerName && p._id);

      const norm = (n: string) => n.trim().toLowerCase();
      const preMap = new Map<string, any>();
      preselected.forEach((p: Player) => preMap.set(norm(p.playerName), p));
      const filtered = playersForTeam.filter((p: Player) => {
        const pre = preMap.get(norm(p.playerName));
        return !(pre && pre._id !== p._id);
      });
      const combined = new Map<string, any>();
      [...preselected, ...filtered].forEach((p: any) => combined.set(p._id.toString(), p));
      setAvailablePlayers(Array.from(combined.values()));
      setSelectedPlayers(preselected.map((p: Player) => p._id.toString()).filter((id: string) => combined.has(id)));
    } catch (err: any) {
      setError(err.message || 'Failed to fetch team players');
      showToast('error', t('matchData.failedToFetchPlayers', "Couldn't load this team's roster."));
    } finally { setPlayersLoading(false); }
  }, [showToast, t]);

  const closeRosterModal = useCallback(() => {
    setEditingTeam(null); setNewPlayerName(''); setNewPlayerId(''); setNewPlayerPhoto(null); setRosterWarning(null);
  }, []);

  const filteredAvailablePlayers = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    if (!q) return availablePlayers;
    return availablePlayers.filter(p => p.playerName?.toLowerCase().includes(q));
  }, [availablePlayers, rosterSearch]);

  const togglePlayerSelection = useCallback((id: string) => {
    setSelectedPlayers(prev => {
      if (prev.includes(id)) { setRosterWarning(null); return prev.filter(x => x !== id); }
      if (prev.length >= 4) { setRosterWarning(t('matchData.pleaseUntickPlayer', 'A team can only have 4 players — remove one first.')); return prev; }
      setRosterWarning(null);
      return [...prev, id];
    });
  }, [t]);

  // A real PUBG UID is digits-only, 5-20 chars — same rule the backend
  // enforces (validatePlayerIds in teams.controller.js). Checking it here
  // first avoids a guaranteed round-trip 400 when the field is left blank
  // or has a malformed value.
  const PLAYER_ID_FORMAT = /^\d{5,20}$/;

  const addNewPlayer = async () => {
    if (!editingTeam || !newPlayerName.trim()) { showToast('error', t('matchData.pleaseEnterPlayerName', 'Enter a player name first.')); return; }
    const playerId = newPlayerId.trim();
    if (!PLAYER_ID_FORMAT.test(playerId)) {
      showToast('error', t('matchData.invalidPlayerId', 'Enter a valid PUBG UID (digits only, 5-20 characters).'));
      return;
    }
    setAddingPlayer(true);
    try {
      let photoUrl = '';
      if (newPlayerPhoto) photoUrl = await uploadToCloudinary(newPlayerPhoto, 'players/photos', 'player_photo');
      // Atomic single-player add ($push server-side) instead of a
      // read-modify-write PUT of the whole team — no race with players
      // added elsewhere between the read and the write.
      const { data: updatedTeam } = await api.post(`/teams/${editingTeam.teamId}/players`, {
        playerName: newPlayerName.trim(),
        playerId,
        photo: photoUrl || undefined,
      });
      setCache(teamByIdKey(editingTeam.teamId), updatedTeam, 'session');
      removeCache('cache:v1:teams:list', 'session');
      const newPlayer = updatedTeam.players.find((p: any) => p.playerName === newPlayerName.trim() && p.playerId === playerId);
      if (!newPlayer) throw new Error('Failed to find newly added player');
      setAvailablePlayers(prev => [...prev, newPlayer]);
      setNewPlayerName(''); setNewPlayerId(''); setNewPlayerPhoto(null);
      showToast('success', t('matchData.playerAddedSuccessfully', 'Player added to the roster pool.'));
    } catch (err: any) {
      showToast('error', err?.response?.data?.error || t('matchData.failedToAddPlayer', 'Could not add that player — try again.'));
    } finally { setAddingPlayer(false); }
  };

  const saveChangedPlayers = async () => {
    if (!editingTeam || selectedPlayers.length < 1 || selectedPlayers.length > 4) {
      setRosterWarning(t('matchData.pleaseSelectPlayers', 'Select between 1 and 4 players to save.'));
      return;
    }
    setSavingRoster(true);
    try {
      const current = matchDataRef.current;
      const teamOnBoard = current?.teams.find(t => (t.teamId || t._id) === editingTeam.teamId);
      const oldPlayers = (teamOnBoard?.players || []).map((p: any) => p._id.toString());
      const newPlayers = selectedPlayers.map(id => id.toString());
      const removed    = oldPlayers.filter((id: string) => !newPlayers.includes(id));
      const added      = newPlayers.filter(id => !oldPlayers.includes(id));
      const replacements = removed
        .map((oldId: string, i: number) => ({ oldPlayerId: oldId, newPlayerId: added[i] }))
        .filter((r: any) => r.newPlayerId !== undefined);

      if (replacements.length > 0)
        await api.put(`/matchdata/${current!._id}/team/${editingTeam.teamId}/replace`, { replacements });
      if (added.length > removed.length)
        await api.post(`/matchdata/${current!._id}/team/${editingTeam.teamId}/player/add`, { newPlayerIds: added.slice(removed.length) });
      if (removed.length > added.length)
        await api.delete(`/matchdata/${current!._id}/team/${editingTeam.teamId}/players/remove`, { data: { playerIds: removed.slice(added.length) } });

      setMatchData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          teams: prev.teams.map(t => {
            if ((t.teamId || t._id) !== editingTeam.teamId) return t;
            const currentPlayers = t.players;
            return {
              ...t,
              players: selectedPlayers
                .map(id => {
                  const ex = currentPlayers.find((p: any) => p._id.toString() === id);
                  if (ex) return ex;
                  const fa = availablePlayers.find(p => p._id.toString() === id);
                  return fa ? { ...fa, killNum: 0, damage: 0, survivalTime: 0, assists: 0, bHasDied: false } : null;
                })
                .filter(Boolean) as Player[],
            };
          }),
        };
      });

      showToast('success', t('matchData.rosterSaved', 'Roster updated.'));
      closeRosterModal();
    } catch (err: any) {
      setError(err.message || 'Failed to update players');
      showToast('error', t('matchData.failedToUpdatePlayers', 'Could not save the roster — try again.'));
    } finally { setSavingRoster(false); }
  };

  // ── Copy roster from previous match ─────────────────────────────────────
  const handleCopyPreviousRoster = async () => {
    if (!matchData?._id || copyingRoster) return;
    const ok = window.confirm(
      t('matchData.confirmCopyPreviousRoster',
        "Copy the previous match's roster into this match? This replaces every team's current roster here and resets all stats — this can't be undone.")
    );
    if (!ok) return;

    setCopyingRoster(true);
    try {
      const { data } = await api.post(`/matchdata/${matchData._id}/copy-previous-roster`, {});

      setMatchData(prev => {
        if (!prev) return prev;
        const updatedById = new Map((data.updatedTeams || []).map((u: any) => [String(u.teamId), u]));
        return {
          ...prev,
          teams: prev.teams.map(team => {
            const u = updatedById.get(String(team.teamId || team._id));
            return u ? { ...team, players: u.players } : team;
          }),
        };
      });

      const updatedCount = data.updatedTeams?.length || 0;
      const skipped: any[] = data.skippedTeams || [];

      if (updatedCount === 0) {
        showToast('info', t('matchData.noRosterCopied', 'No matching teams found in the previous match — nothing was copied.'));
      } else if (skipped.length > 0) {
        const names = skipped.map((s: any) => s.teamName).filter(Boolean).join(', ');
        showToast('info', t('matchData.rosterCopiedPartial',
          `Copied ${updatedCount} team roster(s) from match ${data.previousMatchNo}. Skipped (no match in previous game): ${names}`));
      } else {
        showToast('success', t('matchData.rosterCopiedSuccess',
          `Copied roster${updatedCount === 1 ? '' : 's'} for ${updatedCount} team(s) from match ${data.previousMatchNo}.`));
      }
    } catch (err: any) {
      const reason = err?.response?.data?.reason;
      if (reason === 'no_previous_match') {
        showToast('info', t('matchData.noPreviousMatch', 'This is the first match in the round — no previous match to copy from.'));
      } else if (reason === 'no_previous_matchdata') {
        showToast('info', t('matchData.previousMatchEmpty', "The previous match doesn't have a roster yet."));
      } else {
        showToast('error', t('matchData.failedToCopyRoster', 'Could not copy the previous roster — try again.'));
      }
    } finally { setCopyingRoster(false); }
  };

  // ── Derived data ─────────────────────────────────────────────────────────
  const sortedTeams = useMemo(() => {
    const arr = [...(matchData?.teams ?? [])];
    arr.sort((a, b) => sortBy === 'slot' ? (a.slot ?? 0) - (b.slot ?? 0) : (b.placePoints ?? 0) - (a.placePoints ?? 0));
    return arr;
  }, [matchData?.teams, sortBy]);

  const totalTeams   = useMemo(() => (matchData?.teams || []).filter(t => t.players.some(p => !p.bHasDied)).length, [matchData?.teams]);
  const totalPlayers = useMemo(() => (matchData?.teams || []).reduce((s, t) => s + t.players.filter(p => !p.bHasDied).length, 0), [matchData?.teams]);

  const jumpToTeam = useCallback((teamId: string) => {
    setHighlightedTeam(teamId);
    requestAnimationFrame(() => { teamRefs.current[teamId]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    setTimeout(() => setHighlightedTeam(prev => prev === teamId ? null : prev), 1800);
  }, []);

  // ── Loading / Error / Empty ──────────────────────────────────────────────
  if (loading) {
    return (
      <Shell tournamentId={tournamentId} roundId={roundId} breadcrumb={breadcrumb}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="mb-8 h-6 w-40 bg-[#131418] animate-pulse" />
          <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[280px] bg-[#131418] border border-[#24262B] animate-pulse" />
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell tournamentId={tournamentId} roundId={roundId} breadcrumb={breadcrumb}>
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="max-w-md text-center bg-[#131418] border border-[#E11D2E]/30 p-8">
            <FaExclamationTriangle className="mx-auto mb-4 text-[#E11D2E]" size={22} />
            <p className="font-display font-bold text-lg uppercase mb-2">Couldn't load match data</p>
            <p className="text-[#93959C] text-sm mb-6">{error}</p>
            <button
              onClick={() => fetchMatchData()}
              className="px-6 py-3 bg-[#E11D2E] hover:bg-[#8C1220] text-white font-display font-bold text-sm tracking-wide"
            >
              Retry
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (!matchData) {
    return (
      <Shell tournamentId={tournamentId} roundId={roundId} breadcrumb={breadcrumb}>
        <div className="min-h-screen flex items-center justify-center">
          <p className="font-mono text-xs tracking-[0.2em] text-[#55565C]">NO MATCH DATA</p>
        </div>
      </Shell>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Shell tournamentId={tournamentId} roundId={roundId} breadcrumb={breadcrumb}>
      {/* Sticky top bar */}
      <div className="sticky top-16 z-40 bg-[#0B0C0E] border-b border-[#24262B] backdrop-blur-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-3 py-3">
            <div className="flex items-center gap-2 bg-[#131418] border border-[#24262B] px-4 py-2">
              <span className="font-mono text-[9px] tracking-[0.15em] text-[#55565C] uppercase">Teams alive</span>
              <span className="font-mono text-2xl font-extrabold text-[#F4F2EE] tabular-nums">{totalTeams}</span>
            </div>
            <div className="flex items-center gap-2 bg-[#131418] border border-[#24262B] px-4 py-2">
              <span className="font-mono text-[9px] tracking-[0.15em] text-[#55565C] uppercase">Players alive</span>
              <span className="font-mono text-2xl font-extrabold text-[#E11D2E] tabular-nums">{totalPlayers}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 justify-center pb-3">
            {matchData.teams.map(team => {
              const dead = team.players.length > 0 && team.players.every(p => p.bHasDied);
              const active = highlightedTeam === team._id;
              return (
                <button
                  key={team._id}
                  onClick={() => jumpToTeam(team._id)}
                  className={`font-mono text-[10px] font-semibold px-2.5 py-1 border ${
                    active ? 'border-[#E11D2E] bg-[#E11D2E]/15 text-[#E11D2E]'
                      : dead ? 'border-[#E11D2E]/25 bg-[#E11D2E]/[0.04] text-[#8C1220]'
                      : 'border-[#24262B] bg-[#131418] text-[#93959C] hover:border-[#E11D2E]/40 hover:text-[#E11D2E]'
                  }`}
                >
                  {team.slot}·{team.teamTag}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Toolbar: copy-previous-roster + Sort */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center gap-2 pt-4 pb-2">
        <button
          type="button"
          onClick={handleCopyPreviousRoster}
          disabled={copyingRoster}
          className="flex items-center gap-1.5 font-mono text-[9px] font-semibold tracking-wide px-2.5 py-1.5 border border-[#24262B] text-[#93959C] hover:border-[#E11D2E]/50 hover:text-[#E11D2E] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {copyingRoster ? (
            <>
              <span className="w-3 h-3 border-2 border-[#55565C]/40 border-t-[#93959C] rounded-full animate-spin" />
              COPYING…
            </>
          ) : (
            <>
              <FaHistory size={9} /> COPY PREVIOUS ROSTER
            </>
          )}
        </button>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] tracking-[0.18em] text-[#55565C] uppercase">Sort</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'slot' | 'placePoints')}
            className="bg-[#131418] border border-[#24262B] text-[#E11D2E] font-mono text-[10px] font-bold px-3 py-1.5 outline-none focus-visible:border-[#E11D2E]"
          >
            <option value="slot">SLOT</option>
            <option value="placePoints">POINTS</option>
          </select>
        </div>
      </div>

      {/* Teams grid */}
      <div
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 grid gap-3.5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
      >
        {sortedTeams.map(team => (
          <TeamCard
            key={team._id}
            team={team}
            isHighlighted={highlightedTeam === team._id}
            registerRef={getTeamRefCb(team._id)}
            registerPlayerRef={getPlayerRefCb}
            onToggleAllDeath={toggleAllPlayersDeath}
            onOpenRoster={openChangePlayers}
            onPointsChange={savePlacePointsLocal}
            onPointsCommit={commitPlacePoints}
            onKillChange={updateKillCount}
            onToggleDeath={togglePlayerDeath}
          />
        ))}
      </div>

      {/* Roster modal */}
      {editingTeam && (
        <div className="fixed inset-0 z-[200] bg-[#0B0C0E]/92 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[92vh] bg-[#131418] border border-[#24262B] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-[#0F1013] border-b border-[#24262B] shrink-0">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-[#E11D2E] border border-[#E11D2E]/35 bg-[#E11D2E]/[0.06] px-2 py-1">ROSTER</span>
                <div>
                  <div className="font-display font-bold text-base text-[#F4F2EE] uppercase">Edit roster</div>
                  <div className="font-mono text-[11px] text-[#93959C]">{editingTeam.teamName}</div>
                </div>
              </div>
              <button onClick={closeRosterModal} aria-label="Close" className="w-8 h-8 flex items-center justify-center border border-[#24262B] text-[#55565C] hover:border-[#E11D2E]/50 hover:text-[#E11D2E]">
                <FaTimes size={13} />
              </button>
            </div>

            {playersLoading ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <div className="w-10 h-10 border-2 border-[#24262B] border-t-[#E11D2E] rounded-full animate-spin" />
                <p className="font-mono text-[11px] tracking-[0.15em] text-[#55565C]">LOADING PLAYERS</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto grid md:grid-cols-2 divide-x divide-[#24262B]">
                {/* Left — select players */}
                <div className="p-6">
                  <Eyebrow>SELECT PLAYERS</Eyebrow>
                  <div className="flex items-center justify-between mt-3 mb-3">
                    <span className="font-mono text-[10px] tracking-wider text-[#55565C]">
                      SELECTED <span className={selectedPlayers.length > 4 ? 'text-[#E11D2E]' : 'text-[#F4F2EE]'}>{selectedPlayers.length}</span> / 4
                    </span>
                  </div>

                  <div className="relative mb-3">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#55565C]" size={11} />
                    <input
                      type="text"
                      value={rosterSearch}
                      onChange={e => setRosterSearch(e.target.value)}
                      placeholder="Search players"
                      className="w-full pl-8 pr-3 py-2 bg-[#0B0C0E] border border-[#24262B] text-sm text-[#F4F2EE] placeholder:text-[#55565C] outline-none focus-visible:border-[#E11D2E]"
                    />
                  </div>

                  {rosterWarning && (
                    <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-[#E11D2E]/10 border border-[#E11D2E]/30">
                      <FaExclamationTriangle className="text-[#E11D2E] shrink-0" size={11} />
                      <span className="text-[12px] text-[#F4F2EE]">{rosterWarning}</span>
                    </div>
                  )}

                  {filteredAvailablePlayers.length === 0 && (
                    <p className="text-[13px] text-[#55565C] py-6 text-center">No players match "{rosterSearch}".</p>
                  )}

                  <div className="flex flex-col gap-1.5">
                    {filteredAvailablePlayers.map(player => {
                      const id = player._id.toString();
                      const isSel = selectedPlayers.includes(id);
                      return (
                        <button
                          type="button"
                          key={id}
                          onClick={() => togglePlayerSelection(id)}
                          className={`flex items-center gap-3 px-3 py-2.5 border text-left ${
                            isSel ? 'bg-[#E11D2E]/10 border-[#E11D2E]' : 'bg-[#0B0C0E] border-[#24262B] hover:border-[#3a3d44]'
                          }`}
                        >
                          <span className={`w-[18px] h-[18px] flex items-center justify-center border shrink-0 ${isSel ? 'bg-[#E11D2E] border-[#E11D2E]' : 'bg-[#131418] border-[#24262B]'}`}>
                            {isSel && <FaCheck size={9} color="#0B0C0E" />}
                          </span>
                          <span className={`text-[14px] font-medium truncate ${isSel ? 'text-[#F4F2EE]' : 'text-[#93959C]'}`}>{player.playerName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right — add new player */}
                <div className="p-6">
                  <Eyebrow>ADD NEW PLAYER</Eyebrow>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="block font-mono text-[10px] tracking-wider text-[#55565C] uppercase mb-1.5">Player name *</label>
                      <input
                        type="text" placeholder="Enter player name"
                        value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)}
                        className="w-full px-3 py-2.5 bg-[#0B0C0E] border border-[#24262B] text-[#F4F2EE] text-sm placeholder:text-[#55565C] outline-none focus-visible:border-[#E11D2E]"
                      />
                    </div>

                    <div>
                      <label className="block font-mono text-[10px] tracking-wider text-[#55565C] uppercase mb-1.5">Player ID (PUBG UID) *</label>
                      <input
                        type="text" placeholder="Digits only, e.g. 5123456789"
                        value={newPlayerId} onChange={e => setNewPlayerId(e.target.value)}
                        className="w-full px-3 py-2.5 bg-[#0B0C0E] border border-[#24262B] text-[#F4F2EE] text-sm placeholder:text-[#55565C] outline-none focus-visible:border-[#E11D2E]"
                      />
                    </div>

                    <div>
                      <label className="block font-mono text-[10px] tracking-wider text-[#55565C] uppercase mb-1.5">Player photo</label>
                      <label htmlFor="new-player-photo" className="flex items-center gap-2 px-3 py-2.5 border border-[#24262B] text-[#93959C] text-sm cursor-pointer hover:border-[#E11D2E]/50 hover:text-[#E11D2E]">
                        <FaUpload size={12} /> Upload photo
                      </label>
                      <input
                        id="new-player-photo" type="file" accept="image/*"
                        className="hidden"
                        onChange={e => setNewPlayerPhoto(e.target.files?.[0] || null)}
                      />
                      {photoPreviewUrl && (
                        <img src={photoPreviewUrl} alt="Preview" width={72} height={72} className="w-[72px] h-[72px] object-cover border border-[#24262B] mt-3" />
                      )}
                    </div>

                    <button
                      onClick={addNewPlayer}
                      disabled={addingPlayer || !newPlayerName.trim() || !newPlayerId.trim()}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-[#E11D2E] hover:bg-[#8C1220] disabled:opacity-40 disabled:cursor-not-allowed text-white font-display font-bold text-[12px] tracking-wide"
                    >
                      {addingPlayer
                        ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Adding…</>
                        : <><FaPlus size={11} /> Add player</>
                      }
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-[#0F1013] border-t border-[#24262B] shrink-0">
              <button onClick={closeRosterModal} className="px-5 py-2.5 border border-[#24262B] text-[#93959C] text-sm font-medium hover:text-[#F4F2EE] hover:border-[#3a3d44]">
                Cancel
              </button>
              <button
                onClick={saveChangedPlayers}
                disabled={savingRoster || selectedPlayers.length < 1 || selectedPlayers.length > 4}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#E11D2E] hover:bg-[#8C1220] disabled:opacity-40 disabled:cursor-not-allowed text-white font-display font-bold text-[12px] tracking-wide"
              >
                {savingRoster
                  ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                  : <><FaCheck size={11} /> Save roster</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[300] flex items-center gap-2.5 px-4 py-3 bg-[#131418] border max-w-sm shadow-lg"
          style={{ borderColor: toast.kind === 'error' ? '#E11D2E' : toast.kind === 'success' ? '#3a3d44' : '#24262B' }}
        >
          {toast.kind === 'error' && <FaExclamationTriangle className="text-[#E11D2E] shrink-0" size={14} />}
          {toast.kind === 'success' && <FaCheckCircle className="text-[#F4F2EE] shrink-0" size={14} />}
          {toast.kind === 'info' && <FaInfoCircle className="text-[#93959C] shrink-0" size={14} />}
          <span className="text-[13px] text-[#F4F2EE]">{toast.msg}</span>
        </div>
      )}
    </Shell>
  );
};

// Module-scoped (not defined inside MatchDataViewer) so its identity stays
// stable across renders — it sits at the root of every branch this file
// returns, so a fresh function reference here would remount the whole page
// (and drop input focus) on every keystroke.
const Shell: React.FC<{
  children: React.ReactNode;
  tournamentId?: string;
  roundId?: string;
  breadcrumb?: { label: string; onClick?: () => void }[];
}> = ({ children, tournamentId, roundId, breadcrumb }) => {
  return (
    <div className="min-h-screen bg-[#0B0C0E] text-[#F4F2EE] font-sans antialiased">
      <GlobalStyle />
      <Navbar
        active="none"
        brandText="MATCH DATA"
        breadcrumb={breadcrumb}
        tournamentId={tournamentId}
        roundId={roundId}
      />
      {children}
    </div>
  );
};

// Fonts + the one keyframe used for live-update pulses. Kept as a single
// static <style> tag (same approach as the marketing page) so it's injected
// once and never recomputed per render.
const GlobalStyle: React.FC = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');
    .font-display { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif; }
    .font-sans { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
    .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

    @keyframes md-flash-pulse {
      0%   { box-shadow: 0 0 0 1px rgba(225,29,46,0.9), 0 0 14px rgba(225,29,46,0.45); border-color: #E11D2E; background-color: rgba(225,29,46,0.08); }
      100% { box-shadow: none; }
    }
    .flash-live { animation: md-flash-pulse 0.9s ease-out; }

    a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible {
      outline: 2px solid #E11D2E; outline-offset: 2px;
    }
  `}</style>
);

export default MatchDataViewer;