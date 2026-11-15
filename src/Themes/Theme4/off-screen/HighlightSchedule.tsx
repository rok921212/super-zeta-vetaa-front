import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { computeMatchStandings } from '../../shared/hooks/officialStandings';
import { TeamLogo } from '../../shared/components/TeamLogo';

interface Tournament {
  _id: string;
  tournamentName: string;
  primaryColor?: string;
  secondaryColor?: string;
}

interface Round {
  _id: string;
  roundName: string;
  day?: string;
}

interface Match {
  _id: string;
  matchName?: string;
  matchNo?: number;
  _matchNo?: number;
  time?: string;
  map?: string;
  teams?: any[];
}

interface ScheduleProps {
  tournament: Tournament;
  round?: Round | null;
  matches?: Match[];
  matchDatas?: any[];
  selectedScheduleMatches?: string[];
}

interface MatchCardProps {
  match: Match;
  index: number;
  primary: string;
  secondary: string;
}

const CARD_W = 528;
const CARD_H = 284;
const GAP = 24;
// PublicThemeRenderer clips anything wider than the 1920 canvas.
const STAGE_W = 1920;
const EDGE = 24;

const getMapImage = (mapName?: string) => {
  switch (mapName?.toLowerCase()) {
    case 'erangel':
      return '/schedulePic/erag.avif';
    case 'miramar':
      return '/schedulePic/miramar.avif';
    case 'sanhok':
      return '/schedulePic/sanhok.jpg';
    case 'rondo':
      return '/schedulePic/rondo1.avif';
    case 'bermuda':
      return 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1761360885/bermuda_axt2w0.jpg';
    case 'alpine':
      return 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1761361515/alpine_wfchbf.jpg';
    case 'nexterra':
      return 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1761361420/nexterra_v0ivox.jpg';
    case 'purgatory':
      return 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1761361420/purgatory1_frijhy.jpg';
    case 'kalahari':
      return 'https://res.cloudinary.com/dqckienxj/image/upload/f_auto,q_auto/v1761361420/kalahari_jrhc4o.jpg';
    default:
      return null;
  }
};

const matchNumber = (m: Match) => m.matchNo || m._matchNo;

// Module level on purpose: defined inside the view, every data update would
// remount the cards and replay their entrance animations.
const MatchCard: React.FC<MatchCardProps> = ({ match, index, primary, secondary }) => {
  const winner = useMemo(() => computeMatchStandings({ teams: match.teams }).find((t) => t.wwcd), [match.teams]);

  const accent = `linear-gradient(120deg, ${primary}, ${secondary})`;
  const mapImage = getMapImage(match.map);
  const mapName = match.map?.toUpperCase() || 'NO MAP';
  const title = `MATCH ${matchNumber(match) || index + 1}`;

  return (
    <motion.div
      className="relative flex-none overflow-hidden rounded-[10px] text-white"
      style={{ width: CARD_W, height: CARD_H, background: '#0b0d12' }}
      initial={{ opacity: 0, y: 28, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.45, ease: 'easeOut' }}
    >
      {mapImage ? (
        <img
          src={mapImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: winner ? 0.3 : 1 }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${primary}, #0b0d12 75%)` }} />
      )}

      {winner ? (
        <>
          <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(11,13,18,0.2), rgba(11,13,18,0.85))' }} />

          {/* Match bar */}
          <div
            className="absolute top-0 left-0 right-0 h-[52px] px-[18px] flex items-center justify-between font-bebas"
            style={{ background: 'rgba(11,13,18,0.88)' }}
          >
            <span className="text-[36px] leading-none">{title}</span>
            <span className="text-[21px] leading-none font-[Righteous] text-white/75">{mapName}</span>
          </div>

          {/* Winner logo */}
          <div
            className="absolute left-0 bottom-0 top-[52px] w-[222px] flex items-center pl-[16px]"
            style={{ background: accent, clipPath: 'polygon(0 0, 100% 0, 84% 100%, 0 100%)' }}
          >
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: index * 0.08 + 0.25, type: 'spring', stiffness: 220, damping: 15 }}
            >
              <TeamLogo
                logo={winner.teamLogo}
                flag={winner.teamFlag}
                fallback="/def_logo.png"
                alt={winner.teamTag}
                className="w-[164px] h-[164px] object-contain"
              />
            </motion.div>
          </div>

          {/* Winner details */}
          <div className="absolute left-[222px] right-[18px] top-[52px] bottom-0 flex flex-col justify-center items-end text-right">
            <div className="flex items-center gap-[6px] text-[24px] leading-none font-[Righteous]">
              <img src="/theme4assets/chickenWhite.png" alt="" className="w-[30px] h-[30px] object-contain" />
              WWCD
            </div>
            <div className="w-full mt-[6px] text-[48px] leading-none font-bebas truncate">{winner.teamTag || winner.teamName}</div>
            <div className="mt-[6px] font-bebas leading-none">
              <span className="text-[84px]">{winner.total}</span>
              <span className="text-[34px] ml-[8px]">PTS</span>
            </div>
            <div className="mt-[4px] text-[21px] leading-none font-[Righteous] text-white/75">
              {winner.totalKills} KILLS · {Number(winner.placePoints) || 0} PLACE
            </div>
          </div>

          {/* One pass of light when the card lands */}
          <motion.div
            className="absolute top-0 bottom-0 w-[110px] pointer-events-none"
            style={{ left: -160, skewX: -18, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)' }}
            initial={{ x: 0 }}
            animate={{ x: CARD_W + 320 }}
            transition={{ delay: index * 0.08 + 0.5, duration: 0.9, ease: 'easeInOut' }}
          />
        </>
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to top, rgba(11,13,18,0.95), rgba(11,13,18,0.1) 65%)' }}
          />
          {match.time && (
            <div
              className="absolute top-[16px] right-[16px] px-[14px] py-[6px] rounded-[6px] text-[24px] leading-none font-[Righteous]"
              style={{ background: 'rgba(11,13,18,0.82)' }}
            >
              {match.time.toUpperCase()}
            </div>
          )}
          <div className="absolute left-[22px] right-[22px] bottom-[20px]">
            <div className="text-[72px] leading-none font-bebas">{title}</div>
            <div className="text-[28px] leading-none font-[Righteous] text-white/80">{mapName}</div>
          </div>
          <div className="absolute left-0 right-0 bottom-0 h-[5px]" style={{ background: accent }} />
        </>
      )}
    </motion.div>
  );
};

