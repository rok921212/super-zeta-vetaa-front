// What a code layer may import, checked BEFORE it is compiled, so a layer that
// could never run says so on the line of the import instead of "Compiled"
// followed by a blank layer.
//
//   • react, react-dom, framer-motion, scoresync: fine.
//   • The theme files' own imports ('../../shared/hooks/unsortteams',
//     '../../shared/components/TeamLogo' …): those helpers ARE in the sandbox
//     as 'scoresync', so the import is rewritten to it (same line, so line
//     numbers stay right) — a theme component can be pasted as it is.
//   • Anything else (another app file, an npm package, a .css file): an error
//     that says what to do instead.

import type { CodeProblem } from './compileCore.ts';

/** Modules the sandbox provides (sdk-src/codeRuntime.tsx MODULES). */
export const CODE_MODULES = ['react', 'react-dom', 'react-dom/client', 'framer-motion', 'motion/react', 'scoresync'];

/** Everything `import { … } from 'scoresync'` offers (code/scoresyncApi.ts; a test keeps them equal). */
export const SCORESYNC_NAMES = [
  'computeRankedStandings', 'buildOverallStandings', 'computeMatchStandings', 'buildStandings', 'compareOfficialStandings', 'pickStandingTeam', 'isMatchPlayed',
  'useSortedTeams', 'deriveTeams', 'isPlayerDead', 'isRondoMap', 'toAlertTeam',
  'computeMatchTotals', 'useLiveKillFeed', 'useKillMilestones', 'useRecallEvents', 'useRecallBanner', 'wwcdChance',
  'computeFraggerScores', 'buildFraggerPool', 'useRankingPager', 'rankingPageCount', 'useLogoFlagPhase',
  'TeamLogo', 'TeamLogoSvg', 'teamSlotColor', 'format', 'fillTokens', 'useData', 'useEvent',
  'TeamRecallOverlay', 'RecalledOverlay',
];
const NAMES = new Set(SCORESYNC_NAMES);

/** App files whose exports are in 'scoresync' (by file name), and the name of their default export. */
const SHARED_FILES: Record<string, string | null> = {
  officialstandings: null, unsortteams: null, matchtotals: null, livekillfeed: null, killmilestones: null,
  recallevents: null, livederived: null, fraggerscore: null, rankingpager: null, logoflagswitch: null,
  teamlogo: 'TeamLogo', teamcolor: null, teamrecalloverlay: 'TeamRecallOverlay', recalledoverlay: 'RecalledOverlay',
};
const sharedKey = (spec: string) => (spec.split('/').pop() || '').replace(/\.(tsx?|jsx?)$/i, '').toLowerCase();
const isShared = (spec: string) => /^\.{1,2}\//.test(spec) && Object.prototype.hasOwnProperty.call(SHARED_FILES, sharedKey(spec));

const PACKAGE_TIPS: Record<string, string> = {
  'react-icons': 'Icon packages are not in the sandbox: draw the icon as an <svg>, use an emoji, or an image (https:// or asset:<id>).',
  axios: 'A code layer cannot fetch anything: all match data arrives as props (matchData, derived, live…).',
  'socket.io-client': 'A code layer cannot open sockets: live data already arrives as props, and live events through useEvent.',
};

export interface ImportCheck {
  /** The script with app-file imports pointed at 'scoresync' (line count unchanged). */
  script: string;
  /** Lines are lines of the SCRIPT (1 = its first line). */
  problems: CodeProblem[];
}

const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length;

interface Clause { defaultName?: string; namespace?: string; named: Array<{ name: string; as: string }> }

function parseClause(clause: string): Clause {
  const out: Clause = { named: [] };
  let rest = clause.trim();
  const braces = /\{([\s\S]*)\}/.exec(rest);
  if (braces) {
    for (const part of braces[1].split(',')) {
      const p = part.trim().replace(/^type\s+/, '');
      if (!p) continue;
      const m = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(p);
      if (m) out.named.push({ name: m[1], as: m[2] || m[1] });
    }
    rest = rest.replace(braces[0], '');
  }
  const ns = /\*\s*as\s+([A-Za-z_$][\w$]*)/.exec(rest);
  if (ns) { out.namespace = ns[1]; rest = rest.replace(ns[0], ''); }
  const def = /^\s*([A-Za-z_$][\w$]*)/.exec(rest.replace(/,/g, ' '));
  if (def) out.defaultName = def[1];
  return out;
}

const closest = (name: string): string | null => {
  const low = name.toLowerCase();
  return SCORESYNC_NAMES.find((n) => n.toLowerCase() === low)
    || SCORESYNC_NAMES.find((n) => n.toLowerCase().includes(low) || low.includes(n.toLowerCase()))
    || null;
};

/** A name that is used as a value (not a type): types are dropped by the compiler, so they need no check. */
const looksLikeValue = (name: string) => /^[a-z]/.test(name) || /^use[A-Z]/.test(name);

