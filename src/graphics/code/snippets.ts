// Ready pieces for a code layer: small components written the way the
// built-in themes are, that read the live data themselves (useData), so they
// work the moment they are dropped in. The panel adds the imports they need
// and puts the component above the file's own `export default`.

import { ensureImports } from './imports.ts';

export interface CodeSnippet {
  id: string;
  name: string;
  hint: string;
  /** Imports the snippet needs, by module. */
  imports: Record<string, string[]>;
  code: string;
  /** How to use it, shown after inserting. */
  usage: string;
}

export const CODE_SNIPPETS: CodeSnippet[] = [
  {
    id: 'alive-bars',
    name: 'Alive bars (4 players)',
    hint: 'One bar per player: health height, red when knocked, empty when dead',
    imports: { scoresync: ['isPlayerDead'] },
    usage: '<AliveBars players={team.players} /> inside a team row.',
    code: `// Alive bars: one per player — health height, red when knocked, empty when dead.
function AliveBars({ players }: { players?: any[] }) {
  return (
    <div className="flex h-[26px] items-end gap-[3px]">
      {(players ?? []).slice(0, 4).map((p: any, i: number) => {
        const dead = isPlayerDead(p);
        const knocked = p.liveState === 4;
        const health = dead ? 0 : Math.max(0, Math.min(1, (p.health ?? 100) / (p.healthMax || 100)));
        return (
          <div key={p.uId ?? i} className="relative h-full w-[8px] bg-white/20">
            <div className={\`absolute bottom-0 w-full transition-all duration-300 \${knocked ? 'bg-red-500' : 'bg-white'}\`} style={{ height: \`\${health * 100}%\` }} />
          </div>
        );
      })}
    </div>
  );
}
`,
  },
  {
    id: 'team-rows',
    name: 'Team rows (LiveStats)',
    hint: 'Rank, logo, tag, alive bars, kills; a wiped team swipes aside and greys out; recall banner',
    imports: { scoresync: ['useData', 'useRecallEvents', 'TeamRecallOverlay', 'TeamLogo', 'isPlayerDead'], 'framer-motion': ['motion'] },
    usage: '<TeamRows /> anywhere in your component (it reads the teams itself). Needs the Alive bars snippet too — it is added with it.',
    code: `// Team rows like LiveStats: a wiped-out team swipes aside and greys out; a recall shows its banner.
function TeamRows({ max = 16, rowHeight = 44 }: { max?: number; rowHeight?: number }) {
  const { derived, matchData, match } = useData();
  const recallEvents = useRecallEvents(matchData, match);
  return (
    <div className="flex flex-col gap-[3px]">
      {(derived?.teams ?? []).slice(0, max).map((t: any, i: number) => (
        <motion.div
          layout
          key={t.teamId ?? i}
          animate={t.isAllDead ? { x: [0, -24, -8], opacity: 0.45, filter: 'grayscale(1)' } : { x: 0, opacity: 1, filter: 'grayscale(0)' }}
          transition={{ duration: 0.5 }}
          className="relative flex items-center gap-2 overflow-hidden bg-black/75 px-2 text-[20px] font-bold text-white"
          style={{ height: rowHeight }}
        >
          <TeamRecallOverlay recallEvents={recallEvents} teamId={String(t.teamId ?? t._id ?? '')} rowHeight={rowHeight} />
          <span className="w-8 text-center">{t.rank ?? i + 1}</span>
          <TeamLogo logo={t.teamLogo} flag={t.teamFlag} className="h-8 w-8 object-contain" />
          <span className="flex-1 truncate uppercase">{t.teamTag || t.teamName}</span>
          <AliveBars players={t.players} />
          <span className="w-10 text-right">{t.totalKills ?? 0}</span>
        </motion.div>
      ))}
    </div>
  );
}
`,
  },
  {
    id: 'top-team-photos',
    name: 'Top team photos (dead swipe)',
    hint: 'The leading team’s 4 player photos; a dead player gets a red slash and greys out',
    imports: { scoresync: ['useData', 'isPlayerDead'], 'framer-motion': ['motion'] },
    usage: '<TopTeamPhotos /> — or <TopTeamPhotos team={someTeam} /> for another team.',
    code: `// The leading team's four photos side by side; a dead player swipes aside, greys out and gets a red slash.
function TopTeamPhotos({ team }: { team?: any }) {
  const { derived } = useData();
  const t = team ?? derived?.teams?.[0];
  if (!t) return null;
  return (
    <div className="relative h-[200px] w-[400px]">
      {(t.players ?? []).slice(0, 4).map((p: any, i: number) => {
        const dead = isPlayerDead(p);
        return (
          <motion.div
            key={p.uId ?? i}
            className="absolute top-0 h-[200px] w-[200px]"
            style={{ left: -25 + i * 85 }}
            animate={dead ? { x: [0, -18, -6], opacity: 0.5, filter: 'grayscale(1)' } : { x: 0, opacity: 1, filter: 'grayscale(0)' }}
            transition={{ duration: 0.5 }}
          >
            <img src={p.picUrl || '/def_char.png'} alt="" className="h-full w-full object-cover" />
            {dead && (
              <motion.div
                className="absolute left-[10%] top-1/2 h-[12px] w-[80%] origin-left -rotate-[24deg] bg-red-600"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.3 }}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
`,
  },
  {
    id: 'kill-popup',
    name: 'Kill popup',
    hint: 'Pops in for 3 s on every kill (live events)',
    imports: { scoresync: ['useEvent'], 'framer-motion': ['motion', 'AnimatePresence'] },
    usage: '<KillPopup /> anywhere in your component. Test it with the Kill button in Simulation.',
    code: `// A popup for every kill: who, which team, how many kills — gone after 3 s.
function KillPopup() {
  const [kill, setKill] = React.useState<any>(null);
  useEvent('kill', (e) => setKill(e));
  React.useEffect(() => {
    if (!kill) return;
    const t = setTimeout(() => setKill(null), 3000);
    return () => clearTimeout(t);
  }, [kill]);
  return (
    <AnimatePresence>
      {kill && (
        <motion.div
          key={kill.id}
          initial={{ x: 120, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 120, opacity: 0 }}
          className="flex h-[64px] w-[420px] items-center gap-3 rounded bg-black/80 px-4 text-white"
        >
          <span className="flex-1 truncate text-[24px] font-extrabold uppercase">{kill.player?.playerName ?? kill.playerName ?? 'Player'}</span>
          <span className="text-[18px] opacity-70">{kill.teamTag ?? ''}</span>
          <span className="text-[24px] font-extrabold text-amber-400">{kill.killNum ?? ''} KILLS</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
`,
  },
  {
    id: 'player-state',
    name: 'Player state helper',
    hint: 'alive / knocked / dead for any player, both raw and live rows',
    imports: { scoresync: ['isPlayerDead'] },
    usage: "playerState(p) → 'alive' | 'knocked' | 'dead'. Use it for colours and conditions.",
    code: `// 'alive' | 'knocked' | 'dead' for a player from matchData (liveState) or from live.players (knocked / dead).
function playerState(p: any): 'alive' | 'knocked' | 'dead' {
  if (!p) return 'dead';
  if (p.dead === true || isPlayerDead(p)) return 'dead';
  if (p.knocked === true || p.liveState === 4) return 'knocked';
  return 'alive';
}
`,
  },
];

