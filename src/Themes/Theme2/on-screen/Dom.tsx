import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MatchData, Player } from '../../shared/hooks/unsortteams';
import { useKillMilestones, MilestoneType } from '../../shared/hooks/killMilestones';
import { TeamLogo } from '../../shared/components/TeamLogo';
// NOTE: no socket here — PublicThemeRenderer owns the single connection and
// passes freshly-merged `matchData` down on every 'bulkUpdate'.
// Player / MatchData come from the shared hook module (Player has a
// `[key: string]: any` fallback, so extra fields like killNum still work).

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

const DISPLAY_MS = 6000;
const EXIT_ANIM_MS = 500; // keep in sync with .dom-card transition duration below

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
};

/* ------------------------------------------------------------------ */
/* Visual language (shared with LiveStats / Champions / OverAllData)   */
/* ------------------------------------------------------------------ */
const INK = '#0d0f13';
const DEFAULT_CHAR = '/def_char.png';
const FACE_ZOOM = 1.3;

const CUT_PHOTO = 'polygon(0 0, 100% 0, calc(100% - 34px) 100%, 0 100%)';
const CUT_BODY = 'polygon(34px 0, 100% 0, calc(100% - 34px) 100%, 0 100%)';
const CUT_BOLT = 'polygon(0 0, 100% 0, 84% 46%, 96% 46%, 78% 100%, 0 100%)';
const CUT_CHIP = 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)';

