import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  memo,
} from 'react';
import { useSortedTeams, isPlayerDead, Player, MatchData, SortedTeam } from '../../shared/hooks/unsortteams';
import { useRecallEvents, useRecallBanner, RecallEvent } from '../../shared/hooks/recallEvents';
import RecalledOverlay from '../../shared/components/RecalledOverlay';
// NOTE: SocketManager import removed — this component no longer opens its
// own socket subscription. PublicThemeRenderer owns the single socket
// connection, listens to 'bulkUpdate', and passes the freshly-merged
// matchData / overallData down as props on every change. That prop update
// is what re-renders this component now — see useSortedTeams below.
//
// NOTE: Player / Team / MatchData are imported from useSortedTeams, NOT
// redeclared here. Two same-named-but-different-shaped interfaces (e.g. a
// required vs optional field) are unrelated types to TypeScript even with
// an identical name — that's what caused the TS2345 error. Every theme
// should import these types from the shared hook instead of copy-pasting
// its own version.

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
// EliminatedOverlay
// ─────────────────────────────────────────────
interface EliminatedOverlayProps {
  gradientStyle: React.CSSProperties;
  rowHeight: number;
  onDone: () => void;
}

const EliminatedOverlay = memo(
  ({ gradientStyle, rowHeight, onDone }: EliminatedOverlayProps) => {
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
            ...gradientStyle,
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
              fontFamily: 'AGENCYB, sans-serif',
              fontSize: '1.4rem',
              fontWeight: 'bold',
              color: '#ffffff',
              letterSpacing: '0.25em',
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
// PlayerHealthBar — lightning-bolt style (static, no flicker)
// Jagged clip-path track (so even empty/dead bars read as a "cracked
// bolt"), electric cyan→teal fill (red-hot when knocked), steady neon
// glow, bright spark tip at the fill's leading edge. Same props/logic
// as before — visual only.
// ─────────────────────────────────────────────
interface HealthBarProps {
  player: Player;
  apiEnabled: boolean;
  baseHealthBar: number;
}



// Classic S-shaped lightning bolt outline (24x24 viewBox)
const BOLT_PATH = 'M13 2 3 14h9l-1 8 10-12h-9l1-8z';

const PlayerHealthBar = memo(
  ({ player, apiEnabled, baseHealthBar }: HealthBarProps) => {
    const isDead = isPlayerDead(player);
    const isKnocked = player.liveState === 4;

    let healthFraction = 0;
    let fillColor = '';

    if (!isDead) {
      healthFraction = apiEnabled
        ? Math.max(0, Math.min(1, player.health / (player.healthMax || 100)))
        : 1;

      fillColor = isKnocked ? '#ef4444' : '#22c55e'; // matches KNOCK / ALIVE legend swatches
    }

    const clipId = `bolt-clip-${player._id}`;
    // viewBox is 0–24 top-to-bottom; fill rises from the bottom (y=24) upward
    const fillTop = 24 - healthFraction * 24;

    return (
      <div
        className="relative shrink-0 left-[-12px]"
        style={{ width: '14px', height: `${baseHealthBar}px` }}
      >
        <svg
          width="14"
          height={baseHealthBar}
          viewBox="0 0 24 24"
          preserveAspectRatio="none"
        >
          <defs>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
              <path d={BOLT_PATH} />
            </clipPath>
          </defs>

          {/* Track — dead/empty bolt, matches the DEAD legend swatch */}
          <path
            d={BOLT_PATH}
            fill="#282828"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="0.6"
          />

          {/* Health fill — clipped to the bolt silhouette, rises from the bottom */}
          {!isDead && (
            <rect
              x="0"
              y={fillTop}
              width="24"
              height={24 - fillTop}
              fill={fillColor}
              clipPath={`url(#${clipId})`}
              style={{ transition: 'y 0.3s ease, height 0.3s ease' }}
            />
          )}
        </svg>
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
// AnimatedTeamRow
// No memo — index changes must always re-render
// so `top` and rank number update on re-sort.
//
// ROW_GAP: vertical breathing room between team rows. The outer
// positioning div still occupies the full baseRowHeight slot (so the
// index*baseRowHeight math / scaleY layout calc in LiveStats is
// untouched), but the visible row content is inset by ROW_GAP/2 on
// top and bottom, leaving a real gap between one team's row and the
// next.
// ─────────────────────────────────────────────
const ROW_GAP = 6;

interface AnimatedTeamRowProps {
  team: any;
  index: number;
  gradientStyle: React.CSSProperties;
  apiEnabled: boolean;
  baseRowHeight: number;
  baseHealthBar: number;
  transitionReady: boolean;
  recallEvents: RecallEvent[];
}

const AnimatedTeamRow = ({
  team,
  index,
  gradientStyle,
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

  // Shared per-player recall (Rondo): match-wide events filtered to this team.
  const teamKey = String(team._id ?? team.teamId ?? '');
  const rowRecalls = useMemo(
    () => recallEvents.filter((e) => e.teamId === teamKey),
    [recallEvents, teamKey]
  );
  const { current: currentRecall, onDone: handleRecallDone } = useRecallBanner(rowRecalls);

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

  const innerRowHeight = baseRowHeight - ROW_GAP;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: `${index * baseRowHeight}px`,
        height: `${baseRowHeight}px`,
        transition: transitionReady ? 'top 0.7s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
        opacity: team.isAllDead ? 0.55 : 1,
        filter: team.isAllDead ? 'grayscale(0.4)' : 'none',
        zIndex: 1,
      }}
    >
      <style>{`@keyframes pulseBlue {
  0% { box-shadow: inset 0 0 10px rgba(59,130,246,0.4); }
  50% { box-shadow: inset 0 0 25px rgba(59,130,246,1); }
  100% { box-shadow: inset 0 0 10px rgba(59,130,246,0.4); }
}`}</style>

      <div
        className="w-full relative flex items-center font-[AGENCYB] text-[2rem]"
        style={{
          height: `${innerRowHeight}px`,
          marginTop: `${ROW_GAP / 2}px`,
          background: 'linear-gradient(90deg, #0a0a0ce8 0%, #101014f2 60%, #17171cf7 100%)',
          borderBottom: '2px solid transparent',
          borderImage: `linear-gradient(90deg, ${gradientStyle?.background ? '' : ''}transparent, rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.08) 100%) 1`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 0 rgba(0,0,0,0.6)',
        }}
      >
        {/* Team-color accent rail along the bottom of the row */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '2px',
            ...gradientStyle,
            opacity: team.isAllDead ? 0.35 : 0.9,
          }}
        />

        {team.hasOutsideBlueCircle && !team.isAllDead && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(59, 130, 246, 0.15)',
              boxShadow: 'inset 0 0 20px rgba(59,130,246,0.8)',
              animation: 'pulseBlue 1.2s infinite',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        )}

        {/* Rank — angled team-color plate */}
        <div
          className="relative flex items-center justify-center text-white shrink-0"
          style={{
            width: '80px',
            height: `${innerRowHeight}px`,
            ...gradientStyle,
            clipPath: 'polygon(0 0, 100% 0, 88% 100%, 0% 100%)',
            marginRight: '-14px',
            zIndex: 3,
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}
        >
          {team.players.some((p: Player) => p.isFiring) ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 500 500"
              className="w-[40px] h-[40px] animate-pulse"
              style={{
                transform: 'rotate(90deg)',
                filter: 'drop-shadow(0 0 18px red) drop-shadow(0 0 30px red)',
                transition: 'all 0.2s ease-in-out',
              }}
            >
              <g fill="white" stroke="red" strokeWidth="2">
                <polygon points="285.374,191.068 285.374,151.082 218.227,151.082 218.227,191.068 204.646,218.23 298.955,218.23" />
                <rect x="201.441" y="235.015" width="100.721" height="184.656" />
                <path d="M270.558,41.682L259.84,5.985C258.774,2.434,255.509,0,251.799,0c-3.702,0-6.975,2.434-8.041,5.984l-10.71,35.697
                  c-9.031,30.107-13.765,61.23-14.512,92.613h66.535C284.323,102.912,279.589,71.789,270.558,41.682z"/>
              </g>
              <path
                d="M294.703,458.164c0.26-0.688,0.537-1.368,0.713-2.09l4.902-19.615h-97.037l4.893,19.615
                c0.185,0.722,0.453,1.402,0.722,2.09c-4.516,3.794-7.453,9.417-7.453,15.763v8.998c0,11.407,9.275,20.681,20.681,20.681h59.358
                c11.398,0,20.681-9.275,20.681-20.681v-8.998C302.165,467.581,299.228,461.957,294.703,458.164z"
                fill="white"
                stroke="red"
                strokeWidth="2"
              />
            </svg>
          ) : (
            <span className="text-[1.9rem] font-extrabold tracking-tight">{index + 1}</span>
          )}
        </div>

        {/* Tag — white plate, slightly overlapped by the rank plate's angle */}
        <div
          className="h-full flex items-center justify-start gap-2 pl-[22px] pr-[10px] text-black bg-white shrink-0"
          style={{
            width: '150px',
            clipPath: 'polygon(6% 0, 100% 0, 100% 100%, 0% 100%)',
            boxShadow: '2px 0 6px rgba(0,0,0,0.35)',
          }}
        >
          <img
            src={team.teamLogo || '/def_logo.png'}
            alt=""
            className="w-[28px] h-[28px] object-contain shrink-0"
          />
          <span className="text-left tracking-wide truncate">{team.teamTag.toUpperCase()}</span>
        </div>

        {/* Stats — dark glass panel */}
        <div
          className="h-full flex items-center flex-1"
          style={{
            background: 'rgba(6,6,8,0.86)',
            backdropFilter: 'blur(2px)',
          }}
        >
          {/* Divider */}
          <div className="w-[1px] h-[60%] bg-white/10 shrink-0" />

          {/* Total Points */}
          <div
            className="flex flex-col items-center justify-center shrink-0"
            style={{ width: '58px' }}
          >
            <span className="text-white text-[1.5rem] leading-none font-extrabold tabular-nums">
              {team.totalPoints}
            </span>
          </div>

          {/* Divider */}
          <div className="w-[1px] h-[60%] bg-white/10 shrink-0" />

          {/* Live Kills — team-color accent so it pops on broadcast */}
          <div
            className="flex flex-col items-center justify-center shrink-0"
            style={{ width: '58px' }}
          >
            <span className="text-[1.5rem] leading-none font-extrabold tabular-nums text-white">
              {team.totalKills}
            </span>
          </div>

          {/* Divider */}
          <div className="w-[1px] h-[60%] bg-white/10 shrink-0" />

          {/* Health bars — lightning-bolt style */}
          <div
            className="flex gap-[1px] items-center justify-center flex-1 px-2"
            style={{ height: `${baseHealthBar}px` }}
          >
            {team.players.length === 0 ? (
              <div className="text-white/70 text-[18px] font-bold tracking-widest">MISS</div>
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
        </div>

        {showOverlay && (
          <EliminatedOverlay
            key={overlayKey}
            gradientStyle={gradientStyle}
            rowHeight={innerRowHeight}
            onDone={handleOverlayDone}
          />
        )}

        {currentRecall && (
          <RecalledOverlay
            key={currentRecall.bannerKey}
            playerName={currentRecall.playerName}
            rowHeight={innerRowHeight}
            onDone={handleRecallDone}
          />
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// AnimatedTeamList
// ─────────────────────────────────────────────
interface AnimatedTeamListProps {
  teams: any[];
  gradientStyle: React.CSSProperties;
  apiEnabled: boolean;
  baseRowHeight: number;
  baseHealthBar: number;
  matchId: string | null;
  recallEvents: RecallEvent[];
}

const AnimatedTeamList = ({
  teams,
  gradientStyle,
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
          // Composite key: on a match switch matchId changes and every row
          // remounts, so wasEliminatedRef / overlayKeyRef can't leak a stale
          // ELIMINATED state from the previous match.
          key={`${matchId ?? 'nomatch'}:${team._id}`}
          team={team}
          index={index}
          gradientStyle={gradientStyle}
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
// LiveStats (main component)
//
// No socket subscription anymore. PublicThemeRenderer owns the single
// socket connection for the page, listens to 'bulkUpdate', and re-renders
// this component with fresh `matchData` / `overallData` props whenever
// the backend pushes a change. useSortedTeams (shared across every theme's
// Alerts/LiveStats/battlebar) does all the derived-stat work that used to
// live in mergeMatchPatch + six separate socket handlers here.
// ─────────────────────────────────────────────
const LiveStats: React.FC<LiveStatsProps> = ({
  tournament,
  round,
  match,
  matchData,
  overallData,
}) => {
  // 'liveUntilDead' sortBy: while a team is still alive, ranked by THIS
  // match's live placePoints (kills tiebreak); once eliminated, ranked by
  // cumulative event standings instead — its row locks into its true
  // tournament position rather than continuing to shift in-match.
  const sortedTeams: SortedTeam[] = useSortedTeams(matchData, overallData, 'liveUntilDead');

  // ── Layout constants ──────────────────────────
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

  // ── Gradient ──────────────────────────────────
  const gradientStyle = useMemo<React.CSSProperties>(
    () => ({
      background: `linear-gradient(135deg, ${tournament.primaryColor || '#000'}, ${tournament.secondaryColor || '#333'})`,
    }),
    [tournament.primaryColor, tournament.secondaryColor]
  );

  const apiEnabled = round?.apiEnable === true;
  // Shared per-player recall detection — isRondoMap-gated internally.
  const recallEvents = useRecallEvents(matchData, match);
  const topTeam = sortedTeams[0];

  if (!matchData) {
    return (
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="1600" y="350" fontFamily="Arial" fontSize="24" fill="white">No match data</text>
      </svg>
    );
  }

  return (
    <div className="w-[1920px] h-[1080px] flex justify-end relative top-[0px]">
      {/* ── Top team hero card ── */}
      <div
        className="w-[00px] h-[190px] top-[70px] right-0 relative"
        style={gradientStyle}
      >
        <div
          className="absolute top-[150px] right-0 w-[400px] h-[40px] text-[20px] font-[agencyb]
                     flex items-center justify-between px-4 font-bold text-white  z-50"
          style={{
            background: `linear-gradient(45deg, ${tournament.secondaryColor} 30% , ${tournament.primaryColor} 80%)`,
          }}
        >
           <span className="relative left-[8px]">#</span>
          <span className="relative left-[0px]">TEAM</span>
          <span className="relative left-[55px]">TOTAL</span>
          <span className="relative left-[24px]">KILS</span>
          <span className="relative left-[0px]">ALIVE</span>
        </div>

     

        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/70 to-black h-[100px] top-[90px] z-10" />
      </div>

      {/* ── Animated team rows ── */}
      <div className="absolute right-0 top-[260px] w-[400px]">
        <div style={{ transform: `scaleY(${scaleY})`, transformOrigin: 'top right' }}>
          <AnimatedTeamList
            teams={sortedTeams}
            gradientStyle={gradientStyle}
            apiEnabled={apiEnabled}
            baseRowHeight={baseRowHeight}
            baseHealthBar={baseHealthBar}
            matchId={matchData?._id ?? null}
            recallEvents={recallEvents}
          />

          <div

            className="w-full h-[30px] font-[AGENCYB] bg-[#282828] flex justify-center items-center text-white font-bold"
          >
            ALIVE{' '}
            <span className="bg-green-500 w-[20px] h-[20px] ml-[5px] border border-black" />
          <div className="flex items-center ml-[20px]">
              KNOCK{' '}
              <span className="bg-red-500 w-[20px] h-[20px] ml-[5px] border border-white" />
            </div>
            <div className="flex items-center ml-[20px]">
              DEAD{' '}
              <span className="bg-[#282828] w-[20px] h-[20px] ml-[5px] border border-white" />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveStats;