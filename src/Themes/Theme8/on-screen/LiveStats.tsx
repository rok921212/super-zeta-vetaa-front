import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  memo,
} from 'react';
import { useSortedTeams, isPlayerDead, Player, MatchData, SortedTeam } from '../../shared/hooks/unsortteams';
import { useRecallEvents, RecallEvent } from '../../shared/hooks/recallEvents';
import TeamRecallOverlay from '../../shared/components/TeamRecallOverlay';
import {
  brand,
  chamfer,
  SCRIM,
  SCRIM_SOLID,
  HAIRLINE,
  HAIRLINE_SOFT,
  ROW_ALT,
  TEXT,
  TEXT_DIM,
  YELLOW_LIVE,
  FONT_DISPLAY,
  FONT_LABEL,
  FONT_MONO,
  EASE_STEP,
  DUR_REORDER,
  Rail,
} from '../shell';

// NOTE: SocketManager import removed — this component no longer opens its
// own socket subscription. PublicThemeRenderer owns the single socket
// connection, listens to 'bulkUpdate', and passes the freshly-merged
// matchData / overallData down as props on every change. That prop update
// is what re-renders this component now — see useSortedTeams below.
//
// NOTE: Player / Team / MatchData are imported from useSortedTeams, NOT
// redeclared here. Every theme imports these types from the shared hook.
//
// THEME8 "DATUM" reshell: the data pipeline (useSortedTeams 'liveUntilDead',
// useRecallEvents), the scaleY fit math, the EliminatedOverlay / PlayerHealthBar
// / AnimatedTeamRow rig, every timer, and the right-side 480px panel placement
// are all unchanged. Only the visual shell changes — flat charcoal ledger rows,
// a mono column header + ticked rail, an index chip with a brand binding edge,
// tabular numerals. The injected infinite `@keyframes pulseBlue` is gone; the
// outside-blue-circle state is a steady inset marking. Row re-index retimed to
// the near-step EASE_STEP curve.

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
// EliminatedOverlay — unchanged lifecycle (rAF + 2500ms / 3300ms timers,
// width-sweep transition). Only the surface + label styling is DATUM now.
// ─────────────────────────────────────────────
interface EliminatedOverlayProps {
  overlayStyle: React.CSSProperties;
  rowHeight: number;
  onDone: () => void;
}

const EliminatedOverlay = memo(
  ({ overlayStyle, rowHeight, onDone }: EliminatedOverlayProps) => {
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
            width: isExpanded ? 'calc(100% - 5px)' : '0%',
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
              fontFamily: FONT_LABEL,
              fontSize: '0.95rem',
              color: '#ffffff',
              letterSpacing: '0.34em',
              textShadow: '0 1px 6px rgba(0,0,0,0.6)',
              opacity: phase === 'in' && expanded ? 1 : 0,
              transition:
                phase === 'in' ? 'opacity 0.4s ease 0.8s' : 'opacity 0.3s ease',
              whiteSpace: 'nowrap',
            }}
          >
            ELIMINATED
          </span>
        </div>
      </div>
    );
  }
);
EliminatedOverlay.displayName = 'EliminatedOverlay';

// ─────────────────────────────────────────────
// PlayerHealthBar — unchanged fill logic + memo comparator. Narrowed to a
// 6px tick on a hairline track; alive stays status-green, knock stays red.
// ─────────────────────────────────────────────
interface HealthBarProps {
  player: Player;
  apiEnabled: boolean;
  baseHealthBar: number;
}

