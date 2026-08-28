import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useSortedTeams, Player, MatchData, SortedTeam } from '../../shared/hooks/unsortteams';
// NOTE: SocketManager import removed — this component no longer opens its
// own socket subscription. PublicThemeRenderer owns the single socket
// connection, listens to 'bulkUpdate', and passes the freshly-merged
// matchData / overallData down as props on every change. That prop update
// is what re-renders this component now — see useSortedTeams below.
//
// NOTE: Player / MatchData are imported from useSortedTeams, NOT
// redeclared here. Two same-named-but-different-shaped interfaces (e.g. a
// required vs optional field) are unrelated types to TypeScript even with
// an identical name — that's what caused the TS2345 error elsewhere. Every
// theme should import these types from the shared hook instead of
// copy-pasting its own version.
//
// NOTE: all of the old mergeMatchPatch-style logic — matching updates by
// _id vs teamId, folding player-level patches in, deciding whether match 1
// should ignore overallData, breaking ties by kills — used to live here
// across six separate socket handlers. That derivation now lives once in
// useSortedTeams (shared across every theme's Alerts/LiveStats/battlebar),
// called below with mode 'liveUntilDead': ranked by this match's live
// points while a team is still alive, by cumulative totalPoints once
// eliminated — tie-broken by totalKills either way.

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
}

interface LiveStatsProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
  overallData?: any;
}

// ─────────────────────────────────────────────
// EliminatedOverlay (SVG version)
// Expands a colored bar across the row and fades
// in "ELIMINATED" text, then collapses again.
// ─────────────────────────────────────────────
interface EliminatedOverlayProps {
  x: number;
  y: number;
  width: number;
  height: number;
  onDone: () => void;
}

const EliminatedOverlay = memo(({ x, y, width, height, onDone }: EliminatedOverlayProps) => {
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
  const currentWidth = isExpanded ? width - 5 : 0;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect
        x={x}
        y={y}
        height={height}
        width={currentWidth}
        fill="url(#eliminatedGradient)"
        style={{
          transition:
            phase === 'in'
              ? 'width 1.5s cubic-bezier(0.22, 1, 0.36, 1)'
              : 'width 0.6s cubic-bezier(0.55, 0, 1, 0.45)',
        }}
      />
      <text
        x={x + width / 2}
        y={y + height / 2 + 14}
        textAnchor="middle"
        fontFamily="AGENCYB, Arial"
        fontSize="34"
        fontWeight="bold"
        fill="white"
        letterSpacing="6"
        style={{
          opacity: isExpanded ? 1 : 0,
          transition: phase === 'in' ? 'opacity 0.4s ease 0.8s' : 'opacity 0.3s ease',
        }}
      >
        ELIMINATED
      </text>
    </g>
  );
});
EliminatedOverlay.displayName = 'EliminatedOverlay';

// ─────────────────────────────────────────────
// FiringIcon (SVG bullet icon, pulsing red glow)
// ─────────────────────────────────────────────
const FiringIcon = ({ cx, cy, size }: { cx: number; cy: number; size: number }) => (
  <g
    className="fire-icon"
    transform={`translate(${cx - size / 2}, ${cy - size / 2}) scale(${size / 500})`}
  >
    <g fill="white" stroke="red" strokeWidth="6" transform="rotate(90 250 250)">
      <polygon points="285.374,191.068 285.374,151.082 218.227,151.082 218.227,191.068 204.646,218.23 298.955,218.23" />
      <rect x="201.441" y="235.015" width="100.721" height="184.656" />
      <path
        d="M270.558,41.682L259.84,5.985C258.774,2.434,255.509,0,251.799,0c-3.702,0-6.975,2.434-8.041,5.984l-10.71,35.697
        c-9.031,30.107-13.765,61.23-14.512,92.613h66.535C284.323,102.912,279.589,71.789,270.558,41.682z"
      />
    </g>
    <path
      d="M294.703,458.164c0.26-0.688,0.537-1.368,0.713-2.09l4.902-19.615h-97.037l4.893,19.615
      c0.185,0.722,0.453,1.402,0.722,2.09c-4.516,3.794-7.453,9.417-7.453,15.763v8.998c0,11.407,9.275,20.681,20.681,20.681h59.358
      c11.398,0,20.681-9.275,20.681-20.681v-8.998C302.165,467.581,299.228,461.957,294.703,458.164z"
      fill="white"
      stroke="red"
      strokeWidth="6"
    />
  </g>
);

