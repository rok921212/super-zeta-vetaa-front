import React, { useCallback, useMemo, useState, ChangeEvent } from 'react';
import Papa from 'papaparse';
import { FaUpload, FaTimes, FaExclamationTriangle } from 'react-icons/fa';
import api from '../login/api';

// ── MatchData CSV import ─────────────────────────────────────────────────────
// One row per player: team_name,team_tag,playerName,playerUID,player_kills.
// Parsed here, applied by POST /matchdata/:matchDataId/import-csv — the UID is
// the key: a player already in the match is overwritten, one that isn't is
// added to the row's team (and to that team's roster on the Teams page).

// Same rule as the backend (utils/matchDataCsvImport.js PLAYER_ID_FORMAT).
const CSV_PLAYER_ID_FORMAT = /^\d{5,20}$/;
const MAX_ROWS = 500;

// Headers are compared lowercased with everything but letters/digits removed,
// so playerName / player_name / "Player Name" are all the same column.
const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
const COLUMN_ALIASES = {
  teamName: ['teamname', 'team'],
  teamTag: ['teamtag', 'tag'],
  playerName: ['playername', 'name'],
  playerUid: ['playeruid', 'uid', 'playerid'],
  kills: ['playerkills', 'kills', 'killnum'],
} as const;
type ColumnKey = keyof typeof COLUMN_ALIASES;

interface ImportRow {
  teamName: string;
  teamTag: string;
  playerName: string;
  playerUid: string;
  kills: string;
}

export interface MatchCsvImportResult {
  updatedCount: number;
  addedCount: number;
  replacedCount: number;
  catalogAddedCount: number;
  skipped: { row: number; teamTag: string; playerName: string; playerUid: string; reason: string; message: string }[];
  catalogSkipped: { row: number; playerUid: string; playerName: string; message: string }[];
  notes: { row: number; message: string }[];
  teams: { teamId: string; teamName: string; players: any[] }[];
  liveActive: boolean;
}

const Stat: React.FC<{ label: string; value: number; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="flex flex-col gap-0.5 bg-[#0B0C0E] border border-[#24262B] px-4 py-2.5 min-w-[88px]">
    <span className={`font-mono text-xl font-extrabold tabular-nums ${accent ? 'text-[#E11D2E]' : 'text-[#F4F2EE]'}`}>{value}</span>
    <span className="font-mono text-[9px] tracking-[0.15em] text-[#55565C] uppercase">{label}</span>
  </div>
);

