import React, { useMemo, memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MatchData, useSortedTeams, isPlayerDead, Player } from '../../shared/hooks/unsortteams';
import { useLocalTeamThrowables, ThrowableKind } from '../../shared/hooks/useLocalTeamThrowables';
import { wwcdChance } from '../../shared/hooks/liveDerived';
import { TeamLogo } from '../../shared/components/TeamLogo';
// NOTE: no socket here — PublicThemeRenderer owns the single connection,
// merges 'bulkUpdate' and passes fresh `matchData` down as a prop.
//
// THEME8 "WHITE LABEL" Upper — one card per team that still has someone
// alive (same grid + data as before), everything visible at once, no flipping:
//   ┌ head      rank chip · logo · tag + elims · 4 health bars
//   ├ utilities frag · smoke · molly · stun — large coloured icons + counts on ink
//   └ WWCD      10-segment slanted meter + bold % tab; the favourite (highest
//               chance) gets a crown and a theme-colour tab
// Layout: centred flex-wrap (7 per row). When a team is wiped its card
// shrinks out, then the rest glide into place (FLIP) — rows always stay
// centred, so the grid collapses toward the middle.
// Data: useSortedTeams 'live', useLocalTeamThrowables (by team slot),
// wwcdChance (shared liveDerived). The lightning FX director is removed.

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

interface UpperProps {
  tournament: Tournament;
  round?: Round | null;
  match?: Match | null;
  matchData?: MatchData | null;
}

// ─────────────────────────────────────────────
// Palette + type (shared with Lower third / Live Stats / Alerts / Dom)
// ─────────────────────────────────────────────
const INK = '#0B0B0E';
const WHITE = '#FFFFFF';
const PANEL = '#E9E9ED';
const LINE = '#DEDEE4';
const DIM = '#7A7A84';
const ALIVE = '#13B24A';
const LOW = '#F59E0B';
const KNOCK = '#E5323B';
const FONT = "'AGENCYB', 'Agency FB', 'AgencyFB', 'Barlow Condensed', 'Arial Narrow', sans-serif";

// ─────────────────────────────────────────────
// Geometry
// ─────────────────────────────────────────────
const CARD_W = 258;
const PER_ROW = 7;
const COL_GAP = 10;
const ROW_GAP = 12;
const HEAD_H = 56;
const UTIL_H = 50;
const WWCD_H = 42;
const CARD_H = HEAD_H + UTIL_H + WWCD_H; // 148
const SEGMENTS = 10;
const LEAVE_MS = 420;
const MOVE_MS = 520;
const CUT = 14; // top-left chamfer
const BAR_W = 7;
const BAR_H = 36;

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

const KEYFRAMES = `
@keyframes up8In    { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: none; } }
@keyframes up8Pop   { 0% { transform: scale(1.5); } 100% { transform: scale(1); } }
@keyframes up8Leave { to { opacity: 0; transform: scale(.82); } }
@keyframes up8Seg   { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.up8-card  { animation: up8In .5s cubic-bezier(.2,.8,.2,1) both; }
.up8-pop   { display: inline-block; animation: up8Pop .35s cubic-bezier(.2,.8,.2,1); }
.up8-leave { animation: up8Leave ${LEAVE_MS}ms cubic-bezier(.4,0,.6,1) forwards; }
@media (prefers-reduced-motion: reduce) { .up8-card, .up8-pop, .up8-leave { animation: none; } }
`;

/* ─────────────────────────────────────────────
   WWCD meter — 10 slanted segments + bold % tab
   ───────────────────────────────────────────── */
const Crown = ({ color, size = 14 }: { color: string; size?: number }) => (
  <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden style={{ display: 'block' }}>
    <path d="M2 8 L11 17 L20 2 L29 17 L38 8 L34 26 H6 Z" fill={color} />
  </svg>
);

