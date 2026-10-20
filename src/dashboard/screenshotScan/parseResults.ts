// Ported from imageResize/src/matchData/parseResults.ts. The layout parser
// (findRows .. parseScreenshotWords) is unchanged; matching runs against the
// UID directory of the current match instead of slotlist rosters.
import type { OcrWord } from './ocr';
import type { DirectoryTeam, OcrRow } from './types';
import { makeId, nameSimilarity } from './util';

/**
 * Turns OCR words from a result screenshot into player rows.
 *
 * Expected layout (PUBG-style results screen): each team block shows a big
 * rank number (rank 1 is an emblem with no digit), the team logo, then 4
 * lines of "<player name>   <N> elimination(s)". Blocks are laid out in
 * one or more columns.
 */

const ELIM_RE = /[ec]?l[il1|!]m[il1|!]n/i;
const LEADING_KILLS_RE = /^([0-9OoDUlIi|!SZBJbGAT]{1,2})(?=[ec]?l[il1|!]m)/;

const DIGIT_FIXES: Record<string, string> = {
  O: '0', o: '0', D: '0', U: '0', l: '1', I: '1', '|': '1', '!': '1', i: '1',
  S: '5', J: '5', Z: '2', B: '8', b: '6', G: '6', A: '4', T: '7',
};

function parseNumber(text: string): number | null {
  const fixed = text
    .replace(/[^0-9OoDUlIi|!SZBJbGAT]/g, '')
    .replace(/[OoDUlIi|!SZBJbGAT]/g, (c) => DIGIT_FIXES[c]);
  if (!fixed || fixed.length > 2) return null;
  return Number(fixed);
}

const height = (w: OcrWord) => w.y1 - w.y0;
const centerY = (w: OcrWord) => (w.y0 + w.y1) / 2;
const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

interface RawRow {
  name: string;
  kills: number;
  killsX: number;
  nameX: number;
  y: number;
  h: number;
  used: Set<OcrWord>;
}

/** Finds every "<name> <N> eliminations" row among the words. */
function findRows(words: OcrWord[]): RawRow[] {
  const rows: RawRow[] = [];

  for (const elim of words) {
    if (!ELIM_RE.test(elim.text)) continue;
    const h = height(elim);
    const sameLine = (w: OcrWord) => w !== elim && Math.abs(centerY(w) - centerY(elim)) < h * 0.8;

    // Kills: either glued to the front of the word ("4eliminations") or the
    // nearest word just to the left of it.
    let kills: number | null = null;
    let killsWord: OcrWord | null = null;
    const glued = elim.text.match(LEADING_KILLS_RE);
    if (glued) {
      kills = parseNumber(glued[1]);
      killsWord = elim;
    } else {
      const candidate = words
        .filter((w) => sameLine(w) && w.x1 <= elim.x0 + h * 0.3 && elim.x0 - w.x1 < h * 2)
        .sort((a, b) => b.x1 - a.x1)[0];
      if (candidate) {
        kills = parseNumber(candidate.text);
        killsWord = candidate;
      }
    }
    if (kills == null || !killsWord) continue;

    // Name: walk left from the kills number, chaining words separated by
    // normal spacing. The first gap can be wide (names are left-aligned,
    // kills right-aligned).
    const used = new Set<OcrWord>([elim, killsWord]);
    const leftWords = words
      .filter((w) => sameLine(w) && !used.has(w) && w.x1 <= killsWord!.x0 + 2)
      .sort((a, b) => b.x1 - a.x1);
    const nameWords: OcrWord[] = [];
    let edge = killsWord.x0;
    for (const w of leftWords) {
      const gap = edge - w.x1;
      const maxGap = nameWords.length === 0 ? h * 14 : h * 1.3;
      if (gap > maxGap) break;
      nameWords.unshift(w);
      used.add(w);
      edge = w.x0;
    }
    if (nameWords.length === 0) continue;

    rows.push({
      name: nameWords.map((w) => w.text).join(' '),
      kills,
      killsX: killsWord.x0,
      nameX: nameWords[0].x0,
      y: centerY(elim),
      h,
      used,
    });
  }

  return rows;
}