const MatchDataCsvImportModal: React.FC<{
  matchDataId: string;
  onClose: () => void;
  onImported: (result: MatchCsvImportResult) => void;
}> = ({ matchDataId, onClose, onImported }) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<MatchCsvImportResult | null>(null);

  const teamCount = useMemo(
    () => new Set(rows.map(r => (r.teamTag || r.teamName).toLowerCase())).size,
    [rows]
  );

  const handleFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after fixing it
    if (!file) return;

    setFileName(file.name);
    setParsing(true);
    setParseError(null);
    setRows([]);
    setWarnings([]);
    setResult(null);
    setImportError(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader,
      complete: (results) => {
        setParsing(false);
        const fields = results.meta.fields || [];
        const column = {} as Record<ColumnKey, string | undefined>;
        (Object.keys(COLUMN_ALIASES) as ColumnKey[]).forEach(key => {
          column[key] = COLUMN_ALIASES[key].find(alias => fields.includes(alias));
        });
        if (!column.playerUid || (!column.teamTag && !column.teamName)) {
          setParseError('CSV needs a playerUID column and a team_tag (or team_name) column.');
          return;
        }

        const cell = (raw: Record<string, string>, key: ColumnKey) =>
          (column[key] ? String(raw[column[key] as string] ?? '') : '').trim();

        const parsedRows: ImportRow[] = [];
        const parsedWarnings: string[] = [];
        results.data.forEach((raw, i) => {
          const rowNum = i + 2; // +1 for 0-index, +1 for the header row
          const row: ImportRow = {
            teamName: cell(raw, 'teamName'),
            teamTag: cell(raw, 'teamTag'),
            playerName: cell(raw, 'playerName'),
            playerUid: cell(raw, 'playerUid'),
            kills: cell(raw, 'kills'),
          };
          if (!CSV_PLAYER_ID_FORMAT.test(row.playerUid)) {
            parsedWarnings.push(`Row ${rowNum}: playerUID "${row.playerUid}" isn't a valid UID (digits only, 5-20 chars) — will be skipped`);
          } else if (row.kills && !/^\d+$/.test(row.kills)) {
            parsedWarnings.push(`Row ${rowNum}: player_kills "${row.kills}" isn't a whole number — will be skipped`);
          }
          // Sent as-is: the server numbers skipped rows by position in this list.
          parsedRows.push(row);
        });

        if (parsedRows.length > MAX_ROWS) {
          setParseError(`CSV has ${parsedRows.length} rows — the limit is ${MAX_ROWS} per import.`);
          return;
        }
        setRows(parsedRows);
        setWarnings(parsedWarnings);
      },
      error: (err: Error) => {
        setParsing(false);
        setParseError(err.message || 'Failed to parse CSV file');
      },
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (importing || rows.length === 0) return;
    setImporting(true);
    setImportError(null);
    try {
      const { data } = await api.post(`/matchdata/${matchDataId}/import-csv`, { rows });
      setResult(data);
      onImported(data);
    } catch (err: any) {
      setImportError(err?.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [importing, rows, matchDataId, onImported]);

  return (
    <div className="fixed inset-0 z-[200] bg-[#0B0C0E]/92 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[92vh] bg-[#131418] border border-[#24262B] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-[#0F1013] border-b border-[#24262B] shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-[#E11D2E] border border-[#E11D2E]/35 bg-[#E11D2E]/[0.06] px-2 py-1">CSV</span>
            <div className="font-display font-bold text-base text-[#F4F2EE] uppercase">Import match data</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center border border-[#24262B] text-[#55565C] hover:border-[#E11D2E]/50 hover:text-[#E11D2E]">
            <FaTimes size={13} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {result ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Stat label="Updated" value={result.updatedCount} />
                <Stat label="Added" value={result.addedCount} />
                {result.replacedCount > 0 && <Stat label="Replaced" value={result.replacedCount} />}
                <Stat label="New in teams" value={result.catalogAddedCount} />
                {result.skipped.length > 0 && <Stat label="Skipped" value={result.skipped.length} accent />}
              </div>

              {result.liveActive && (
                <div className="flex items-start gap-2 mt-4 px-3 py-2 bg-[#E11D2E]/10 border border-[#E11D2E]/30">
                  <FaExclamationTriangle className="text-[#E11D2E] shrink-0 mt-0.5" size={11} />
                  <span className="text-[12px] text-[#F4F2EE]">
                    This match has live data in memory. The next live update or SAVE DATA will overwrite the imported values — import again after Fetch Data is off.
                  </span>
                </div>
              )}

              {result.skipped.length > 0 && (
                <ul className="mt-4 space-y-1">
                  {result.skipped.map((s, i) => (
                    <li key={i} className="text-[12px] text-[#93959C]">
                      <span className="font-mono text-[#E11D2E]">Row {s.row}</span>
                      {' '}{s.playerName || s.playerUid}: {s.message}
                    </li>
                  ))}
                </ul>
              )}

              {(result.catalogSkipped.length > 0 || result.notes.length > 0) && (
                <ul className="mt-4 space-y-1">
                  {result.catalogSkipped.map((s, i) => (
                    <li key={`c${i}`} className="text-[12px] text-[#93959C]">
                      <span className="font-mono text-[#55565C]">Row {s.row}</span> {s.playerName}: {s.message}
                    </li>
                  ))}
                  {result.notes.map((n, i) => (
                    <li key={`n${i}`} className="text-[12px] text-[#93959C]">
                      <span className="font-mono text-[#55565C]">Row {n.row}</span> {n.message}
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full flex items-center justify-center mt-6 py-3 bg-[#E11D2E] hover:bg-[#8C1220] text-white font-display font-bold text-[12px] tracking-wide"
              >
                DONE
              </button>
            </>
          ) : (
            <>
              <label htmlFor="matchdata-csv-file" className="flex flex-col items-center gap-2 px-4 py-8 border border-dashed border-[#24262B] cursor-pointer hover:border-[#E11D2E]/50">
                <FaUpload size={18} className="text-[#E11D2E]" />
                <span className="text-sm font-semibold text-[#F4F2EE]">{fileName || 'Click to choose a CSV file'}</span>
                <span className="font-mono text-[10px] text-[#55565C] text-center">
                  team_name, team_tag, playerName, playerUID, player_kills
                </span>
              </label>
              <input id="matchdata-csv-file" type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />

              <p className="text-[12px] text-[#93959C] mt-3">
                Players are matched by UID. A player already in this match gets the name and kills from the file; a player who isn't is added to their team here and to that team's roster. A full team (4 players) swaps out players the file doesn't list. Teams that aren't in this match are skipped.
              </p>

              {parsing && <p className="text-[13px] text-[#93959C] mt-4">Parsing…</p>}
              {parseError && <p className="text-[13px] text-[#E11D2E] mt-4">{parseError}</p>}

              {!parsing && !parseError && fileName && (
                <>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <Stat label="Rows" value={rows.length} />
                    <Stat label="Teams" value={teamCount} />
                    {warnings.length > 0 && <Stat label="Warnings" value={warnings.length} accent />}
                  </div>

                  {warnings.length > 0 && (
                    <ul className="mt-4 space-y-1">
                      {warnings.slice(0, 50).map((w, i) => <li key={i} className="text-[12px] text-[#93959C]">{w}</li>)}
                      {warnings.length > 50 && <li className="text-[12px] text-[#55565C]">+{warnings.length - 50} more warnings</li>}
                    </ul>
                  )}

                  {importError && <p className="text-[13px] text-[#E11D2E] mt-4">{importError}</p>}

                  <div className="flex gap-2 mt-6">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-5 py-3 border border-[#24262B] text-[#93959C] hover:border-[#E11D2E]/50 hover:text-[#E11D2E] font-display font-bold text-[12px] tracking-wide"
                    >
                      CANCEL
                    </button>
                    <button
                      type="button"
                      onClick={handleImport}
                      disabled={rows.length === 0 || importing}
                      className="flex-1 flex items-center justify-center py-3 bg-[#E11D2E] hover:bg-[#8C1220] disabled:opacity-40 disabled:cursor-not-allowed text-white font-display font-bold text-[12px] tracking-wide"
                    >
                      {importing ? 'IMPORTING…' : `IMPORT ${rows.length} ROW${rows.length === 1 ? '' : 'S'}`}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MatchDataCsvImportModal;
