import SmashPointBar from '../../shared/components/SmashPointBar';
import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  memo,
  createContext,
  useContext,
} from 'react';
import {
  useSortedTeams,
  isPlayerDead,
  isRondoMap,
  Player,
  MatchData,
  SortedTeam,
} from '../../shared/hooks/unsortteams';
import { useRecallEvents, useRecallsUsed, RecallEvent } from '../../shared/hooks/recallEvents';
import TeamRecallOverlay from '../../shared/components/TeamRecallOverlay';
import { brand, EASE_STEP, DUR_REORDER } from '../shell';
import { TeamLogo } from '../../shared/components/TeamLogo';

// NOTE: SocketManager import removed — PublicThemeRenderer owns the single
// socket connection and passes fresh matchData / overallData down as props.
// NOTE: Player / Team / MatchData are imported from useSortedTeams.
//
// THEME8 "WHITE LABEL" Live Stats (pairs with the white-label Lower third).
// Unchanged: useSortedTeams 'liveUntilDead', useRecallEvents +
// TeamRecallOverlay, EliminatedOverlay / PlayerHealthBar / AnimatedTeamRow
// lifecycles and timers, right-side 480px panel at top 222 / 260.
//
// Changed:
//   · Fit math now uses whole-pixel row heights instead of scaleY, and the
//     legend sits directly under the last row — it can no longer drift or
//     fall off-screen. Text stays sharp because nothing is scaled.
//   · Bigger type everywhere (team tag ≈ 62% of row height).
//   · Rondo: a RECALL column of four lightning-shaped bars beside the
//     health bars, one per player, same order. Filled blue = recall still
//     available, empty grey = used. Same "seen it come back" detection as
//     the LiveData theme.
//   · Shell: ink header with a cut corner, angled rank chips (#1 primary,
//     #2–3 ink), primary edge rail, secondary sliver + solid primary kills
//     column, ink legend bar that closes the panel with a matching cut.

// ─────────────────────────────────────────────
// Palette + type
// ─────────────────────────────────────────────
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const ROW_ALT_W = '#F4F4F6';
const PANEL = '#E9E9ED';
const LINE = '#DEDEE4';
const DIM = '#8A8A93';
const ALIVE = '#13B24A';
const LOW = '#F59E0B';
const KNOCK = '#E5323B';
const ZONE = '#2563EB';
const RECALL = '#0EA5E9';
const CUT = 14; // header / legend corner cut

// Agency FB everywhere. 'AGENCYB' is the family name used elsewhere in this
// project; the others are fallbacks if it isn't loaded.
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

// Column widths (row = 480): rail 5 + rank 52 + logo 46 + tag flex + alive 78 [+ recall 62 on Rondo] + pts 56 + sliver 7 + kills 60
const COL = { rail: 5, rank: 52, logo: 46, alive: 78, recall: 62, pts: 56, sliver: 7, kills: 60 };
const PANEL_W = 480;
const HEADER_H = 38;
const LEGEND_H = 36;