const WwcdMeter: React.FC<{ pct: number; primary: string; fav: boolean }> = ({ pct, primary, fav }) => {
  const tabBg = fav ? primary : INK;
  const tabFg = fav ? inkOn(primary) : WHITE;
  return (
    <div style={{ height: WWCD_H, display: 'flex', alignItems: 'center', background: WHITE, position: 'relative' }}>
      {/* label */}
      <div style={{ flex: 'none', width: 52, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {fav ? <Crown color={primary} /> : <span style={{ height: 10 }} />}
        <span style={{ fontSize: 14, letterSpacing: '0.12em', color: fav ? INK : DIM }}>WWCD</span>
      </div>
      {/* segments */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 3, padding: '0 10px 0 4px' }}>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const fill = Math.max(0, Math.min(1, pct / (100 / SEGMENTS) - i));
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                flex: 1,
                height: 18,
                background: LINE,
                transform: 'skewX(-18deg)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${fill * 100}%`,
                  background: primary,
                  transition: 'width 500ms cubic-bezier(.2,.8,.2,1)',
                }}
              />
            </div>
          );
        })}
      </div>
      {/* % tab */}
      <div
        style={{
          flex: 'none',
          alignSelf: 'stretch',
          width: 70,
          background: tabBg,
          color: tabFg,
          clipPath: 'polygon(12px 0, 100% 0, 100% 100%, 0 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingLeft: 8,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span key={pct} className="up8-pop" style={{ fontSize: 28 }}>
          {pct}
        </span>
        <span style={{ fontSize: 15, marginLeft: 1, marginTop: 6, opacity: 0.8 }}>%</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Health bar — flat, same colours as Live Stats
// ─────────────────────────────────────────────
const PlayerHealthBar = memo(
  ({ player, apiEnabled }: { player: Player; apiEnabled: boolean }) => {
    const isDead = isPlayerDead(player);
    const isKnocked = player.liveState === 4;
    const ratio = isDead ? 0 : apiEnabled ? Math.max(0, Math.min(1, player.health / (player.healthMax || 100))) : 1;
    const color = isKnocked ? KNOCK : ratio < 0.3 ? LOW : ALIVE;
    return (
      <div style={{ position: 'relative', width: BAR_W, height: BAR_H, background: LINE }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '100%',
            height: ratio * BAR_H,
            background: isDead ? 'transparent' : color,
            transition: 'height 300ms ease, background-color 300ms ease',
          }}
        />
      </div>
    );
  },
  (a, b) =>
    a.player.health === b.player.health &&
    a.player.healthMax === b.player.healthMax &&
    a.player.liveState === b.player.liveState &&
    a.player.bHasDied === b.player.bHasDied &&
    a.apiEnabled === b.apiEnabled
);
PlayerHealthBar.displayName = 'PlayerHealthBar';

// ─────────────────────────────────────────────
// Throwable icons (24×24) — drawn on the ink strip, details in INK
// ─────────────────────────────────────────────
type IconProps = { color: string; size?: number };

const FragIcon: React.FC<IconProps> = ({ color, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="6.5" cy="5" r="2.2" fill="none" stroke={color} strokeWidth="1.6" />
    <rect x="9" y="4" width="6" height="4" rx="0.8" fill={color} />
    <path d="M14.5 4.2 L19.5 2 L20.6 3.6 L15.4 7.4 Z" fill={color} />
    <ellipse cx="12" cy="15.2" rx="6.6" ry="7.2" fill={color} />
    <path d="M5.6 13 H18.4 M5.6 17.4 H18.4 M9.6 8.4 V22 M14.4 8.4 V22" stroke={INK} strokeWidth="1.1" opacity="0.5" />
  </svg>
);

const SmokeIcon: React.FC<IconProps> = ({ color, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="16.5" cy="6.5" r="3" fill={color} opacity="0.6" />
    <circle cx="20" cy="3.6" r="2.2" fill={color} opacity="0.45" />
    <circle cx="13.2" cy="3.4" r="2" fill={color} opacity="0.4" />
    <rect x="5.5" y="8.5" width="9" height="13.5" rx="1.6" fill={color} />
    <rect x="6.5" y="6.4" width="7" height="2.4" rx="0.6" fill={color} />
    <rect x="5.5" y="12" width="9" height="1.4" fill={INK} opacity="0.5" />
    <rect x="5.5" y="17.6" width="9" height="1.4" fill={INK} opacity="0.5" />
  </svg>
);

const MolotovIcon: React.FC<IconProps> = ({ color, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M12 0.4 C15 3.2 15.6 5 13.8 7.2 H10.2 C8.4 5 9.6 2.6 12 0.4 Z" fill={color} />
    <path d="M12 2.6 C13.4 4.2 13.5 5.4 12.6 6.8 H11.4 C10.6 5.4 11 4 12 2.6 Z" fill="#ffe14d" />
    <rect x="10.4" y="7" width="3.2" height="4" fill={color} opacity="0.75" />
    <path d="M7.5 13.2 Q7.5 11 9.7 11 H14.3 Q16.5 11 16.5 13.2 V21.2 Q16.5 22.6 15.1 22.6 H8.9 Q7.5 22.6 7.5 21.2 Z" fill={color} />
    <path d="M7.5 15.6 Q12 14.4 16.5 15.6" fill="none" stroke={INK} strokeWidth="1.1" opacity="0.5" />
  </svg>
);

const StunIcon: React.FC<IconProps> = ({ color, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path
      d="M12 0.5 V3.6 M4.4 2.6 L6.4 5 M19.6 2.6 L17.6 5 M1.6 8.4 H4.4 M22.4 8.4 H19.6"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <rect x="7" y="7.4" width="10" height="15" rx="1.8" fill={color} />
    <rect x="9" y="5.2" width="6" height="2.6" rx="0.6" fill={color} />
    <path d="M12.8 11 L9.8 16.2 H11.8 L11 20 L14.4 14.6 H12.4 L13.4 11 Z" fill={INK} opacity="0.75" />
  </svg>
);

// Throwables strip, in display order. The game only reports the spectated
// team's backpack, so a team's numbers are from the last time it was watched
// (useLocalTeamThrowables); a team never watched this match shows dashes.
const THROWABLES: { kind: ThrowableKind; label: string; color: string; Icon: React.FC<IconProps> }[] = [
  { kind: 'frag', label: 'FRAG', color: '#4ade80', Icon: FragIcon },
  { kind: 'smoke', label: 'SMOKE', color: '#e5e7eb', Icon: SmokeIcon },
  { kind: 'molotov', label: 'MOLLY', color: '#fb923c', Icon: MolotovIcon },
  { kind: 'stun', label: 'STUN', color: '#facc15', Icon: StunIcon },
];

// ─────────────────────────────────────────────
// TeamCard
// ─────────────────────────────────────────────
interface TeamCardProps {
  team: any;
  rank: number;
  wwcd: number;
  primary: string;
  secondary: string;
  apiEnabled: boolean;
  carried: Record<ThrowableKind, number> | null;
  order: number;
  fav: boolean;
}

const TeamCard: React.FC<TeamCardProps> = ({ team, rank, wwcd, primary, secondary, apiEnabled, carried, order, fav }) => {
  const players: Player[] = (team.players ?? []).slice(0, 4);
  const outside = !!team.hasOutsideBlueCircle;
  const chipBg = rank === 1 ? primary : rank <= 3 ? INK : PANEL;
  const chipFg = rank === 1 ? inkOn(primary) : rank <= 3 ? WHITE : INK;
  const pct = Math.max(0, Math.min(100, Math.round(Number(wwcd) || 0)));

  return (
    <div
      className="up8-card"
      style={{
        animationDelay: `${Math.min(order, 18) * 40}ms`,
        position: 'relative',
        width: CARD_W,
        height: CARD_H,
        clipPath: `polygon(${CUT}px 0, 100% 0, 100% 100%, 0 100%, 0 ${CUT}px)`,
        fontFamily: FONT,
        fontWeight: 700,
        lineHeight: 1,
        background: WHITE,
      }}
    >
      {/* ── head ── */}
      <div style={{ position: 'relative', height: HEAD_H, display: 'flex', alignItems: 'stretch' }}>
        {outside && <div style={{ position: 'absolute', inset: 0, background: 'rgba(37,99,235,0.10)', pointerEvents: 'none' }} />}

        {/* edge rail — blue when outside the zone */}
        <div style={{ width: 5, flex: 'none', background: outside ? '#2563EB' : primary }} />

        {/* rank chip */}
        <div
          style={{
            width: 40,
            flex: 'none',
            background: chipBg,
            color: chipFg,
            clipPath: 'polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingRight: 5,
            fontSize: 26,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {rank}
        </div>

        {/* logo */}
        <div style={{ width: 46, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 7, boxSizing: 'border-box' }}>
          <TeamLogo
            logo={team.teamLogo}
            flag={team.teamFlag}
            fallback={'/def_logo.avif'}
            alt={team.teamTag}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>

        {/* tag + elims */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 2 }}>
          <span style={{ fontSize: 28, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {team.teamTag?.toUpperCase()}
          </span>
          <span style={{ marginTop: 4, fontSize: 15, letterSpacing: '0.14em', color: DIM }}>
            <span key={team.totalKills} className="up8-pop" style={{ color: INK }}>
              {team.totalKills ?? 0}
            </span>{' '}
            ELIMS
          </span>
        </div>

        {/* health bars */}
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px 0 4px' }}>
          {players.length === 0 ? (
            <span style={{ fontSize: 15, color: DIM, letterSpacing: '0.12em' }}>MISS</span>
          ) : (
            players.map((p) => <PlayerHealthBar key={p._id} player={p} apiEnabled={apiEnabled} />)
          )}
        </div>
      </div>

      {/* ── utilities (throwables) ── */}
      <div
        style={{
          position: 'relative',
          height: UTIL_H,
          background: INK,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
        }}
      >
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, background: primary }} />
        {THROWABLES.map(({ kind, label, color, Icon }, i) => {
          const count = carried ? carried[kind] ?? 0 : null;
          const empty = count === null || count === 0;
          return (
            <div
              key={kind}
              title={label}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            >
              {i > 0 && (
                <span style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 1, background: 'rgba(255,255,255,0.16)' }} />
              )}
              <span style={{ display: 'flex', opacity: empty ? 0.28 : 1, filter: empty ? 'grayscale(1)' : 'none' }}>
                <Icon color={color} size={32} />
              </span>
              <span
                key={String(count)}
                className={empty ? undefined : 'up8-pop'}
                style={{
                  minWidth: 12,
                  textAlign: 'center',
                  fontSize: 30,
                  color: empty ? 'rgba(255,255,255,0.3)' : WHITE,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {count === null ? '–' : count}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── WWCD chance ── */}
      <WwcdMeter pct={pct} primary={primary} fav={fav} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: fav ? primary : secondary }} />
    </div>
  );
};

// ─────────────────────────────────────────────
// Upper (main component)
// ─────────────────────────────────────────────
const Upper: React.FC<UpperProps> = ({ tournament, round, matchData }) => {
  // Shared ranking (placePoints then kills) + derived aliveCount / totalKills.
  const sortedTeams = useSortedTeams(matchData, null, 'live');
  const throwables = useLocalTeamThrowables();

  const primary = tournament.primaryColor || '#E10600';
  const secondary = tournament.secondaryColor || primary;
  const apiEnabled = round?.apiEnable === true;

  // Every team that still has someone alive, keeping its overall rank, with WWCD.
  const aliveTeams = useMemo(
    () =>
      sortedTeams
        .map((team: any, i: number) => ({ team, rank: i + 1 }))
        .filter(({ team }: any) => team.aliveCount > 0)
        .map((x: any) => ({ ...x, wwcd: wwcdChance(x.team, apiEnabled) })),
    [sortedTeams, apiEnabled]
  );
  const favId = useMemo(() => {
    let best: any = null;
    for (const x of aliveTeams) if (x.wwcd > 0 && (!best || x.wwcd > best.wwcd)) best = x;
    return best ? String(best.team._id) : null;
  }, [aliveTeams]);

  // ── display list: alive cards + cards that are animating out ──
  type Item = { key: string; data: any; leaving: boolean };
  const [items, setItems] = useState<Item[]>([]);
  const leaveTimers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    setItems((prev) => {
      const next: Item[] = aliveTeams.map((x: any) => ({ key: String(x.team._id), data: x, leaving: false }));
      const alive = new Set(next.map((n) => n.key));
      // keep departing cards at their previous index until their exit finishes
      prev.forEach((p, idx) => {
        if (alive.has(p.key)) return;
        next.splice(Math.min(idx, next.length), 0, { ...p, leaving: true });
        if (!leaveTimers.current.has(p.key)) {
          leaveTimers.current.set(
            p.key,
            window.setTimeout(() => {
              leaveTimers.current.delete(p.key);
              setItems((cur) => cur.filter((c) => !(c.key === p.key && c.leaving)));
            }, LEAVE_MS)
          );
        }
      });
      return next;
    });
  }, [aliveTeams]);

  useEffect(() => () => leaveTimers.current.forEach((t) => clearTimeout(t)), []);

  // ── FLIP: glide cards to their new slot whenever the layout changes ──
  const nodes = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastRects = useRef<Map<string, DOMRect>>(new Map());
  useLayoutEffect(() => {
    const rects = new Map<string, DOMRect>();
    nodes.current.forEach((el, key) => {
      const r = el.getBoundingClientRect();
      rects.set(key, r);
      const old = lastRects.current.get(key);
      if (old && (Math.abs(old.left - r.left) > 1 || Math.abs(old.top - r.top) > 1)) {
        el.animate?.(
          [{ transform: `translate(${old.left - r.left}px, ${old.top - r.top}px)` }, { transform: 'translate(0, 0)' }],
          { duration: MOVE_MS, easing: 'cubic-bezier(.2,.8,.2,1)' }
        );
      }
    });
    lastRects.current = rects;
  });

  if (!matchData) {
    return (
      <div style={{ width: 1920, height: 1080, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            right: 30,
            top: 40,
            width: 400,
            height: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: '0.14em',
            background: WHITE,
            color: INK,
            borderLeft: `8px solid ${primary}`,
          }}
        >
          NO MATCH DATA
        </div>
      </div>
    );
  }

  const ROW_W = PER_ROW * CARD_W + (PER_ROW - 1) * COL_GAP;

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative' }}>
      <style>{KEYFRAMES}</style>
      <div
        style={{
          position: 'absolute',
          top: 36,
          left: (1920 - ROW_W) / 2,
          width: ROW_W,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center', // partial rows stay centred → collapse toward the middle
          columnGap: COL_GAP,
          rowGap: ROW_GAP,
          filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.28))',
        }}
      >
        {items.map(({ key, data, leaving }, order) => {
          const { team, rank, wwcd } = data;
          const slot = Number(team.slot);
          const carried = throwables?.get(slot) as Record<ThrowableKind, number> | undefined;
          return (
            <div
              key={key}
              ref={(el) => {
                if (el) nodes.current.set(key, el);
                else nodes.current.delete(key);
              }}
              className={leaving ? 'up8-leave' : undefined}
              style={{ width: CARD_W, flex: 'none' }}
            >
              <TeamCard
                team={team}
                rank={rank}
                wwcd={wwcd}
                order={order}
                fav={key === favId && !leaving}
                primary={primary}
                secondary={secondary}
                apiEnabled={apiEnabled}
                carried={carried ?? null}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Upper;