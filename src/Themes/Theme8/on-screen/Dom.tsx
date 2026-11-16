import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MatchData, Player } from '../../shared/hooks/unsortteams';
import { useKillMilestones, MilestoneType } from '../../shared/hooks/killMilestones';
import StolenFromStrip from '../../shared/overlays/StolenFromStrip';
import { TeamLogo } from '../../shared/components/TeamLogo';
import { playerPhoto } from '../../shared/playerPhoto.ts';
// NOTE: PublicThemeRenderer owns the single socket connection and passes
// freshly-merged `matchData` down as a prop. Milestone DETECTION (first
// blood, kill streaks, grenade / vehicle / damage / airdrop) is the shared
// useKillMilestones hook — this file only maps the milestone type to its
// label + icon and renders its own card.
//
// THEME8 "WHITE LABEL" milestone card — portrait (340 × 460), left edge:
//   ┌ theme-colour photo panel, big faint milestone icon, player photo
//   ├ ink badge: icon tile + milestone label
//   └ white info: player name, team logo + tag
// Motion (same family as Alerts), all wipes left → right:
//   1) white plate with the tournament logo  2) theme-colour panel
//   3) the card — photo rises, badge / name / team slide in.
// Exit runs the same three wipes in reverse (card → theme → logo plate).
//
// PREVIEW: a "Preview milestone" button sits just OUTSIDE the 1920×1080
// canvas (x ≥ 1940). Each click shows the next milestone type with dummy
// data, so every icon/label can be checked in place. Works without match data.

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

interface DomProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

type Shown = {
  key: number;
  type: MilestoneType;
  playerName: string;
  picUrl?: string;
  teamTag: string;
  teamLogo?: string;
  teamFlag?: string;
  demo?: boolean;
};

const DISPLAY_MS = 6000; // time fully on screen (after the intro)
const WIPE_MS = 650; // each wipe (slower, deliberate)
// intro timeline (ms from trigger)
const T_LOGO = 40; //   1) white plate + tournament logo
const T_THEME = 1250; // 2) theme-colour panel
const T_CARD = 1900; //  3) the milestone card
// outro offsets (ms after the card starts to close)
const O_THEME = 600; //  theme panel closes
const O_LOGO = 1450; //  logo plate closes (logo holds for a beat first)
const O_DONE = O_LOGO + WIPE_MS + 80;

// This theme's label for each shared milestone type.
const LABELS: Record<MilestoneType, string> = {
  firstBlood: 'FIRST BLOOD',
  streak3: 'DOMINATION',
  streak5: 'RAMPAGE',
  streak8: 'UNSTOPPABLE',
  grenadeKill: 'GRENADE KILL',
  vehicleKill: 'VEHICLE KILL',
  damage: '500+ DAMAGE',
  airdrop: 'AIRDROP LOOTED',
  distanceKill: '300m KILL',
  killSteal: 'KILL STOLEN',
};

/* ── palette + type (shared with Lower third / Live Stats / Alerts) ── */
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

/* ── geometry ── */
const CARD_LEFT = 0;
const CARD_TOP = 300;
const CARD_W = 340;
const PHOTO_H = 300;
const BADGE_H = 64;
const INFO_H = 150;
const CARD_H = PHOTO_H + BADGE_H + INFO_H; // 514
const CORNER = 30; // top-right chamfer
const EDGE_SKEW = 'skewX(-8deg)';