function toRgb(hex: string): [number, number, number] {
  let h = (hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* black or white — whichever reads better on the given colour */
function inkOn(hex: string): string {
  const L = toRgb(hex)
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
  return L > 0.45 ? INK : WHITE;
}

const KEYFRAMES = `
@keyframes ls8HeadIn { from { clip-path: inset(0 0 0 100%); } to { clip-path: inset(0 0 0 0); } }
@keyframes ls8RowIn  { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: translateX(0); } }
@keyframes ls8Tick   { from { transform: translateY(-35%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes ls8Spent  { 0% { transform: scale(1.35); filter: brightness(1.8); } 100% { transform: scale(1); filter: none; } }
.ls8-head  { animation: ls8HeadIn 0.45s cubic-bezier(.2,.8,.2,1) both; }
.ls8-row   { animation: ls8RowIn 0.4s cubic-bezier(.2,.8,.2,1) both; }
.ls8-tick  { display: inline-block; animation: ls8Tick 0.28s cubic-bezier(.2,.8,.2,1) both; }
.ls8-spent { animation: ls8Spent 0.6s cubic-bezier(.2,.8,.2,1) both; }
@media (prefers-reduced-motion: reduce) {
  .ls8-head, .ls8-row, .ls8-tick, .ls8-spent { animation: none; }
}
`;

// ─────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────
interface Tournament {
  _id: string;
  tournamentName: string;
  torLogo?: string;
  day?: string;
  primaryColor?: string;
  secondaryColor?: string;
  overlayBg?: string;
}

interface Round {
  _id: string;
  roundName: string;
  apiEnable?: boolean;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
  map?: string;
}

interface LiveStatsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  overallData?: any;
}

// ─────────────────────────────────────────────
// Recall left (Rondo) — each player can be recalled RECALLS_PER_PLAYER
// times a match. The feed has no "recalls left" field, so a player counts
// as used once we have SEEN them come back (dead → alive) this match.
// Counts come from useRecallsUsed (the server's recallsUsed per player), so they survive a reload.
// ─────────────────────────────────────────────
const RECALLS_PER_PLAYER = 1;
const recallKey = (p: any): string => String(p?.uId ?? p?._id ?? p?.playerName ?? '');

interface RecallLeftInfo {
  on: boolean;
  used: Record<string, number>;
}
const RecallLeftContext = createContext<RecallLeftInfo>({ on: false, used: {} });

/** Recall bolt — one per player, same height as the health bars.
 *  available → solid blue bolt   ·   used → empty grey outline
 *  (pops once when it flips to "used"). */
const BOLT_PATH = 'M7 0 H16 L11.5 12 H16 L4 32 L6.5 17 H0.5 Z'; // chunky bolt, 16×32 box

const RecallBolt = ({ available, width, height }: { available: boolean; width: number; height: number }) => (
  <div
    key={available ? 'a' : 'u'}
    className={available ? undefined : 'ls8-spent'}
    style={{ width, height, flex: 'none' }}
  >
    <svg width={width} height={height} viewBox="0 0 16 32" preserveAspectRatio="none" style={{ display: 'block' }} aria-hidden>
      <path
        d={BOLT_PATH}
        fill={available ? RECALL : LINE}
        stroke={available ? '#0369A1' : DIM}
        strokeWidth={1.2}
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  </div>
);

// ─────────────────────────────────────────────
// EliminatedOverlay — unchanged lifecycle (rAF + 2500ms / 3300ms timers).
// ─────────────────────────────────────────────
interface EliminatedOverlayProps {
  overlayStyle: React.CSSProperties;
  rowHeight: number;
  onDone: () => void;
}

const EliminatedOverlay = memo(({ overlayStyle, rowHeight, onDone }: EliminatedOverlayProps) => {
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => setExpanded(true));
    const outTimer = setTimeout(() => setPhase('out'), 2500);
    const doneTimer = setTimeout(() => onDone(), 3300);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(outTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  const isExpanded = phase === 'in' && expanded;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        height: `${rowHeight}px`,
        zIndex: 20,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          ...overlayStyle,
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: isExpanded ? '100%' : '0%',
          transition:
            phase === 'in'
              ? 'width 1.5s cubic-bezier(0.22, 1, 0.36, 1)'
              : 'width 0.6s cubic-bezier(0.55, 0, 1, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            fontFamily: FONT,
            fontSize: Math.round(rowHeight * 0.55),
            fontWeight: 700,
            color: WHITE,
            letterSpacing: '0.3em',
            opacity: isExpanded ? 1 : 0,
            transition: phase === 'in' ? 'opacity 0.4s ease 0.8s' : 'opacity 0.3s ease',
            whiteSpace: 'nowrap',
          }}
        >
          ELIMINATED
        </span>
      </div>
    </div>
  );
});
EliminatedOverlay.displayName = 'EliminatedOverlay';

// ─────────────────────────────────────────────
// PlayerHealthBar — unchanged fill logic + memo comparator.
// Flat bar on a light track: green alive, amber under 30%, red knocked.
// ─────────────────────────────────────────────
interface HealthBarProps {
  player: Player;
  apiEnabled: boolean;
  baseHealthBar: number;
  width: number;
}