const PlayerHealthBar = memo(
  ({ player, apiEnabled, baseHealthBar }: HealthBarProps) => {
    const isDead = isPlayerDead(player);
    const isKnocked = player.liveState === 4;

    let barHeight = 0;
    let barColor = '';

    if (!isDead) {
      barHeight = apiEnabled
        ? Math.max(0, Math.min(1, player.health / (player.healthMax || 100))) * baseHealthBar
        : baseHealthBar;
      barColor = isKnocked ? 'bg-red-500' : 'bg-[#0dd10d]';
    }

    return (
      <div
        className="relative w-[6px]"
        style={{ height: `${baseHealthBar}px`, background: HAIRLINE_SOFT }}
      >
        <div
          className={`absolute bottom-0 w-full transition-all duration-300 ${barColor}`}
          style={{ height: `${barHeight}px` }}
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
    prev.baseHealthBar === next.baseHealthBar
);
PlayerHealthBar.displayName = 'PlayerHealthBar';

// ─────────────────────────────────────────────
// AnimatedTeamRow — unchanged elimination-edge refs/effect, unchanged
// TeamRecallOverlay. Row re-index transition retimed to EASE_STEP. Inner
// markup is now a DATUM ledger row.
// ─────────────────────────────────────────────
interface AnimatedTeamRowProps {
  team: any;
  index: number;
  overlayStyle: React.CSSProperties;
  accent: string;
  apiEnabled: boolean;
  baseRowHeight: number;
  baseHealthBar: number;
  transitionReady: boolean;
  recallEvents: RecallEvent[];
}

const FiringIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 500 500"
    style={{
      width: 26,
      height: 26,
      transform: 'rotate(90deg)',
      filter: 'drop-shadow(0 0 10px red) drop-shadow(0 0 18px red)',
    }}
  >
    <g fill="white" stroke="red" strokeWidth="2">
      <polygon points="285.374,191.068 285.374,151.082 218.227,151.082 218.227,191.068 204.646,218.23 298.955,218.23" />
      <rect x="201.441" y="235.015" width="100.721" height="184.656" />
      <path d="M270.558,41.682L259.84,5.985C258.774,2.434,255.509,0,251.799,0c-3.702,0-6.975,2.434-8.041,5.984l-10.71,35.697c-9.031,30.107-13.765,61.23-14.512,92.613h66.535C284.323,102.912,279.589,71.789,270.558,41.682z" />
    </g>
    <path
      d="M294.703,458.164c0.26-0.688,0.537-1.368,0.713-2.09l4.902-19.615h-97.037l4.893,19.615c0.185,0.722,0.453,1.402,0.722,2.09c-4.516,3.794-7.453,9.417-7.453,15.763v8.998c0,11.407,9.275,20.681,20.681,20.681h59.358c11.398,0,20.681-9.275,20.681-20.681v-8.998C302.165,467.581,299.228,461.957,294.703,458.164z"
      fill="white"
      stroke="red"
      strokeWidth="2"
    />
  </svg>
);

const AnimatedTeamRow = ({
  team,
  index,
  overlayStyle,
  accent,
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
  const valFont = Math.round(baseRowHeight * 0.5);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: `${index * baseRowHeight}px`,
        height: `${baseRowHeight}px`,
        transition: transitionReady ? `top ${DUR_REORDER}ms ${EASE_STEP}` : 'none',
        opacity: team.isAllDead ? 0.7 : 1,
        zIndex: 1,
      }}
    >
      <div
        className="w-full relative flex items-stretch"
        style={{
          height: `${baseRowHeight}px`,
          background: index % 2 ? ROW_ALT : 'transparent',
          borderBottom: `1px solid ${HAIRLINE_SOFT}`,
        }}
      >
        {/* steady outside-blue-circle marking (no infinite animation) */}
        {team.hasOutsideBlueCircle && !team.isAllDead && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(59, 130, 246, 0.12)',
              boxShadow: 'inset 0 0 18px rgba(59,130,246,0.55)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        )}

        {/* index chip / firing icon — brand binding edge */}
        <div
          style={{
            width: 46,
            minWidth: 46,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRight: `2px solid ${accent}`,
            fontFamily: FONT_MONO,
            fontSize: 15,
            color: TEXT,
          }}
        >
          {firing ? <FiringIcon /> : String(index + 1).padStart(2, '0')}
        </div>

        {/* team logo */}
        <div
          style={{
            width: 42,
            minWidth: 42,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 6,
          }}
        >
          <img
            src={team.teamLogo || '/def_logo.png'}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            onError={(e) => {
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
            fontFamily: FONT_DISPLAY,
            fontSize: valFont,
            letterSpacing: '0.06em',
            color: TEXT,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {team.teamTag.toUpperCase()}
        </div>

        {/* health pips */}
        <div
          style={{
            width: 60,
            minWidth: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
          }}
        >
          {team.players.length === 0 ? (
            <span style={{ fontFamily: FONT_LABEL, fontSize: 12, color: TEXT_DIM, letterSpacing: '0.15em' }}>
              MISS
            </span>
          ) : (
            team.players.map((player: Player) => (
              <PlayerHealthBar
                key={player._id}
                player={player}
                apiEnabled={apiEnabled}
                baseHealthBar={baseHealthBar}
              />
            ))
          )}
        </div>

        {/* points */}
        <div
          style={{
            width: 52,
            minWidth: 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 8,
            fontFamily: FONT_DISPLAY,
            fontSize: valFont,
            fontVariantNumeric: 'tabular-nums',
            color: TEXT,
          }}
        >
          {team.totalPoints}
        </div>

        {/* kills — live emphasis */}
        <div
          style={{
            width: 52,
            minWidth: 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 12,
            fontFamily: FONT_DISPLAY,
            fontSize: valFont,
            fontVariantNumeric: 'tabular-nums',
            color: YELLOW_LIVE,
          }}
        >
          {team.totalKills}
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

  const containerHeight = teams.length * baseRowHeight;

  return (
    <div style={{ position: 'relative', height: `${containerHeight}px`, width: '100%' }}>
      {teams.map((team, index) => (
        <AnimatedTeamRow
          key={`${matchId ?? 'nomatch'}:${team._id}`}
          team={team}
          index={index}
          overlayStyle={overlayStyle}
          accent={accent}
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
// LiveStats (main) — sort mode 'liveUntilDead' preserved.
// ─────────────────────────────────────────────
const LiveStats: React.FC<LiveStatsProps> = ({
  tournament,
  round,
  match,
  matchData,
  overallData,
}) => {
  const sortedTeams: SortedTeam[] = useSortedTeams(matchData, overallData, 'liveUntilDead');
  // Shared per-player recall detection — isRondoMap-gated internally.
  const recallEvents = useRecallEvents(matchData, match);

  // ── Layout constants (unchanged fit math) ──────────
  const { baseRowHeight, baseHealthBar, scaleY } = useMemo(() => {
    const listTopOffset = 250;
    const canvasHeight = 1080;
    const availableHeight = Math.max(0, canvasHeight - listTopOffset);
    const rowsCount = Math.max(1, sortedTeams.length);
    const baseRowHeight = 50;
    const baseHealthBar = 40;
    const totalNeeded = rowsCount * baseRowHeight;
    const scaleY = totalNeeded > 0 ? Math.min(1, availableHeight / totalNeeded) : 1;
    return { baseRowHeight, baseHealthBar, scaleY };
  }, [sortedTeams.length]);

  const { primary } = brand(tournament.primaryColor, tournament.secondaryColor);

  // charcoal sweep + brand edge — passed to EliminatedOverlay
  const overlayStyle = useMemo<React.CSSProperties>(
    () => ({ background: SCRIM_SOLID, borderLeft: `2px solid ${primary}` }),
    [primary]
  );

  const apiEnabled = round?.apiEnable === true;

  if (!matchData) {
    return (
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="1600" y="350" fontFamily="Arial" fontSize="24" fill="white">No match data</text>
      </svg>
    );
  }

  return (
    <div className="w-[1920px] h-[1080px] flex justify-end relative  top-[0px]">
      {/* ── column header — mono labels over a ticked rail ── */}
      <div
        className="absolute right-0"
        style={{ top: 222, width: 480, background: SCRIM }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            height: 22,
            padding: '0 12px 2px 46px',
            fontFamily: FONT_MONO,
            fontSize: 10,
            letterSpacing: '0.16em',
            color: TEXT_DIM,
          }}
        >
          <span style={{ flex: 1 }}>TEAM</span>
          <span style={{ width: 60, textAlign: 'center' }}>HP</span>
          <span style={{ width: 52, textAlign: 'right' }}>PTS</span>
          <span style={{ width: 52, textAlign: 'right' }}>K</span>
        </div>
        <Rail dir="h" length={480} gap={20} activeIndex={0} accent={primary} />
      </div>

      {/* ── animated team rows — same right-0 / top-260 / w-480 placement + scaleY ── */}
      <div className="absolute right-0 top-[260px] w-[480px]">
        <div style={{ transform: `scaleY(${scaleY})`, transformOrigin: 'top right' }}>
          <AnimatedTeamList
            teams={sortedTeams}
            overlayStyle={overlayStyle}
            accent={primary}
            apiEnabled={apiEnabled}
            baseRowHeight={baseRowHeight}
            baseHealthBar={baseHealthBar}
            matchId={matchData?._id ?? null}
            recallEvents={recallEvents}
          />

          {/* legend */}
          <div
            className="absolute"
            style={{
              left: 60,
              top: '100%',
              width: 420,
              marginTop: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              padding: '5px 12px',
              background: SCRIM,
              clipPath: chamfer(10),
              fontFamily: FONT_MONO,
              fontSize: 10,
              letterSpacing: '0.12em',
              color: TEXT_DIM,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#0dd10d' }} />
              ALIVE
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#ef4444' }} />
              KNOCK
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: HAIRLINE }} />
              DEAD
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveStats;