function toRgb(hex: string): [number, number, number] {
  let h = (hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function inkOn(hex: string): string {
  const L = toRgb(hex)
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
  return L > 0.45 ? INK : WHITE;
}
const alpha = (hex: string, a: number) => {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/* ─────────────────────────────────────────────
   Milestone icons — flat, 24×24, drawn in currentColor
   ───────────────────────────────────────────── */
const Chevrons = ({ n }: { n: number }) => (
  <g>
    {Array.from({ length: n }).map((_, i) => {
      const y = 15 - i * 5 + (n - 1) * 2.5;
      return <path key={i} d={`M4 ${y + 4} L12 ${y - 2} L20 ${y + 4} L20 ${y + 7.5} L12 ${y + 1.5} L4 ${y + 7.5} Z`} />;
    })}
  </g>
);

const ICONS: Record<MilestoneType, React.ReactNode> = {
  // blood drop
  firstBlood: (
    <g>
      <path d="M12 2 C12 2 4.5 10.5 4.5 15 A7.5 7.5 0 0 0 19.5 15 C19.5 10.5 12 2 12 2 Z" />
      <path d="M9 14.5 A3.2 3.2 0 0 0 11 18" fill="none" stroke={INK} strokeOpacity={0.35} strokeWidth={1.6} strokeLinecap="round" />
    </g>
  ),
  // rank chevrons — 1 / 2 / 3 for the three streak tiers
  streak3: <Chevrons n={1} />,
  streak5: <Chevrons n={2} />,
  streak8: <Chevrons n={3} />,
  // frag grenade
  grenadeKill: (
    <g>
      <rect x="9" y="4.5" width="6" height="4" />
      <path d="M15 5 L19 3 L20 5 L15.5 7.5 Z" />
      <circle cx="7.5" cy="5" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8 C7.2 8 5 11.5 5 15 C5 19 8.2 22 12 22 C15.8 22 19 19 19 15 C19 11.5 16.8 8 12 8 Z" />
      <path d="M8 12.5 H16 M8 16.5 H16 M12 9.5 V21" stroke={INK} strokeOpacity={0.3} strokeWidth={1.2} />
    </g>
  ),
  // car
  vehicleKill: (
    <g>
      <path d="M5 11 L7.3 6.2 C7.6 5.5 8.3 5 9.1 5 H14.9 C15.7 5 16.4 5.5 16.7 6.2 L19 11 H20.5 C21.3 11 22 11.7 22 12.5 V17 H2 V12.5 C2 11.7 2.7 11 3.5 11 Z" />
      <path d="M7.4 10.6 L8.9 7 H15.1 L16.6 10.6 Z" fill={INK} fillOpacity={0.35} />
      <circle cx="6.5" cy="17.5" r="2.4" />
      <circle cx="17.5" cy="17.5" r="2.4" />
    </g>
  ),
  // impact burst
  damage: (
    <polygon points="12,1.5 14.2,8 20.8,4.6 17.2,10.6 23,12.8 16.8,14.6 19.6,21 13.6,17.4 12,23 10.2,17.4 4.4,21 7.2,14.6 1,12.8 6.8,10.6 3.2,4.6 9.8,8" />
  ),
  // parachute + crate
  airdrop: (
    <g>
      <path d="M2.5 9 C2.5 4.5 6.8 2 12 2 C17.2 2 21.5 4.5 21.5 9 C19.8 7.8 18.2 7.8 16.8 9 C15.4 7.8 13.6 7.8 12 9 C10.4 7.8 8.6 7.8 7.2 9 C5.8 7.8 4.2 7.8 2.5 9 Z" />
      <path d="M3 9.2 L9 15 M21 9.2 L15 15 M12 9 V15" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <rect x="8" y="14.5" width="8" height="7.5" />
      <path d="M8 18.2 H16 M12 14.5 V22" stroke={INK} strokeOpacity={0.35} strokeWidth={1.2} />
    </g>
  ),
  // scope reticle
  distanceKill: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 1.5 V7 M12 17 V22.5 M1.5 12 H7 M17 12 H22.5" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </g>
  ),
  // thief's eye mask — the kill was stolen
  killSteal: (
    <g>
      <path
        fillRule="evenodd"
        d="M1.5 9.5 C1.5 6.8 3.6 5.6 5.8 6.2 C8 6.8 9.8 7.6 12 7.6 C14.2 7.6 16 6.8 18.2 6.2 C20.4 5.6 22.5 6.8 22.5 9.5 C22.5 13.6 20.2 17.2 16.8 17.2 C14.7 17.2 13.3 15.6 12 14 C10.7 15.6 9.3 17.2 7.2 17.2 C3.8 17.2 1.5 13.6 1.5 9.5 Z
           M4.6 11.2 C4.6 10 5.9 9.3 7.4 9.3 C8.9 9.3 10 10.1 10 11.2 C10 12.3 8.9 13 7.4 13 C5.9 13 4.6 12.4 4.6 11.2 Z
           M14 11.2 C14 10.1 15.1 9.3 16.6 9.3 C18.1 9.3 19.4 10 19.4 11.2 C19.4 12.4 18.1 13 16.6 13 C15.1 13 14 12.3 14 11.2 Z"
      />
      <path d="M1.8 8.4 L0 6.6 L0.4 9.6 Z M22.2 8.4 L24 6.6 L23.6 9.6 Z" />
    </g>
  ),
};

const MilestoneIcon = ({ type, size, color }: { type: MilestoneType; size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ color, display: 'block' }} aria-hidden>
    {ICONS[type]}
  </svg>
);

const KEYFRAMES = `
@keyframes dm8Rise  { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes dm8SlideL{ from { transform: translateX(-26px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes dm8Pop   { 0% { transform: scale(.4) rotate(-12deg); opacity: 0; } 70% { transform: scale(1.12); opacity: 1; } 100% { transform: none; } }
@keyframes dm8Mark  { from { transform: scale(1.25); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes dm8Edge  { 0%, 85% { opacity: 1; } 100% { opacity: 0; } }
.dm8-tlogo { animation: dm8Pop .6s cubic-bezier(.34,1.56,.64,1) .35s both; }
.dm8-photo { animation: dm8Rise .7s cubic-bezier(.2,.8,.2,1) .2s both; }
.dm8-mark  { animation: dm8Mark .7s cubic-bezier(.2,.8,.2,1) .05s both; }
.dm8-icon  { animation: dm8Pop .5s cubic-bezier(.34,1.56,.64,1) .4s both; }
.dm8-label { animation: dm8SlideL .5s cubic-bezier(.2,.8,.2,1) .45s both; }
.dm8-name  { animation: dm8SlideL .5s cubic-bezier(.2,.8,.2,1) .6s both; }
.dm8-team  { animation: dm8SlideL .5s cubic-bezier(.2,.8,.2,1) .75s both; }
@media (prefers-reduced-motion: reduce) {
  .dm8-tlogo, .dm8-photo, .dm8-mark, .dm8-icon, .dm8-label, .dm8-name, .dm8-team { animation: none; }
}
`;

/* ─────────────────────────────────────────────
   The card content
   ───────────────────────────────────────────── */
const MilestoneCard: React.FC<{ data: Shown; primary: string; secondary: string }> = ({ data, primary, secondary }) => {
  const label = LABELS[data.type];
  const onPrimary = inkOn(primary);
  const name = (data.playerName || '').toUpperCase();
  const nameSize = name.length <= 10 ? 52 : name.length <= 14 ? 42 : 34;
  const labelSize = label.length <= 11 ? 38 : 32;

  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: FONT, fontWeight: 700, lineHeight: 1 }}>
      {/* ── photo panel ── */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: CARD_W, height: PHOTO_H, background: primary, overflow: 'hidden' }}>
        {/* secondary block, angled, behind the player */}
        <div
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 170,
            height: 210,
            background: secondary,
            clipPath: 'polygon(55% 0, 100% 0, 100% 100%, 0 100%)',
            opacity: 0.9,
          }}
        />
        {/* thin ink stripes, top-left */}
        <div
          style={{
            position: 'absolute',
            left: 18,
            top: 18,
            width: 70,
            height: 10,
            background: `repeating-linear-gradient(-60deg, ${alpha(onPrimary === WHITE ? '#ffffff' : INK, 0.5)} 0 3px, transparent 3px 8px)`,
          }}
        />
        {/* faint milestone mark — tucked into the top-right, inside a corner bracket */}
        <div style={{ position: 'absolute', right: CORNER + 6, top: 22, width: 92, height: 92 }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderTop: `2px solid ${alpha(onPrimary === WHITE ? '#ffffff' : INK, 0.35)}`,
              borderRight: `2px solid ${alpha(onPrimary === WHITE ? '#ffffff' : INK, 0.35)}`,
            }}
          />
          <div style={{ position: 'absolute', inset: 12, opacity: 0.28 }}>
            <div className="dm8-mark">
              <MilestoneIcon type={data.type} size={68} color={onPrimary} />
            </div>
          </div>
        </div>
        {/* player photo — bottom-centred */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
          <img
            className="dm8-photo"
            src={playerPhoto(data.picUrl) || '/def_char.png'}
            alt={data.playerName}
            style={{
              display: 'block',
              height: PHOTO_H - 14,
              width: 'auto',
              maxWidth: CARD_W + 40,
              objectFit: 'contain',
              objectPosition: 'bottom center',
              filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.35))',
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/def_char.png';
            }}
          />
        </div>
      </div>

      {/* ── milestone badge ── */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: PHOTO_H,
          width: CARD_W,
          height: BADGE_H,
          background: INK,
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            width: BADGE_H + 6,
            flex: 'none',
            background: primary,
            clipPath: 'polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingRight: 6,
          }}
        >
          <div className="dm8-icon">
            <MilestoneIcon type={data.type} size={38} color={onPrimary} />
          </div>
        </div>
        <div
          className="dm8-label"
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 16,
            fontSize: labelSize,
            letterSpacing: '0.06em',
            color: WHITE,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {label}
        </div>
        {/* secondary tick at the badge's right end */}
        <div style={{ width: 8, flex: 'none', background: secondary }} />
      </div>

      {/* ── info: name + team ── */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: PHOTO_H + BADGE_H,
          width: CARD_W,
          height: INFO_H,
          background: WHITE,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 22px 8px 26px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: primary }} />
        <div
          className="dm8-name"
          style={{
            fontSize: nameSize,
            color: INK,
            letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>
        {/* team bar — ink, white logo tile, white tag, angled end */}
        <div
          className="dm8-team"
          style={{
            display: 'flex',
            alignItems: 'center',
            alignSelf: 'flex-start',
            maxWidth: '100%',
            height: 50,
            marginTop: 14,
            background: INK,
            clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
            paddingRight: 30,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              flex: 'none',
              background: WHITE,
              boxShadow: `inset 0 0 0 3px ${INK}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 7,
              boxSizing: 'border-box',
            }}
          >
            <TeamLogo
              logo={data.teamLogo}
              flag={data.teamFlag}
              fallback={'/def_logo.png'}
              alt=""
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </div>
          <span style={{ width: 4, height: 50, background: primary, flex: 'none' }} />
          <span
            style={{
              paddingLeft: 14,
              fontSize: 34,
              letterSpacing: '0.1em',
              color: WHITE,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {(data.teamTag || '').toUpperCase()}
          </span>
        </div>
        {/* secondary base strip */}
        <div style={{ position: 'absolute', left: 8, right: 0, bottom: 0, height: 5, background: secondary }} />
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Wipe layer — width grows/shrinks from the left; leading edge rides along
   ───────────────────────────────────────────── */
const WipeLayer: React.FC<{ open: boolean; edge: string; children: React.ReactNode }> = ({ open, edge, children }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      height: '100%',
      width: open ? '100%' : '0%',
      overflow: 'hidden',
      transition: `width ${WIPE_MS}ms cubic-bezier(.65,0,.25,1)`,
    }}
  >
    <div style={{ position: 'absolute', left: 0, top: 0, width: CARD_W, height: CARD_H }}>{children}</div>
    {/* leading edge — visible only while the wipe is moving (replays on each open/close) */}
    <div
      key={open ? 'in' : 'out'}
      style={{
        position: 'absolute',
        right: 0,
        top: -20,
        bottom: -20,
        width: 12,
        background: edge,
        transform: EDGE_SKEW,
        opacity: 0,
        animation: `dm8Edge ${WIPE_MS}ms linear`,
      }}
    />
  </div>
);

/* ─────────────────────────────────────────────
   Demo data for the preview button
   ───────────────────────────────────────────── */
const DEMO_ORDER: MilestoneType[] = [
  'streak3',
  'firstBlood',
  'streak5',
  'streak8',
  'grenadeKill',
  'vehicleKill',
  'damage',
  'airdrop',
  'distanceKill',
  'killSteal',
];
const DEMO_PLAYER = { playerName: 'VIPER', picUrl: '', teamTag: 'DMY', teamLogo: '/def_logo.png' };

/* ─────────────────────────────────────────────
   Dom
   ───────────────────────────────────────────── */
const Dom: React.FC<DomProps> = React.memo(({ tournament, match, matchData }) => {
  const [shown, setShown] = useState<Shown | null>(null);
  const [o1, setO1] = useState(false); // white plate + tournament logo
  const [o2, setO2] = useState(false); // theme panel
  const [o3, setO3] = useState(false); // card
  const [cardOn, setCardOn] = useState(false); // card content mounted (from its wipe-in until unmount)
  const timersRef = useRef<number[]>([]);
  const keyRef = useRef(0);
  const demoIdxRef = useRef(0);

  const clearTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };
  const later = (fn: () => void, ms: number) => timersRef.current.push(window.setTimeout(fn, ms));

  const showAlert = useCallback((data: Omit<Shown, 'key'>) => {
    clearTimers();
    keyRef.current += 1;
    setO1(false);
    setO2(false);
    setO3(false);
    setCardOn(false);
    setShown({ ...data, key: keyRef.current });
    // in: logo plate → theme → card
    later(() => setO1(true), T_LOGO);
    later(() => setO2(true), T_THEME);
    later(() => {
      setCardOn(true);
      setO3(true);
    }, T_CARD);
    // out: card → theme → logo plate → unmount
    const outAt = T_CARD + WIPE_MS + DISPLAY_MS;
    later(() => setO3(false), outAt);
    later(() => setO2(false), outAt + O_THEME);
    later(() => setO1(false), outAt + O_LOGO);
    later(() => setShown(null), outAt + O_DONE);
  }, []);

  useEffect(() => () => clearTimers(), []);

  // Shared milestone detection (first blood, 3/5/8 streaks, grenade,
  // vehicle, 500+ damage, airdrop). Resets its trackers on match switch.
  const milestone = useKillMilestones(matchData, match, { damageThreshold: 500 });

  useEffect(() => {
    if (!milestone) return;
    const p = milestone.player as Player & { playerName?: string; picUrl?: string };
    showAlert({
      type: milestone.type,
      playerName: p.playerName || '',
      picUrl: p.picUrl,
      teamTag: milestone.teamTag,
      teamLogo: milestone.teamLogo,
      teamFlag: milestone.teamFlag,
    });
  }, [milestone, showAlert]);

  const triggerDemo = useCallback(() => {
    const type = DEMO_ORDER[demoIdxRef.current % DEMO_ORDER.length];
    demoIdxRef.current += 1;
    showAlert({ ...DEMO_PLAYER, type, demo: true });
  }, [showAlert]);

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'visible' }}>
      <style>{KEYFRAMES}</style>

      {/* KILL STOLEN: who made the knock (renders only for that event) */}
      {matchData && !shown?.demo && (
        <StolenFromStrip
          event={milestone}
          visible={o3}
          top={CARD_TOP + CARD_H + 8}
          left={0}
          width={CARD_W}
          primary={tournament.primaryColor}
          secondary={tournament.secondaryColor}
        />
      )}

      {shown && (
        <div
          key={shown.key}
          style={{
            position: 'absolute',
            left: CARD_LEFT,
            top: CARD_TOP,
            width: CARD_W,
            height: CARD_H,
            clipPath: `polygon(0 0, calc(100% - ${CORNER}px) 0, 100% ${CORNER}px, 100% 100%, 0 100%)`,
            pointerEvents: 'none',
          }}
        >
          {/* step 1 — white plate with the tournament logo */}
          <WipeLayer open={o1} edge={INK}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: WHITE,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: primary }} />
              <img
                className="dm8-tlogo"
                src={tournament.torLogo || '/def_logo.png'}
                alt=""
                style={{ maxWidth: 240, maxHeight: 220, objectFit: 'contain', display: 'block' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/def_logo.png';
                }}
              />
            </div>
          </WipeLayer>
          {/* step 2 — full theme colour */}
          <WipeLayer open={o2} edge={secondary}>
            <div style={{ position: 'absolute', inset: 0, background: primary }} />
          </WipeLayer>
          {/* step 3 — the card */}
          <WipeLayer open={o3} edge={INK}>
            {cardOn && <MilestoneCard data={shown} primary={primary} secondary={secondary} />}
          </WipeLayer>
        </div>
      )}

      {/* ── preview control — outside the 1920×1080 canvas ── */}
      <button
        type="button"
        onClick={triggerDemo}
        style={{
          position: 'absolute',
          left: 1940,
          top: 76,
          padding: '10px 16px',
          background: INK,
          color: WHITE,
          border: `2px solid ${primary}`,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: '0.1em',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          pointerEvents: 'auto',
        }}
      >
        ▶ PREVIEW MILESTONE
      </button>
    </div>
  );
});

export default Dom;