/** Groups rows into columns by the x position of their kills numbers. */
function splitColumns(rows: RawRow[], imageWidth: number): RawRow[][] {
  const sorted = [...rows].sort((a, b) => a.killsX - b.killsX);
  const columns: RawRow[][] = [];
  for (const row of sorted) {
    const last = columns[columns.length - 1];
    if (last && row.killsX - last[last.length - 1].killsX < imageWidth * 0.1) last.push(row);
    else columns.push([row]);
  }
  return columns
    .map((col) => col.sort((a, b) => a.y - b.y))
    .sort((a, b) => median(a.map((r) => r.nameX)) - median(b.map((r) => r.nameX)));
}

interface RowGroup {
  rows: RawRow[];
  rank?: number;
}

/** Splits a column into team blocks of up to 4, anchored on big rank digits when found. */
function groupColumn(column: RawRow[], words: OcrWord[], usedWords: Set<OcrWord>): RowGroup[] {
  const spacings = column.slice(1).map((r, i) => r.y - column[i].y);
  const rowSpacing = median(spacings) || column[0].h * 2;
  const textHeight = median(column.map((r) => r.h));
  const nameLeft = Math.min(...column.map((r) => r.nameX));
  const top = column[0].y - rowSpacing * 2;
  const bottom = column[column.length - 1].y + rowSpacing * 2;

  const anchors = words
    .filter(
      (w) =>
        !usedWords.has(w) &&
        /^\d{1,2}$/.test(w.text) &&
        height(w) >= textHeight * 1.3 &&
        w.x1 < nameLeft &&
        centerY(w) > top &&
        centerY(w) < bottom
    )
    .map((w) => ({ rank: Number(w.text), y: centerY(w), x: w.x1 }))
    // Keep only the anchor closest to the names for each vertical position.
    .sort((a, b) => b.x - a.x)
    .filter((a, i, all) => all.findIndex((o) => Math.abs(o.y - a.y) < rowSpacing) === i)
    .sort((a, b) => a.y - b.y);

  const groups: RowGroup[] = anchors.map((a) => ({ rows: [], rank: a.rank }));
  const leftovers: RawRow[] = [];

  if (anchors.length > 0) {
    const claims = column.map((row) => {
      let best = -1;
      let bestDy = Infinity;
      anchors.forEach((a, i) => {
        const dy = Math.abs(row.y - a.y);
        if (dy < bestDy) {
          bestDy = dy;
          best = i;
        }
      });
      return { row, anchor: bestDy <= rowSpacing * 1.7 ? best : -1, dy: bestDy };
    });
    anchors.forEach((_, i) => {
      claims
        .filter((c) => c.anchor === i)
        .sort((a, b) => a.dy - b.dy)
        .forEach((c, n) => {
          if (n < 4) groups[i].rows.push(c.row);
          else c.anchor = -1;
        });
    });
    claims.filter((c) => c.anchor === -1).forEach((c) => leftovers.push(c.row));
  } else {
    leftovers.push(...column);
  }

  // Rows without an anchor (rank 1 emblem, or digits OCR missed): split on
  // large vertical gaps, then chunk into blocks of 4.
  leftovers.sort((a, b) => a.y - b.y);
  let current: RawRow[] = [];
  const flush = () => {
    for (let i = 0; i < current.length; i += 4) groups.push({ rows: current.slice(i, i + 4) });
    current = [];
  };
  leftovers.forEach((row, i) => {
    const prev = leftovers[i - 1];
    const anchoredBetween =
      prev && groups.some((g) => g.rows.some((r) => r.y > prev.y && r.y < row.y));
    if (prev && (row.y - prev.y > rowSpacing * 1.6 || anchoredBetween)) flush();
    current.push(row);
  });
  flush();

  return groups
    .filter((g) => g.rows.length > 0)
    .map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.y - b.y) }))
    .sort((a, b) => a.rows[0].y - b.rows[0].y);
}

/** Fills in missing ranks from neighbours in reading order (rank 1 has no digit). */
function inferRanks(groups: RowGroup[]) {
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].rank != null) continue;
    const prev = groups[i - 1]?.rank;
    const next = groups.slice(i + 1).findIndex((g) => g.rank != null);
    if (prev != null) groups[i].rank = prev + 1;
    else if (next !== -1) groups[i].rank = Math.max(1, groups[i + 1 + next].rank! - (next + 1));
    else groups[i].rank = i + 1;
  }
}