const PlayerHealthBar = memo(
  ({ player, apiEnabled, baseHealthBar, width }: HealthBarProps) => {
    const isDead = isPlayerDead(player);
    const isKnocked = player.liveState === 4;

    let ratio = 0;
    let barColor = 'transparent';

    if (!isDead) {
      ratio = apiEnabled ? Math.max(0, Math.min(1, player.health / (player.healthMax || 100))) : 1;
      barColor = isKnocked ? KNOCK : ratio < 0.3 ? LOW : ALIVE;
    }

    return (
      <div style={{ position: 'relative', width, height: `${baseHealthBar}px`, background: LINE }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '100%',
            height: `${ratio * baseHealthBar}px`,
            background: barColor,
            transition: 'height 300ms ease, background-color 300ms ease',
          }}
        />
      </div>
    );
  },
  (prev, next) =>
    prev.player.health === next.player.health &&
    prev.player.healthMax === next.player.healthMax &&
    prev.player.liveState === next.player.liveState &&
    prev.player.bHasDied === next.player.bHasDied &&
    prev.apiEnabled === next.apiEnabled &&
    prev.baseHealthBar === next.baseHealthBar &&
    prev.width === next.width
);
PlayerHealthBar.displayName = 'PlayerHealthBar';

// ─────────────────────────────────────────────
// Firing marker — a flat red bullet in the rank chip
// ─────────────────────────────────────────────
const FiringIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg viewBox="0 0 40 16" width={size} height={size * 0.4} aria-hidden style={{ display: 'block' }}>
    <rect x="0" y="5" width="6" height="2" fill={color} opacity="0.5" />
    <rect x="0" y="9" width="9" height="2" fill={color} opacity="0.5" />
    <path d="M12 3 H30 C35 3 39 6 40 8 C39 10 35 13 30 13 H12 Z" fill={color} />
    <rect x="12" y="3" width="3" height="10" fill={INK} opacity="0.25" />
  </svg>
);

// ─────────────────────────────────────────────
// AnimatedTeamRow — unchanged elimination-edge refs/effect, unchanged
// TeamRecallOverlay, EASE_STEP reorder.
// ─────────────────────────────────────────────
interface AnimatedTeamRowProps {
  team: any;
  index: number;
  overlayStyle: React.CSSProperties;
  accent: string;
  secondary: string;
  apiEnabled: boolean;
  baseRowHeight: number;
  baseHealthBar: number;
  transitionReady: boolean;
  recallEvents: RecallEvent[];
}