const HighlightSchedule: React.FC<ScheduleProps> = ({ tournament, round, matches: propMatches, matchDatas: propMatchDatas, selectedScheduleMatches }) => {
  const sortedMatches = useMemo<Match[]>(() => {
    if (!propMatches) return [];

    // matchDatas leaves out matches with no data, so its positions don't line
    // up with `matches`: pair by id. Position is only for entries without one.
    const datas = propMatchDatas || [];
    const dataById = new Map(datas.filter((d) => d?.matchId != null).map((d) => [String(d.matchId), d]));
    const merged = propMatches.map((match, idx) => {
      const positional = datas[idx]?.matchId == null ? datas[idx] : undefined;
      return { ...match, teams: (dataById.get(String(match._id)) ?? positional)?.teams || [] };
    });

    const selected = selectedScheduleMatches?.length
      ? merged.filter((m) => selectedScheduleMatches.includes(m._id))
      : merged;

    const dedupeKey = (m: Match) => matchNumber(m) || m._id;
    return selected
      .filter((m, i, all) => i === all.findIndex((o) => dedupeKey(o) === dedupeKey(m)))
      .sort((a, b) => (matchNumber(a) || 0) - (matchNumber(b) || 0));
  }, [propMatches, propMatchDatas, selectedScheduleMatches]);

  if (!round) {
    return (
      <div className="w-[1920px] h-[1080px] text-white flex items-center justify-center">No round selected</div>
    );
  }

  const primary = tournament.primaryColor || '#000';
  const secondary = tournament.secondaryColor || '#333';

  // One straight line. Past three boxes the row is wider than the canvas, so
  // it shrinks as a whole to keep every match on screen.
  const rowWidth = sortedMatches.length * CARD_W + Math.max(sortedMatches.length - 1, 0) * GAP;
  const scale = Math.min(1, (STAGE_W - EDGE * 2) / Math.max(rowWidth, 1));

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden flex items-center justify-center">
      <div className="flex flex-none" style={{ width: rowWidth, gap: GAP, transform: `scale(${scale})` }}>
        {sortedMatches.map((match, index) => (
          <MatchCard key={match._id} match={match} index={index} primary={primary} secondary={secondary} />
        ))}
      </div>

      {sortedMatches.length === 0 && (
        <div className="text-white font-[Righteous] text-[32px]">No matches scheduled</div>
      )}
    </div>
  );
};

export default HighlightSchedule;