/** Snippets a snippet depends on (Team rows draws Alive bars). */
export const SNIPPET_NEEDS: Record<string, string[]> = { 'team-rows': ['alive-bars'] };

const definedName = (code: string) => /function\s+([A-Za-z_$][\w$]*)/.exec(code)?.[1] || '';

/**
 * Put a snippet (and the snippets it uses) into an .ssx source: above the
 * script's `export default`, with its imports merged in. Already-present
 * pieces are not added twice. `added` lists what went in.
 */
export function insertSnippet(source: string, id: string): { source: string; added: string[]; error?: string } {
  const lang = /<script\b[^>]*\blang\s*=\s*["']?(tsx|jsx|js)/i.exec(source)?.[1]?.toLowerCase();
  if (!/<script\b/i.test(source)) return { source, added: [], error: 'Add a <script lang="tsx"> block first (or start from a sample).' };
  if (lang === 'js') return { source, added: [], error: 'Snippets are React components: they need <script lang="tsx">, not plain js.' };
  if (lang === 'jsx') return { source, added: [], error: 'Snippets are written in TSX: change <script lang="jsx"> to lang="tsx" (every JSX file is valid TSX).' };
  const order: CodeSnippet[] = [];
  const visit = (sid: string) => {
    const s = CODE_SNIPPETS.find((x) => x.id === sid);
    if (!s || order.includes(s)) return;
    (SNIPPET_NEEDS[sid] || []).forEach(visit);
    order.push(s);
  };
  visit(id);
  const fresh = order.filter((s) => !new RegExp(`function\\s+${definedName(s.code)}\\s*\\(`).test(source));
  if (!fresh.length) return { source, added: [] };
  const code = fresh.map((s) => s.code).join('\n');
  let next = source;
  const exp = /^[ \t]*export\s+default\b/m.exec(next);
  const end = /<\/script>/i.exec(next);
  const at = exp ? exp.index : end ? end.index : next.length;
  next = `${next.slice(0, at)}${code}\n${next.slice(at)}`;
  const imports: Record<string, Set<string>> = {};
  for (const s of fresh) for (const [mod, names] of Object.entries(s.imports)) names.forEach((n) => (imports[mod] ||= new Set()).add(n));
  for (const [mod, names] of Object.entries(imports)) next = ensureImports(next, mod, Array.from(names));
  return { source: next, added: fresh.map((s) => s.name) };
}