const AnimatedTeamRow = ({
  team,
  index,
  overlayStyle,
  accent,
  secondary,
  apiEnabled,
  baseRowHeight,
  baseHealthBar,
  transitionReady,
  recallEvents,
}: AnimatedTeamRowProps) => {
  const wasEliminatedRef = useRef(team.isAllDead);
  const overlayKeyRef = useRef(0);
  const [overlayKey, setOverlayKey] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);
  // stagger fixed at mount so reorders don't replay the entrance
  const entranceDelay = useRef(Math.min(index, 20) * 35).current;
  const recall = useContext(RecallLeftContext);

  const handleOverlayDone = useCallback(() => setShowOverlay(false), []);

  useEffect(() => {
    if (team.isAllDead && !wasEliminatedRef.current) {
      overlayKeyRef.current += 1;
      setOverlayKey(overlayKeyRef.current);
      setShowOverlay(true);
    }
    if (!team.isAllDead && wasEliminatedRef.current) {
      setShowOverlay(false);
    }
    wasEliminatedRef.current = team.isAllDead;
  }, [team.isAllDead]);

  const firing = team.players.some((p: Player) => p.isFiring);
  const dead = !!team.isAllDead;
  const rank = index + 1;

  // type scale — everything keys off the row height
  const tagFont = Math.round(baseRowHeight * 0.62);
  const numFont = Math.round(baseRowHeight * 0.66);
  const rankFont = Math.round(baseRowHeight * 0.52);

  // rank chip: #1 primary, #2–3 ink, rest grey
  const chipBg = dead ? PANEL : rank === 1 ? accent : rank <= 3 ? INK : PANEL;
  const chipFg = dead ? DIM : rank === 1 ? inkOn(accent) : rank <= 3 ? WHITE : INK;

  // health bars + recall bolts share one size so the two columns line up
  const nPlayers = Math.max(1, team.players.length);
  const barW = Math.max(6, Math.min(12, Math.floor((COL.alive - 12 - (nPlayers - 1) * 5) / nPlayers)));
  const barH = baseHealthBar;
  const boltW = Math.max(10, Math.min(14, Math.floor((COL.recall - 6 - (nPlayers - 1) * 1) / nPlayers)));

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: `${index * baseRowHeight}px`,
        height: `${baseRowHeight}px`,
        transition: transitionReady ? `top ${DUR_REORDER}ms ${EASE_STEP}` : 'none',
        zIndex: 1,
      }}
    >
      <div
        className="ls8-row"
        style={{
          animationDelay: `${entranceDelay}ms`,
          width: '100%',
          height: `${baseRowHeight}px`,
          position: 'relative',
          display: 'flex',
          alignItems: 'stretch',
          background: dead ? '#E6E6EA' : index % 2 ? ROW_ALT_W : WHITE,
          boxShadow: `inset 0 -1px 0 ${LINE}`,
          fontFamily: FONT,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {/* outside-blue-circle: flat blue tint + blue rail (no glow, no loop) */}
        {team.hasOutsideBlueCircle && !dead && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(37, 99, 235, 0.10)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        )}

        {/* edge rail — primary, blue when outside zone */}
        <div
          style={{
            width: COL.rail,
            flex: 'none',
            background: team.hasOutsideBlueCircle && !dead ? ZONE : dead ? '#C9C9CF' : accent,
            zIndex: 3,
          }}
        />

        {/* rank chip — angled right edge */}
        <div
          style={{
            width: COL.rank,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingRight: 6,
            boxSizing: 'border-box',
            background: chipBg,
            color: chipFg,
            clipPath: 'polygon(0 0, 100% 0, calc(100% - 9px) 100%, 0 100%)',
            fontSize: rankFont,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {firing ? (
            <FiringIcon size={34} color={rank === 1 || rank <= 3 ? chipFg : KNOCK} />
          ) : (
            String(rank).padStart(2, '0')
          )}
        </div>

        {/* team logo */}
        <div
          style={{
            width: COL.logo,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: Math.round(baseRowHeight * 0.14),
            boxSizing: 'border-box',
            filter: dead ? 'grayscale(1)' : 'none',
            opacity: dead ? 0.5 : 1,
          }}
        >
          <TeamLogo
            logo={team.teamLogo}
            flag={team.teamFlag}
            fallback={'/def_logo.png'}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).src = '/def_logo.png';
            }}
          />
        </div>

        {/* team tag */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 6,
            fontSize: tagFont,
            letterSpacing: '0.02em',
            color: dead ? DIM : INK,
            textDecoration: dead ? 'line-through' : 'none',
            textDecorationThickness: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {team.teamTag.toUpperCase()}
        </div>

        {/* health bars (+ recall markers on Rondo) */}
        <div
          style={{
            width: COL.alive,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
          }}
        >
          {team.players.length === 0 ? (
            <span style={{ fontSize: 16, color: DIM, letterSpacing: '0.15em' }}>MISS</span>
          ) : (
            team.players.map((player: Player) => (
              <PlayerHealthBar key={player._id} player={player} apiEnabled={apiEnabled} baseHealthBar={barH} width={barW} />
            ))
          )}
        </div>

        {/* recall column (Rondo) — one bolt per player, same order as the health bars */}
        {recall.on && (
          <div
            style={{
              width: COL.recall,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              boxShadow: `inset 1px 0 0 ${LINE}`,
              opacity: dead ? 0.5 : 1,
            }}
          >
            {team.players.map((player: Player) => (
              <RecallBolt
                key={player._id}
                available={(recall.used[recallKey(player)] || 0) < RECALLS_PER_PLAYER}
                width={boltW}
                height={barH}
              />
            ))}
          </div>
        )}

        {/* points */}
        <div
          style={{
            width: COL.pts,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: numFont,
            fontVariantNumeric: 'tabular-nums',
            color: dead ? DIM : INK,
            overflow: 'hidden',
          }}
        >
          <span key={team.totalPoints} className="ls8-tick">
            {team.totalPoints}
          </span>
        </div>

        {/* secondary sliver */}
        <div style={{ width: COL.sliver - 3, marginLeft: 3, flex: 'none', background: secondary, opacity: dead ? 0.4 : 1 }} />

        {/* kills — solid primary column */}
        <div
          style={{
            width: COL.kills,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: accent,
            color: inkOn(accent),
            opacity: dead ? 0.5 : 1,
            fontSize: numFont,
            fontVariantNumeric: 'tabular-nums',
            overflow: 'hidden',
          }}
        >
          <span key={team.totalKills} className="ls8-tick">
            {team.totalKills}
          </span>
        </div>

        {showOverlay && (
          <EliminatedOverlay
            key={overlayKey}
            overlayStyle={overlayStyle}
            rowHeight={baseRowHeight}
            onDone={handleOverlayDone}
          />
        )}

        <TeamRecallOverlay
          recallEvents={recallEvents}
          teamId={String(team._id ?? team.teamId ?? '')}
          rowHeight={baseRowHeight}
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// AnimatedTeamList — unchanged (transitionReady rAF, composite remount key).
// ─────────────────────────────────────────────
interface AnimatedTeamListProps {
  teams: any[];
  overlayStyle: React.CSSProperties;
  accent: string;
  secondary: string;
  apiEnabled: boolean;
  baseRowHeight: number;
  baseHealthBar: number;
  matchId: string | null;
  recallEvents: RecallEvent[];
}

const AnimatedTeamList = ({
  teams,
  overlayStyle,
  accent,
  secondary,
  apiEnabled,
  baseRowHeight,
  baseHealthBar,
  matchId,
  recallEvents,
}: AnimatedTeamListProps) => {
  const [transitionReady, setTransitionReady] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setTransitionReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{ position: 'relative', height: `${teams.length * baseRowHeight}px`, width: '100%' }}>
      {teams.map((team, index) => (
        <AnimatedTeamRow
          key={`${matchId ?? 'nomatch'}:${team._id}`}
          team={team}
          index={index}
          overlayStyle={overlayStyle}
          accent={accent}
          secondary={secondary}
          apiEnabled={apiEnabled}
          baseRowHeight={baseRowHeight}
          baseHealthBar={baseHealthBar}
          transitionReady={transitionReady}
          recallEvents={recallEvents}
        />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// Legend item
// ─────────────────────────────────────────────
const Key = ({ swatch, label }: { swatch: React.ReactNode; label: string }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
    {swatch}
    {label}
  </span>
);
const Bar = ({ color }: { color: string }) => (
  <span style={{ display: 'inline-block', width: 7, height: 16, background: color }} />
);

// ─────────────────────────────────────────────
// LiveStats (main) — sort mode 'liveUntilDead' preserved.
// ─────────────────────────────────────────────
const LiveStats: React.FC<LiveStatsProps> = ({ tournament, round, match, matchData, overallData }) => {
  const sortedTeams: SortedTeam[] = useSortedTeams(matchData, overallData, 'liveUntilDead');
  // Shared per-player recall detection — isRondoMap-gated internally.
  const recallEvents = useRecallEvents(matchData, match);

  // ── Layout: whole-pixel rows sized so header + rows + legend always fit ──
  const { baseRowHeight, baseHealthBar } = useMemo(() => {
    const listTop = 260;
    const bottomMargin = 12;
    const available = Math.max(0, 1080 - listTop - LEGEND_H - bottomMargin);
    const rowsCount = Math.max(1, sortedTeams.length);
    const baseRowHeight = Math.max(28, Math.min(56, Math.floor(available / rowsCount)));
    const baseHealthBar = Math.round(baseRowHeight * 0.68);
    return { baseRowHeight, baseHealthBar };
  }, [sortedTeams.length]);

  const { primary } = brand(tournament.primaryColor, tournament.secondaryColor);
  const secondary = tournament.secondaryColor || primary;

  // ink sweep + primary edge — passed to EliminatedOverlay
  const overlayStyle = useMemo<React.CSSProperties>(
    () => ({ background: INK, borderLeft: `6px solid ${primary}`, boxSizing: 'border-box' }),
    [primary]
  );

  const apiEnabled = round?.apiEnable === true;

  // Recall-left (Rondo only): the server's count per player, so an
  // overlay opened or refreshed mid-match still knows who was already recalled.
  const isRondo = isRondoMap(match?.map);
  const recallInfo = useRecallsUsed(matchData, match, recallEvents);

  if (!matchData) {
    return (
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="1600" y="350" fontFamily="Arial" fontSize="24" fill="white">
          No match data
        </text>
      </svg>
    );
  }

  const headLabel: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: '0.14em',
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1,
    textAlign: 'center',
  };

  return (
    <RecallLeftContext.Provider value={recallInfo}>
      <div style={{ width: 1920, height: 1080, position: 'relative' }}>
        <style>{KEYFRAMES}</style>

        {/* ── header — ink, cut top-left, primary underline ── */}
        <div
          className="ls8-head"
          style={{
            position: 'absolute',
            right: 0,
            top: 260 - HEADER_H,
            width: PANEL_W,
            height: HEADER_H,
            background: INK,
            clipPath: `polygon(${CUT}px 0, 100% 0, 100% 100%, 0 100%, 0 ${CUT}px)`,
            display: 'flex',
            alignItems: 'center',
            paddingBottom: 3,
            boxSizing: 'border-box',
          }}
        >
          <span style={{ ...headLabel, width: COL.rail + COL.rank, color: WHITE, fontSize: 22, paddingRight: 4 }}>#</span>
          <span style={{ ...headLabel, flex: 1, textAlign: 'left', paddingLeft: 8 }}>TEAM</span>
          <span style={{ ...headLabel, width: COL.alive }}>ALIVE</span>
          {isRondo && <span style={{ ...headLabel, width: COL.recall }}>RECALL</span>}
          <span style={{ ...headLabel, width: COL.pts }}>PTS</span>
          <span style={{ ...headLabel, width: COL.sliver + COL.kills, paddingLeft: COL.sliver, color: WHITE }}>ELIMS</span>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: primary }} />
          <div style={{ position: 'absolute', right: 0, bottom: 0, width: COL.kills, height: 3, background: secondary }} />
        </div>

        {/* ── rows + legend — one block, legend always directly under the last row ── */}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 260,
            width: PANEL_W,
            filter: 'drop-shadow(0 10px 22px rgba(0,0,0,0.25))',
          }}
        >
          <AnimatedTeamList
            teams={sortedTeams}
            overlayStyle={overlayStyle}
            accent={primary}
            secondary={secondary}
            apiEnabled={apiEnabled}
            baseRowHeight={baseRowHeight}
            baseHealthBar={baseHealthBar}
            matchId={matchData?._id ?? null}
            recallEvents={recallEvents}
          />

          {/* legend — ink bar, cut bottom-left, attached to the list */}
          <div
            style={{
              position: 'relative',
              height: LEGEND_H,
              background: INK,
              clipPath: `polygon(0 0, 100% 0, 100% 100%, ${CUT}px 100%, 0 calc(100% - ${CUT}px))`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: isRondo ? 22 : 28,
              paddingTop: 3,
              boxSizing: 'border-box',
              fontFamily: FONT,
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: WHITE,
            }}
          >
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, background: primary }} />
            <Key swatch={<Bar color={ALIVE} />} label="ALIVE" />
            <Key swatch={<Bar color={KNOCK} />} label="KNOCK" />
            <Key swatch={<Bar color="#4A4A52" />} label="DEAD" />
            {isRondo && (
              <Key
                swatch={
                  <span style={{ display: 'inline-flex', gap: 2 }}>
                    <RecallBolt available width={9} height={18} />
                    <RecallBolt available={false} width={9} height={18} />
                  </span>
                }
                label="RECALL"
              />
            )}
          </div>

          {/* Smash Point under the legend: shown only when set for this match. */}
          <div style={{ marginTop: 6, marginLeft: 60, width: 420 }}>
            <SmashPointBar match={match} tournament={tournament} height={38} />
          </div>
        </div>
      </div>
    </RecallLeftContext.Provider>
  );
};

export default LiveStats;