/** Parses one screenshot's words into rows (not yet matched to teams). */
export function parseScreenshotWords(words: OcrWord[], imageWidth: number, shotKey: string): OcrRow[] {
  const rawRows = findRows(words);
  if (rawRows.length === 0) return [];

  const usedWords = new Set<OcrWord>();
  rawRows.forEach((r) => r.used.forEach((w) => usedWords.add(w)));

  const groups = splitColumns(rawRows, imageWidth).flatMap((col) => groupColumn(col, words, usedWords));
  inferRanks(groups);

  return groups.flatMap((group, gi) =>
    group.rows.map((row) => ({
      id: makeId(),
      rawName: row.name,
      kills: row.kills,
      rank: group.rank,
      groupKey: `${shotKey}-${gi}`,
      similarity: 0,
    }))
  );
}

const MATCH_THRESHOLD = 0.55;

/**
 * Assigns each team block to the team whose known players best match its
 * names, then each row to one of those players (and so to a UID). Rows that
 * can't be matched keep uId undefined so the user can assign them by hand.
 */
export function matchRowsToTeams(rows: OcrRow[], teams: DirectoryTeam[]): OcrRow[] {
  const byGroup = new Map<string, OcrRow[]>();
  rows.forEach((r) => byGroup.set(r.groupKey, [...(byGroup.get(r.groupKey) ?? []), r]));

  const out: OcrRow[] = [];
  byGroup.forEach((groupRows) => {
    let bestTeam: DirectoryTeam | null = null;
    let bestScore = 0;
    let bestSum = 0;
    for (const team of teams) {
      if (team.players.length === 0) continue;
      let score = 0;
      let sum = 0;
      for (const row of groupRows) {
        const sim = Math.max(...team.players.map((p) => nameSimilarity(row.rawName, p.playerName)));
        sum += sim;
        if (sim >= MATCH_THRESHOLD) score += 1;
      }
      if (score > bestScore || (score === bestScore && score > 0 && sum > bestSum)) {
        bestTeam = team;
        bestScore = score;
        bestSum = sum;
      }
    }

    if (!bestTeam) {
      groupRows.forEach((r) => out.push({ ...r, teamId: undefined, uId: undefined, similarity: 0 }));
      return;
    }
    out.push(...pairRowsWithTeam(groupRows, bestTeam, bestScore));
  });

  return out;
}

/**
 * Pairs one team block's rows with a team's known players. Also used when the
 * user picks the team for a block by hand (teamScore then counts the rows
 * that clear the threshold against that team).
 */
export function pairRowsWithTeam(groupRows: OcrRow[], team: DirectoryTeam, teamScore?: number): OcrRow[] {
  const bestScore = teamScore ?? groupRows.filter((row) =>
    team.players.some((p) => nameSimilarity(row.rawName, p.playerName) >= MATCH_THRESHOLD)).length;

  // Greedy one-to-one assignment by highest similarity.
  const pairs = groupRows
    .flatMap((row) => team.players.map((p) => ({ row, player: p, sim: nameSimilarity(row.rawName, p.playerName) })))
    .sort((a, b) => b.sim - a.sim);
  const taken = new Set<string>();
  const assigned = new Map<string, { uId: string; sim: number }>();
  for (const { row, player, sim } of pairs) {
    if (sim < MATCH_THRESHOLD * 0.8 || assigned.has(row.id) || taken.has(player.uId)) continue;
    assigned.set(row.id, { uId: player.uId, sim });
    taken.add(player.uId);
  }

  // Stylized/non-Latin names often OCR badly; if exactly one row and one
  // known player are left over in a confidently matched team, pair them.
  // A team can know more than 4 players (subs from other matches), so this
  // only fires when the leftover is unambiguous.
  const leftRows = groupRows.filter((r) => !assigned.has(r.id));
  const leftPlayers = team.players.filter((p) => !taken.has(p.uId));
  if (bestScore >= 2 && leftRows.length === 1 && leftPlayers.length === 1) {
    const sim = nameSimilarity(leftRows[0].rawName, leftPlayers[0].playerName);
    assigned.set(leftRows[0].id, { uId: leftPlayers[0].uId, sim });
  }

  return groupRows.map((r) => {
    const a = assigned.get(r.id);
    return { ...r, teamId: team.teamId, uId: a?.uId, similarity: a?.sim ?? 0 };
  });
}