const withAlpha = (color: string, alpha: number) => {
  const hex = color.trim().replace('#', '');
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.length === 6 ? hex : null;
  if (!full || /[^0-9a-f]/i.test(full)) return color;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const Bolt: React.FC<{ size?: number; color: string }> = ({ size = 20, color }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 20 28" aria-hidden>
    <path d="M13 0 L2 16 H9 L6 28 L18 10 H11 L15 0 Z" fill={color} />
  </svg>
);

const onPicError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  if (!img.src.endsWith(DEFAULT_CHAR)) img.src = DEFAULT_CHAR;
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const Dom: React.FC<DomProps> = React.memo(({ tournament, match, matchData }) => {
  const [isVisible, setIsVisible] = useState(false); // drives CSS transition
  const [displayedPlayer, setDisplayedPlayer] = useState<
    (Player & { teamTag: string; teamLogo: string; teamFlag?: string; milestone: string }) | null
  >(null);

  const displayTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  const showAlert = useCallback((alertData: any) => {
    setDisplayedPlayer(alertData);
    if (displayTimerRef.current) clearTimeout(displayTimerRef.current);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);

    // Flip to visible next frame so the CSS transition (and the entrance
    // effects keyed off .dom-visible) actually play.
    setIsVisible(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setIsVisible(true)));

    displayTimerRef.current = window.setTimeout(() => {
      setIsVisible(false);
      exitTimerRef.current = window.setTimeout(() => {
        setDisplayedPlayer(null);
        displayTimerRef.current = null;
        exitTimerRef.current = null;
      }, EXIT_ANIM_MS);
    }, DISPLAY_MS);
  }, []);

  useEffect(
    () => () => {
      if (displayTimerRef.current) clearTimeout(displayTimerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    },
    []
  );

  // Shared milestone detection — resets its trackers on match switch.
  const milestone = useKillMilestones(matchData, match, { damageThreshold: 500 });

  useEffect(() => {
    if (!milestone) return;
    showAlert({
      ...milestone.player,
      teamTag: milestone.teamTag,
      teamLogo: milestone.teamLogo,
      teamFlag: milestone.teamFlag,
      milestone: LABELS[milestone.type],
    });
  }, [milestone, showAlert]);

  if (!matchData) return null;
  if (!displayedPlayer) return null;

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || '#111318';
  const themeGrad = `linear-gradient(120deg, ${primary} 0%, ${secondary} 100%)`;
  const kills = Number(displayedPlayer.killNum) || 0;
  const titleLen = String(displayedPlayer.milestone || '').length;

  return (
    <div className="w-[1920px] h-[1080px] relative overflow-hidden pointer-events-none">
      <style>{`
        .dom-card {
          transition: transform 0.5s cubic-bezier(0.22,1,0.36,1),
                      opacity 0.5s cubic-bezier(0.22,1,0.36,1);
        }
        .dom-card.dom-hidden  { transform: translateX(-720px) skewX(-8deg); opacity: 0; }
        .dom-card.dom-visible { transform: translateX(0) skewX(0); opacity: 1; }

        /* ── entrance effects: replay every time .dom-visible is applied ── */
        @keyframes dom-flash  { 0% { opacity: .95; } 100% { opacity: 0; } }
        @keyframes dom-strike {
          0% { opacity: 0; } 8% { opacity: 1; } 16% { opacity: .15; } 28% { opacity: 1; }
          45% { opacity: .4; } 60% { opacity: 0; } 100% { opacity: 0; }
        }
        @keyframes dom-reveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
        @keyframes dom-flicker {
          0%, 100% { opacity: 1; } 10% { opacity: .3; } 14% { opacity: 1; }
          22% { opacity: .55; } 26% { opacity: 1; }
        }
        @keyframes dom-up     { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes dom-sweep  { from { transform: translateX(-200%) skewX(-22deg); } to { transform: translateX(900%) skewX(-22deg); } }
        @keyframes dom-count  { from { transform: scaleX(1); } to { transform: scaleX(0); } }
        @keyframes dom-pop    { 0% { transform: scale(.4) rotate(-12deg); opacity: 0; } 60% { transform: scale(1.18) rotate(4deg); opacity: 1; } 100% { transform: none; opacity: 1; } }
        /* ── continuous ── */
        @keyframes dom-run    { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        @keyframes dom-glow   {
          0%, 100% { filter: drop-shadow(0 0 6px ${withAlpha(primary, 0.5)}); }
          50%      { filter: drop-shadow(0 0 18px ${withAlpha(primary, 0.95)}); }
        }

        .dom-visible .dom-flash   { animation: dom-flash .45s .18s ease-out both; }
        .dom-visible .dom-strike  { animation: dom-strike 1.3s .2s linear both; }
        .dom-visible .dom-title   { animation: dom-reveal .5s .28s cubic-bezier(.2,.9,.25,1) both, dom-flicker 1.2s .8s linear both; }
        .dom-visible .dom-sub     { animation: dom-up .45s .5s ease-out both; }
        .dom-visible .dom-sweep   { animation: dom-sweep 1.1s .7s ease-in-out both; }
        .dom-visible .dom-count   { animation: dom-count ${DISPLAY_MS}ms linear both; }
        .dom-visible .dom-pop     { animation: dom-pop .5s .35s cubic-bezier(.2,.9,.25,1) both; }
      `}</style>

      <div
        key={displayedPlayer._id}
        className={`dom-card absolute left-0 top-[330px] ${isVisible ? 'dom-visible' : 'dom-hidden'}`}
        style={{ willChange: 'transform, opacity', width: 720, height: 170 }}
      >
        <div className="relative w-full h-full" style={{ animation: 'dom-glow 2.6s ease-in-out infinite' }}>
          {/* ═══════════ PHOTO: storm panel ═══════════ */}
          <div
            className="absolute left-0 top-0 w-[214px] h-full overflow-hidden z-10"
            style={{
              clipPath: CUT_PHOTO,
              background: `radial-gradient(ellipse 80% 70% at 50% 0%, ${withAlpha(primary, 0.8)} 0%, transparent 70%),
                           linear-gradient(165deg, #06070b 0%, ${withAlpha(secondary, 0.95)} 60%, ${primary} 160%)`,
            }}
          >
            {/* lightning strike behind the player */}
            <svg className="dom-strike absolute inset-0 w-full h-full" viewBox="0 0 214 170" preserveAspectRatio="none" style={{ opacity: 0 }} aria-hidden>
              <defs>
                <filter id="dom-glow-f" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" />
                </filter>
              </defs>
              {[
                'M150 0 L132 38 L146 44 L118 92 L132 98 L104 170',
                'M132 98 L160 118 L152 126 L176 150',
                'M40 0 L56 30 L44 36 L64 74',
              ].map((d, i) => (
                <g key={i}>
                  <path d={d} fill="none" stroke={primary} strokeWidth={i === 0 ? 7 : 4} filter="url(#dom-glow-f)" />
                  <path d={d} fill="none" stroke="#fff" strokeWidth={i === 0 ? 2 : 1.2} />
                </g>
              ))}
            </svg>

            <img
              src={displayedPlayer.picUrl || DEFAULT_CHAR}
              onError={onPicError}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                objectPosition: '50% 0%',
                transform: `scale(${FACE_ZOOM})`,
                transformOrigin: '50% 0%',
                filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.55))',
              }}
            />
            <div
              className="absolute left-0 right-0 bottom-0 h-[40%]"
              style={{ background: 'linear-gradient(180deg, transparent, rgba(6,7,11,0.85))' }}
            />

            {/* kills chip on the photo */}
            {kills > 0 && (
              <div
                className="dom-pop absolute left-[10px] bottom-[10px] h-[34px] pl-[12px] pr-[18px] flex items-center gap-[6px] text-white"
                style={{ background: themeGrad, clipPath: CUT_CHIP }}
              >
                <span className="font-bebas text-[1.9rem] leading-none pt-[4px]">{kills}</span>
                <span className="font-[Righteous] text-[0.72rem] tracking-[0.16em]">KILLS</span>
              </div>
            )}

            {/* entrance flash */}
            <div className="dom-flash absolute inset-0 bg-white" style={{ opacity: 0 }} />
          </div>

          {/* ═══════════ BODY: white plate ═══════════ */}
          <div
            className="absolute left-[176px] top-[14px] w-[476px] h-[142px] overflow-hidden"
            style={{ clipPath: CUT_BODY, background: 'linear-gradient(90deg, #ffffff 0%, #eef0f3 100%)' }}
          >
            {/* theme wash + texture */}
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(90deg, ${withAlpha(primary, 0.16)} 0%, transparent 45%)` }}
            />
            <div
              className="absolute inset-0 opacity-[0.05]"
              style={{ background: 'repeating-linear-gradient(-60deg, #000 0 2px, transparent 2px 18px)' }}
            />

            <div className="relative h-full flex flex-col justify-center pl-[64px] pr-[48px]">
              {/* milestone title */}
              <div
                className="dom-title font-bebas leading-[0.9] tracking-[0.02em] whitespace-nowrap"
                style={{
                  // long labels (AIRDROP LOOTED, UNSTOPPABLE…) step down so they never overflow
                  fontSize: titleLen > 12 ? '3.5rem' : titleLen > 10 ? '4rem' : '4.6rem',
                  background: themeGrad,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {displayedPlayer.milestone}
              </div>

              {/* player + team */}
              <div className="dom-sub flex items-center gap-[10px] mt-[6px] min-w-0">
                <div
                  className="h-[38px] pl-[12px] pr-[16px] flex items-center gap-[8px] shrink-0"
                  style={{ background: INK, clipPath: CUT_CHIP }}
                >
                  <div className="w-[26px] h-[26px] flex items-center justify-center">
                    <TeamLogo
                      logo={displayedPlayer.teamLogo}
                      flag={displayedPlayer.teamFlag}
                      fallback={'/def_logo.png'}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="font-[AGENCYB] font-bold text-[1.35rem] text-white tracking-[0.06em] leading-none">
                    {displayedPlayer.teamTag?.toUpperCase()}
                  </span>
                </div>
                <span className="font-[AGENCYB] font-bold text-[2.1rem] leading-none uppercase truncate" style={{ color: INK }}>
                  {displayedPlayer.playerName}
                </span>
              </div>
            </div>

            {/* one-shot shine */}
            <div
              className="dom-sweep absolute top-0 bottom-0 w-[90px] pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
                transform: 'translateX(-200%) skewX(-22deg)',
              }}
            />

            {/* countdown bar (time left on screen) */}
            <div
              className="dom-count absolute left-[34px] right-[34px] bottom-0 h-[5px] origin-left"
              style={{ background: themeGrad }}
            />
          </div>

          {/* ═══════════ BOLT CAP ═══════════ */}
          <div
            className="absolute left-[612px] top-[14px] w-[100px] h-[142px] flex items-center justify-center"
            style={{ background: themeGrad, clipPath: CUT_BOLT }}
          >
            <span className="dom-pop -ml-[18px]">
              <Bolt size={44} color="#fff" />
            </span>
          </div>

          {/* electric top line */}
          <div
            className="absolute left-[176px] top-[8px] w-[470px] h-[4px]"
            style={{
              backgroundColor: primary,
              backgroundImage: 'linear-gradient(90deg, transparent 0 40%, #ffffff 50%, transparent 60% 100%)',
              backgroundSize: '200% 100%',
              animation: 'dom-run 3s linear infinite',
              clipPath: CUT_CHIP,
            }}
          />
        </div>
      </div>
    </div>
  );
});

Dom.displayName = 'Dom';
export default Dom;