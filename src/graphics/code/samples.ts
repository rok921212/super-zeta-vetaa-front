// Starter .ssx files for the code layer. Each one is a complete, working
// layer written the way the built-in themes are (React + Tailwind + the
// shared hooks), so they double as the format's documentation.

export interface CodeSample { id: string; name: string; hint: string; w: number; h: number; source: string }

const OVERALL = `<!-- scoresync-component v1 -->
<overlay name="Overall Standings" width="1920" height="1080" />

<style lang="tailwind">
  /* Tailwind utilities work in className (arbitrary values too: w-[1400px]).
     Plain CSS and @apply work here. Fonts the app ships (Supermolot, Tungsten,
     Bebas, …) and your uploaded fonts can be used by name. */
  .row { clip-path: polygon(24px 0, 100% 0, calc(100% - 24px) 100%, 0 100%); }
</style>

<script lang="tsx">
import { motion, AnimatePresence } from 'framer-motion';
import { computeRankedStandings, useRankingPager, rankingPageCount, TeamLogo } from 'scoresync';

const PER_PAGE = 8;

// Props are the same ones a built-in theme component gets:
// tournament, round, match, matches, matchData, matchDatas, overallData, deadTeamList,
// plus derived, live, feed, variables, theme, brand, width, height.
export default function OverallStandings({ tournament, matchDatas, overallData }: any) {
  const rows = React.useMemo(() => {
    const ranked = computeRankedStandings(matchDatas || []);
    return ranked.length ? ranked : (overallData?.teams || []);
  }, [matchDatas, overallData]);

  const pages = rankingPageCount('Custom', 'OverAllData', rows.length);
  const page = useRankingPager('OverAllData', pages, 15000);
  const accent = tournament?.primaryColor || '#f59e0b';

  return (
    <div className="absolute inset-0 font-[Supermolot] text-white">
      <div className="absolute left-[260px] top-[120px] text-[64px] uppercase tracking-wide">
        {tournament?.tournamentName || 'Overall Standings'}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={page} className="absolute left-[260px] top-[230px] w-[1400px]">
          {rows.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).map((t: any, i: number) => (
            <motion.div
              key={t.teamId || t._id || i}
              initial={{ x: -80, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 80, opacity: 0 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 26 }}
              className="row mb-[12px] flex h-[70px] items-center gap-6 bg-black/70 px-10 text-[32px]"
              style={{ borderLeft: \`8px solid \${accent}\` }}
            >
              <span className="w-12 text-right" style={{ color: accent }}>{t.rank ?? page * PER_PAGE + i + 1}</span>
              <TeamLogo logo={t.teamLogo} flag={t.teamFlag} className="h-12 w-12 object-contain" />
              <span className="flex-1 truncate uppercase">{t.teamName || t.teamTag}</span>
              <span className="w-28 text-right opacity-80">{t.totalKills ?? 0}</span>
              <span className="w-28 text-right font-bold">{t.totalScore ?? 0}</span>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
</script>
`;

const ALIVE = `<!-- scoresync-component v1 -->
<overlay name="Teams Alive" width="420" height="900" />

<script lang="tsx">
import { useSortedTeams, TeamLogo } from 'scoresync';

// The same live list (sort, alive count, elimination lock) the themes' LiveStats use.
export default function TeamsAlive({ matchData, overallData }: any) {
  const teams = useSortedTeams(matchData, overallData, 'liveUntilDead');
  return (
    <div className="absolute inset-0 flex flex-col gap-1 p-2 font-[Tungsten] text-white">
      {teams.slice(0, 16).map((t: any) => (
        <div key={t._id} className={'flex h-[48px] items-center gap-3 rounded bg-black/70 px-3 transition-opacity ' + (t.isAllDead ? 'opacity-35' : '')}>
          <span className="w-6 text-[22px] opacity-70">{t.teamRank}</span>
          <TeamLogo logo={t.teamLogo} flag={t.teamFlag} className="h-8 w-8 object-contain" />
          <span className="flex-1 truncate text-[26px] uppercase">{t.teamTag}</span>
          <div className="flex gap-[3px]">
            {[0, 1, 2, 3].map((n) => (
              <span key={n} className="h-6 w-[7px] rounded-sm" style={{ background: n < t.aliveCount ? t.color : 'rgba(255,255,255,.15)' }} />
            ))}
          </div>
          <span className="w-10 text-right text-[26px]">{t.totalKills}</span>
        </div>
      ))}
    </div>
  );
}
</script>
`;

const FEED = `<!-- scoresync-component v1 -->
<overlay name="Event Ticker" width="700" height="360" />

<style>
  .item { animation: in 350ms ease-out both; }
  @keyframes in { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
</style>

<script lang="tsx">
import { useEvent } from 'scoresync';

// Live events arrive one by one: kill, elimination, knock, revive, recall, milestone, rankChange …
export default function EventTicker() {
  const [items, setItems] = React.useState<any[]>([]);
  useEvent(null, (e) => setItems((list) => [{ ...e, key: Date.now() + Math.random() }, ...list].slice(0, 6)));
  return (
    <div className="absolute inset-0 flex flex-col items-end gap-2 p-3 font-[Bebas] text-white">
      {items.map((e) => (
        <div key={e.key} className="item rounded bg-black/75 px-4 py-2 text-[28px] uppercase tracking-wide">
          <span className="text-amber-400">{e.type}</span>{' '}
          {e.teamTag || e.team?.teamTag || ''} {e.playerName || e.player?.playerName || ''}
        </div>
      ))}
    </div>
  );
}
</script>
`;

const VANILLA = `<!-- scoresync-component v1 -->
<overlay name="Match Leader (plain JS)" width="800" height="160" />

<template>
  <div class="card">
    <div class="label">MATCH {{match.matchNo}} · LEADER</div>
    <div class="name" id="leader">—</div>
    <div class="pts"><span id="pts">0</span> PTS</div>
  </div>
</template>

<style>
  .card { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr auto; align-items: center;
          padding: 0 32px; background: linear-gradient(90deg, #111827ee, #1f2937cc); border-left: 8px solid #f59e0b;
          border-radius: 14px; font-family: Supermolot, system-ui; color: #fff; }
  .label { grid-column: 1 / -1; font-size: 20px; opacity: .7; letter-spacing: 2px; }
  .name { font-size: 54px; text-transform: uppercase; }
  .pts { font-size: 48px; color: #f59e0b; }
</style>

<script lang="js">
// Plain JavaScript: the <template> is already on the page; {{tokens}} in it fill themselves.
// ss.on('data', fn) runs on every update, ss.on('event', fn) on every live event.
const leader = document.getElementById('leader');
const pts = document.getElementById('pts');

ss.on('data', (data) => {
  const top = (data.derived.teams || [])[0];
  leader.textContent = top ? top.teamName || top.teamTag : '—';
  pts.textContent = top ? top.totalPoints : 0;
});
</script>
`;

export const CODE_SAMPLES: CodeSample[] = [
  { id: 'overall', name: 'Overall standings (TSX)', hint: 'computeRankedStandings + paging + framer-motion', w: 1920, h: 1080, source: OVERALL },
  { id: 'alive', name: 'Teams alive (TSX)', hint: 'useSortedTeams, like LiveStats', w: 420, h: 900, source: ALIVE },
  { id: 'feed', name: 'Event ticker (TSX)', hint: 'useEvent: kills, knocks, recalls…', w: 700, h: 360, source: FEED },
  { id: 'vanilla', name: 'Match leader (plain JS)', hint: '<template> + CSS + ss.on(\'data\')', w: 800, h: 160, source: VANILLA },
];
