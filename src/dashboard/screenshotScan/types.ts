/** One known player of a team, from GET /matchdata/:id/uid-directory. */
export interface DirectoryPlayer {
  playerName: string;
  uId: string;
  source: 'current' | 'match' | 'roster';
  matchNo?: number | null;
}

/** A team of the current match with every name + UID known for it. */
export interface DirectoryTeam {
  teamId: string;
  teamName: string;
  teamTag: string;
  slot: number | null;
  players: DirectoryPlayer[];
}

/** A player line read from a result screenshot. */
export interface OcrRow {
  id: string;
  rawName: string;
  kills: number;
  rank?: number;
  /** Rows from the same team block on the screenshot share a groupKey. */
  groupKey: string;
  /** Best guess (or user choice) of which team / known player this row is. */
  teamId?: string;
  uId?: string;
  similarity: number;
}
