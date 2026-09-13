import React, { useMemo } from 'react';
import { pickStandingTeam } from '../../shared/hooks/officialStandings';
import {
  Frame,
  Surface,
  Bracket,
  Rail,
  Label,
  ValueNum,
  Shutter,
  brand,
  slug,
  GOLD,
  SCRIM,
  HAIRLINE,
  TEXT,
  TEXT_DIM,
  FONT_DISPLAY,
  FONT_LABEL,
  FONT_MONO,
} from '../shell';

/* THEME8 · "DATUM" — Champions.
   Placement preserved: full-frame podium scene (header top-left, portrait row
   upper, identity band mid, stat strip lower).
   Data preserved: pickStandingTeam(matchDatas, overallData, 0); champion
   teamLogo / teamName / wwcd / placePoints / totalKills / total / players[0..3];
   /chicken.png; the same empty-data guard.
   Shell: registration Frame + chamfered Surfaces + corner Brackets + ticked
   Rail + ledger stat strip. Gold survives ONLY as the winner marker. */

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
  day?: string;
}

interface Player {
  _id: string;
  playerName: string;
  killNum?: number;
  picUrl?: string;
}

interface Team {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo: string;
  slot: number;
  placePoints: number;
  wwcd?: number;
  players: Player[];
}

interface OverallData {
  tournamentId: string;
  roundId: string;
  userId: string;
  teams: Team[];
  createdAt: string;
}

interface MatchData {
  _id: string;
  teams: Team[];
}

interface ChampionsProps {
  tournament: Tournament;
  round?: Round | null;
  overallData?: OverallData | null;
  // PublicThemeRenderer also passes matchData for the 'Champions' view, but
  // this component's champion-derivation only needs the event-wide
  // overallData — accepted here for interface completeness.
  matchData?: any;
  matchDatas?: MatchData[];
}

const DEF_PLAYER =
  'https://res.cloudinary.com/dqckienxj/image/upload/v1735718663/defult_chach_apsjhc_jydubc.png';

const Champions: React.FC<ChampionsProps> = ({ tournament, round, overallData, matchDatas = [] }) => {
  // Shared standings pick (Total Score primary, not the old WWCD-first
  // bug). row 0 = champion; carries total / totalKills / placePoints /
  // wwcd / leadOverNext plus the re-attached roster.
  const champion = useMemo(
    () => pickStandingTeam(matchDatas as any, overallData as any, 0),
    [overallData, matchDatas]
  );

  const { primary } = brand(tournament.primaryColor, tournament.secondaryColor);

  if (!overallData || !champion) {
    return (
      <div className="w-[1920px] h-[1080px] flex items-center justify-center">
        <div style={{ fontFamily: FONT_LABEL, fontSize: 22, letterSpacing: '0.24em', color: TEXT_DIM }}>
          NO OVERALL DATA
        </div>
      </div>
    );
  }

  const players = champion.players.slice(0, 4);

  const stats: Array<{ k: string; v: React.ReactNode; kills?: boolean; gold?: boolean }> = [
    {
      k: 'WWCD',
      v: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <img src="/chicken.png" alt="" style={{ width: 46, height: 46, objectFit: 'contain' }} />
          {champion.wwcd || 0}
        </span>
      ),
    },
    { k: 'PLACE', v: champion.placePoints || 0 },
    { k: 'KILLS', v: champion.totalKills || 0, kills: true },
    { k: 'TOTAL', v: champion.total || 0, gold: true },
  ];

  return (
    <Frame accent={primary} slug={slug(tournament, round)} style={{ color: '#fff' }}>
      {/* header — CHAMPIONS is the winner marker, so it carries the gold */}
      <div style={{ position: 'absolute', left: 80, top: 72 }}>
        <Label glyph="/" size={20} color={GOLD} accent={GOLD}>
          CHAMPIONS
        </Label>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 13,
            letterSpacing: '0.2em',
            color: TEXT_DIM,
            marginTop: 12,
          }}
        >
          {`OF ${(tournament.tournamentName || '').toUpperCase()}  —  ${(round?.roundName || '').toUpperCase()}`}
        </div>
        <Rail dir="h" length={560} gap={20} activeIndex={0} accent={GOLD} style={{ marginTop: 14 }} />
      </div>

      {/* portrait row — upper frame */}
      <div style={{ position: 'absolute', left: 80, top: 156, width: 1760, height: 520, display: 'flex', gap: 16 }}>
        {players.map((p) => (
          <Bracket
            key={p._id}
            edge="bottom"
            accent={primary}
            corners={['tl', 'br']}
            style={{ flex: 1, minWidth: 0, overflow: 'hidden', background: SCRIM }}
          >
            <img
              src={p.picUrl || DEF_PLAYER}
              alt={p.playerName}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                padding: '28px 14px 12px',
                background: 'linear-gradient(to top, rgba(0,0,0,0.92), transparent)',
              }}
            >
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 32,
                  lineHeight: 1,
                  color: TEXT,
                  letterSpacing: '0.03em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {p.playerName}
              </div>
            </div>
          </Bracket>
        ))}
      </div>

      {/* champion identity band — gold winner edge */}
      <Shutter axis="x" style={{ position: 'absolute', left: 80, top: 700, width: 1040, height: 170 }}>
        <Surface
          tone="solid"
          gold
          edge="left"
          accent={tournament.primaryColor}
          accentSecondary={tournament.secondaryColor}
          style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}
        >
          <div
            style={{
              width: 180,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              borderRight: `1px solid ${HAIRLINE}`,
            }}
          >
            <img
              src={champion.teamLogo || '/def_logo.png'}
              alt=""
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </div>
          <div style={{ padding: '0 34px', minWidth: 0 }}>
            <Label glyph="[" size={13} color={GOLD} accent={GOLD}>
              CHAMPION
            </Label>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 92,
                lineHeight: 1,
                color: TEXT,
                marginTop: 8,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {champion.teamName}
            </div>
          </div>
        </Surface>
      </Shutter>

      {/* stat strip — DATUM ledger */}
      <Shutter axis="x" style={{ position: 'absolute', left: 80, top: 900, width: 1760, height: 130 }}>
        <Surface
          tone="solid"
          edge="left"
          accent={tournament.primaryColor}
          accentSecondary={tournament.secondaryColor}
          style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'stretch' }}
        >
          {stats.map((c, i) => (
            <div
              key={c.k}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 10,
                padding: '0 34px',
                borderLeft: i ? `1px solid ${HAIRLINE}` : 'none',
              }}
            >
              <Label glyph="/" size={12} color={TEXT_DIM} accent={c.gold ? GOLD : primary}>
                {c.k}
              </Label>
              <ValueNum
                value={c.v}
                size={54}
                accent={c.kills}
                style={c.gold ? { color: GOLD } : undefined}
              />
            </div>
          ))}
        </Surface>
      </Shutter>
    </Frame>
  );
};

export default Champions;