export function checkImports(script: string): ImportCheck {
  const problems: CodeProblem[] = [];
  let out = script;
  const IMPORT_RE = /\bimport\s+(type\s+)?([^'";]*?)\s*from\s*(['"])([^'"]+)\3|\bimport\s*(['"])([^'"]+)\5|\brequire\(\s*(['"])([^'"]+)\7\s*\)/g;
  const edits: Array<{ start: number; end: number; text: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = IMPORT_RE.exec(script))) {
    const typeOnly = !!m[1];
    const clause = m[2];
    const spec = m[4] ?? m[6] ?? m[8];
    const bare = m[6] != null;
    const line = lineAt(script, m.index);
    if (typeOnly) continue;
    if (CODE_MODULES.includes(spec)) {
      if (spec === 'scoresync' && clause != null) {
        const c = parseClause(clause);
        if (c.defaultName) problems.push({ where: 'script', line, level: 'error', message: `'scoresync' has no default export: write import { ${c.defaultName} } from 'scoresync'.` });
        for (const n of c.named) {
          if (!NAMES.has(n.name) && looksLikeValue(n.name)) {
            const near = closest(n.name);
            problems.push({ where: 'script', line, level: 'error', message: `'scoresync' has no “${n.name}”.${near ? ` Did you mean “${near}”?` : ''}`, hint: `It offers: ${SCORESYNC_NAMES.join(', ')}.` });
          }
        }
      }
      continue;
    }
    if (isShared(spec) && clause != null && !bare) {
      // A theme's own helper: read it from 'scoresync' instead.
      const c = parseClause(clause);
      const names = [...c.named];
      const fileDefault = SHARED_FILES[sharedKey(spec)] ?? null;
      if (c.defaultName) {
        if (fileDefault) names.push({ name: fileDefault, as: c.defaultName });
        else { problems.push({ where: 'script', line, level: 'error', message: `“${spec}” has no default export inside a code layer: use import { … } from 'scoresync'.` }); continue; }
      }
      if (c.namespace) { problems.push({ where: 'script', line, level: 'error', message: `import * as ${c.namespace} from '${spec}' is not supported: use import * as ${c.namespace} from 'scoresync'.` }); continue; }
      const missing = names.filter((n) => !NAMES.has(n.name) && looksLikeValue(n.name));
      if (missing.length) {
        problems.push({ where: 'script', line, level: 'error', message: `${missing.map((n) => `“${n.name}”`).join(', ')} from '${spec}' is not available in a code layer.`, hint: 'Copy that function into this file, or use what scoresync offers (see Reference).' });
        continue;
      }
      const statement = m[0];
      const keepLines = '\n'.repeat((statement.match(/\n/g) || []).length);
      const list = names.map((n) => (n.as === n.name ? n.name : `${n.name} as ${n.as}`)).join(', ');
      edits.push({ start: m.index, end: m.index + statement.length, text: `import { ${list} } from 'scoresync'${keepLines}` });
      problems.push({ where: 'script', line, level: 'info', message: `'${spec}' is read from 'scoresync' (the same shared code the themes use).` });
      continue;
    }
    if (/\.(css|scss|sass|less)$/i.test(spec)) {
      problems.push({ where: 'script', line, level: 'error', message: `A code layer cannot import a stylesheet ('${spec}').`, hint: 'Paste the CSS into the <style> block of this file instead.' });
      continue;
    }
    if (/^\.{1,2}\/|^\//.test(spec) || /^src\//.test(spec)) {
      problems.push({ where: 'script', line, level: 'error', message: `'${spec}' is a file of the app. A code layer is one file and cannot load others.`, hint: 'Copy what you need from that file into this one, or use the helpers in scoresync (see Reference).' });
      continue;
    }
    const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    problems.push({
      where: 'script', line, level: 'error',
      message: `The package '${spec}' is not available in a code layer.`,
      hint: PACKAGE_TIPS[pkg] || `Only ${CODE_MODULES.filter((x) => x !== 'motion/react' && x !== 'react-dom/client').join(', ')} can be imported (no network, no npm).`,
    });
  }
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return { script: out, problems };
}

/**
 * Make sure `names` are imported from `module` in an .ssx source: merged into
 * an existing `import { … } from 'module'`, or a new import line at the top of
 * the <script>.
 */
export function ensureImports(source: string, module: string, names: string[]): string {
  if (!names.length) return source;
  const esc = module.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*(['"])${esc}\\2`);
  const found = re.exec(source);
  if (found) {
    const have = found[1].split(',').map((s) => s.trim()).filter(Boolean);
    const plain = new Set(have.map((h) => h.split(/\s+as\s+/)[0]));
    const add = names.filter((n) => !plain.has(n));
    if (!add.length) return source;
    return source.slice(0, found.index) + `import { ${[...have, ...add].join(', ')} } from '${module}'` + source.slice(found.index + found[0].length);
  }
  const line = `import { ${names.join(', ')} } from '${module}';\n`;
  const tag = /<script\b[^>]*>\s*\n?/i.exec(source);
  if (!tag) return line + source;
  const at = tag.index + tag[0].length;
  return source.slice(0, at) + line + source.slice(at);
}