// ─────────────────────────────────────────────
// TeamRow (SVG) — carries the per-row effects:
//  - dim the whole row once the team is all dead
//  - pulsing blue overlay while outside the circle
//  - "ELIMINATED" sweep the moment the team dies
//  - firing bullet icon replacing the rank number
// ─────────────────────────────────────────────
interface TeamRowProps {
  team: any;
  index: number;
  round?: Round | null;
  rowHeight: number;
}

const TeamRow = ({ team, index, round, rowHeight }: TeamRowProps) => {
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

  const y = index * rowHeight;
  const isFiring = team.players.some((p: Player) => p.isFiring);

  return (
    <g style={{ opacity: team.isAllDead ? 0.80 : 1, transition: 'opacity 0.6s ease' }}>
      <rect x="2953" y={y} width="887" height={rowHeight} fill="url(#blackGradient)" />
      <rect x="3059" y={y} width="380" height={rowHeight} fill="url(#paint2_linear_2001_9)" />
      <rect
        x="3059"
        y={y}
        width="393"
        height={rowHeight}
        fill="url(#paint3_linear_2001_9)"
        fillOpacity="0.76"
      />
      <rect x="2949" y={y} width="10" height={rowHeight} fill="url(#paint4_linear_2001_9)" />
      <line x1="2949" y1={y + rowHeight} x2="3840" y2={y + rowHeight} stroke="white" strokeWidth="2" />

      {/* Outside-blue-circle pulse, only while the team is still alive */}
      {team.hasOutsideBlueCircle && !team.isAllDead && (
        <rect
          x="2953"
          y={y}
          width="887"
          height={rowHeight}
          fill="#3b82f6"
          className="pulse-blue-row"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {isFiring ? (
        <FiringIcon cx={3010} cy={y + rowHeight / 2} size={48} />
      ) : (
        <text x="2990" y={y + 65} fontFamily="supermolot" fontSize="48" fill="white" fontWeight="700">
          {index + 1}
        </text>
      )}

      <image
        href={team.teamLogo}
        x="3070"
        y={y + 6}
        width="80"
        height="80"
        preserveAspectRatio="xMidYMid meet"
      />
      <text x="3170" y={y + 65} fontFamily="supermolot" fontSize="48" fill="white" fontWeight="700">
        {team.teamTag}
      </text>

      {/* Health Bars */}
      <g transform={`translate(3470, ${y + 14})`}>
        {team.players.length === 0 ? (
          <text x="0" y="35" fontFamily="supermolot" fontSize="30" fill="white" fontWeight="bold">
            MISS
          </text>
        ) : (
          team.players.map((player: Player, pIndex: number) => {
            const isDead = player.liveState === 5 || player.bHasDied;
            const isAlive = [0, 1, 2, 3].includes(player.liveState);
            const isKnocked = player.liveState === 4;
            const useApiHealth = round?.apiEnable === true;

            const BASE_BAR_H = 70;
            const BAR_W = 15;
            const GAP = 5;

            let barHeight = 0;
            let barColor = '';

            if (useApiHealth) {
              if (isDead) {
                barHeight = 0;
                barColor = 'transparent';
              } else if (isKnocked) {
                const healthRatio = Math.max(0, Math.min(1, player.health / (player.healthMax || 100)));
                barHeight = healthRatio * BASE_BAR_H;
                barColor = '#ef4444';
              } else if (isAlive) {
                const healthRatio = Math.max(0, Math.min(1, player.health / (player.healthMax || 100)));
                barHeight = healthRatio * BASE_BAR_H;
                barColor = '#07e63f';
              }
            } else {
              if (isDead) {
                barHeight = 0;
                barColor = 'transparent';
              } else if (isKnocked) {
                barHeight = BASE_BAR_H;
                barColor = '#ef4444';
              } else if (isAlive) {
                barHeight = BASE_BAR_H;
                barColor = '#07e63f';
              }
            }

            return (
              <g key={player._id} transform={`translate(${pIndex * (BAR_W + GAP)}, 0)`}>
                <rect width={BAR_W} height={BASE_BAR_H} fill="#4b5563" />
                <rect y={BASE_BAR_H - barHeight} width={BAR_W} height={barHeight} fill={barColor} />
              </g>
            );
          })
        )}
      </g>

      <text x="3620" y={y + 65} fontFamily="supermolot" fontSize="48" fill="white" fontWeight="700">
        {team.totalKills}
      </text>
      <text x="3720" y={y + 65} fontFamily="supermolot" fontSize="48" fill="white" fontWeight="700">
        {team.totalPoints}
      </text>

      {showOverlay && (
        <EliminatedOverlay
          key={overlayKey}
          x={2953}
          y={y}
          width={887}
          height={rowHeight}
          onDone={handleOverlayDone}
        />
      )}
    </g>
  );
};

// ─────────────────────────────────────────────
// LiveStats (main component)
//
// No socket subscription anymore. PublicThemeRenderer owns the single
// socket connection for the page, listens to 'bulkUpdate', and re-renders
// this component with fresh `matchData` / `overallData` props whenever
// the backend pushes a change. useSortedTeams does all the derived-stat
// work that used to live in mergeMatchPatch + six separate socket handlers
// here (matching updates by _id/teamId, folding player patches in,
// skipping overallData on match 1, computing totalKills/totalPoints/
// isAllDead/hasOutsideBlueCircle, and sorting).
// ─────────────────────────────────────────────
const LiveStats: React.FC<LiveStatsProps> = ({ tournament, round, match, matchData, overallData }) => {
  // 'liveUntilDead' sortBy: while a team is still alive, ranked by THIS
  // match's live placePoints (kills tiebreak); the moment it's eliminated,
  // ranked by the real cumulative event standings instead, so its row
  // locks into its true tournament position rather than continuing to
  // shift with in-match placePoints churn.
  const sortedTeams: SortedTeam[] = useSortedTeams(matchData, overallData, 'liveUntilDead');

  const ROW_HEIGHT = 100;
  const START_Y = 50;
  const TOTAL_HEIGHT = 2160;
  const AVAILABLE_HEIGHT = TOTAL_HEIGHT - START_Y;
  const contentHeight = sortedTeams.length * ROW_HEIGHT;
  const scale = contentHeight > AVAILABLE_HEIGHT ? AVAILABLE_HEIGHT / contentHeight : 1;

  if (!matchData) {
    return (
      <svg width="1920" height="1200" viewBox="0 0 1920 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="1600" y="350" fontFamily="Arial" fontSize="24" fill="white">No match data</text>
      </svg>
    );
  }

  return (
    <svg
      width="1920"
      height="1200"
      viewBox="0 0 3840 2160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Keyframes for the ported-over effects */}
      <style>{`
        @keyframes pulseBlueRow {
          0%   { fill-opacity: 0.12; }
          50%  { fill-opacity: 0.45; }
          100% { fill-opacity: 0.12; }
        }
        .pulse-blue-row {
          animation: pulseBlueRow 1.2s ease-in-out infinite;
        }
        @keyframes firePulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
        .fire-icon {
          animation: firePulse 0.6s ease-in-out infinite;
          filter: drop-shadow(0 0 10px red) drop-shadow(0 0 18px red);
        }
      `}</style>

      {/* Dynamic team data */}
      <g transform={`translate(0, ${START_Y}) scale(1, ${scale})`}>
        {/* Header attached to scale group */}
        <g transform="translate(0, -567)">
          <path
            d="M3059 534.5L3081.14 512L3840 504V567H3059L3059 534.5Z"
            fill="url(#paint0_linear_2001_9)"
          />

          <text
            x="3165"
            y="558"
            fontFamily="Bebas"
            fontSize="44"
            fontWeight="300"
            fill="white"

          >
            TEAM
          </text>
          <text
            x="3470"
            y="558"
            fontFamily="Bebas"
            fontSize="44"
            fill="white"

          >
            ALIVE
          </text>
          <text
            x="3608"
            y="558"
            fontFamily="Bebas"
            fontSize="44"
            fill="white"

          >
            KILLS
          </text>
          <text
            x="3710"
            y="558"
            fontFamily="Bebas"
            fontSize="44"
            fill="white"

          >
            TOTAL
          </text>
        </g>

        {sortedTeams.map((team, index) => (
          // Composite key: match switch → matchId changes → row remounts →
          // wasEliminatedRef can't leak a stale ELIMINATED from the last match.
          <TeamRow
            key={`${matchData?._id ?? 'nomatch'}:${team._id}`}
            team={team}
            index={index}
            round={round}
            rowHeight={ROW_HEIGHT}
          />
        ))}
        {/* Footer attached to scale group */}
        <g transform={`translate(3059, ${sortedTeams.length * ROW_HEIGHT})`}>
          <rect
            x="0"
            y="0"
            width="900"
            height="53"
            fill="url(#paint0_linear_2001_9)"
          />
          <rect
            x="60"
            y="10"
            width="35"
            height="35"
            fill="#07e63f"
          />
          <text
            x="106"
            y="44"
            fontFamily="Bebas"
            fontSize="44"
            fontWeight="300"
            fill="white"
          >
            ALIVE
          </text>
          <rect
            x="265"
            y="10"
            width="35"
            height="35"
            fill="red"
          />
          <text
            x="306"
            y="44"
            fontFamily="Bebas"
            fontSize="44"
            fontWeight="300"
            fill="white"
          >
            KNOCK
          </text>
          <rect
            x="490"
            y="10"
            width="35"
            height="35"
            fill="grey"
          />
          <text
            x="536"
            y="44"
            fontFamily="Bebas"
            fontSize="44"
            fontWeight="300"
            fill="white"
          >
            DEAD
          </text>
        </g>
      </g>

      <defs>
        <linearGradient
          id="blackGradient"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop stopColor="#0c0c0c" stopOpacity="0.9" />
          <stop offset="0.826923" stopColor="0.8" />
        </linearGradient>

        <linearGradient
          id="lightGradient"
          x1="3320"
          y1="567"
          x2="3320"
          y2="691"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#bd1717" />
          <stop offset="0.826923" stopColor="#292929" />
        </linearGradient>

        <linearGradient
          id="paint0_linear_2001_9"
          x1="3105.73"
          y1="529.109"
          x2="3751.74"
          y2="586.34"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={tournament.primaryColor || "#E01515"} />
          <stop offset="1" stopColor={tournament.secondaryColor || "#620505"} />
        </linearGradient>

        <linearGradient
          id="paint1_linear_2001_9"
          x1="3429"
          y1="567"
          x2="3427.5"
          y2="723"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="transparent" />
          <stop offset="0.826923" stopColor="#888" />
        </linearGradient>

        <linearGradient
          id="paint2_linear_2001_9"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop stopColor={tournament.primaryColor || "#E01515"} />
          <stop offset="1" stopColor={tournament.secondaryColor || "#620505"} />
        </linearGradient>

        <linearGradient
          id="paint4_linear_2001_9"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop stopColor={tournament.primaryColor || "#DA1414"} />
          <stop offset="1" stopColor={tournament.secondaryColor || "#4F0707"} />
        </linearGradient>

        {/* Gradient used by the ELIMINATED sweep overlay */}
        <linearGradient
          id="eliminatedGradient"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
        >
          <stop stopColor={tournament.primaryColor || "#E01515"} />
          <stop offset="1" stopColor={tournament.secondaryColor || "#620505"} />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default LiveStats;