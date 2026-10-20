import React, { useCallback, useEffect, useMemo, useRef, useState, ChangeEvent } from 'react';
import { FaImage, FaTimes, FaExclamationTriangle } from 'react-icons/fa';
import api from '../login/api';
import { ImportResultView, MatchCsvImportResult, Stat } from './MatchDataCsvImport';
import { useTournamentMatches } from './useTournamentMatches';
import { matchRowsToTeams, pairRowsWithTeam, parseScreenshotWords } from './screenshotScan/parseResults';
import type { DirectoryTeam, OcrRow } from './screenshotScan/types';

// ── MatchData screenshot import ──────────────────────────────────────────────
// Reads result screenshots in the browser (Tesseract, ported from imageResize),
// matches every OCR'd name to a known player of this match's teams — names +
// UIDs come from GET /matchdata/:id/uid-directory for the chosen source match
// (or every match in the tournament) — and posts the reviewed rows to the same
// POST /matchdata/:id/import-csv the CSV import uses, rank included.

const PLAYER_ID_FORMAT = /^\d{5,20}$/;

interface ReviewRow extends OcrRow {
  playerName: string;
  uidText: string;
  killsText: string;
}

const inputCls = 'bg-[#0B0C0E] border border-[#24262B] text-[#F4F2EE] font-mono text-[11px] px-2 py-1 outline-none focus-visible:border-[#E11D2E] min-w-0';

const MatchDataScreenshotImportModal: React.FC<{
  matchDataId: string;
  tournamentId?: string;
  matchId?: string;
  onClose: () => void;
  onImported: (result: MatchCsvImportResult) => void;
}> = ({ matchDataId, tournamentId, matchId, onClose, onImported }) => {
  const { options: matchOptions } = useTournamentMatches(tournamentId, matchId);
  const [source, setSource] = useState('all');
  const [directory, setDirectory] = useState<DirectoryTeam[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [dirError, setDirError] = useState<string | null>(null);

  // Rows as OCR'd (before matching), kept to re-match when the source changes.
  const rawRowsRef = useRef<OcrRow[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [groupRanks, setGroupRanks] = useState<Record<string, string>>({});
  const [shotCount, setShotCount] = useState(0);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<MatchCsvImportResult | null>(null);

  const teamById = useMemo(() => new Map(directory.map(t => [t.teamId, t])), [directory]);
  const directoryRef = useRef(directory);
  directoryRef.current = directory;

  const toReview = useCallback((matched: OcrRow[], dir: DirectoryTeam[]): ReviewRow[] =>
    matched.map(r => {
      const known = dir.find(t => t.teamId === r.teamId)?.players.find(p => p.uId === r.uId);
      return { ...r, playerName: known?.playerName || r.rawName, uidText: r.uId || '', killsText: String(r.kills) };
    }), []);

  // Directory for the chosen source. A new directory re-matches every row
  // (hand edits are reset — the UIDs they picked may not exist any more).
  useEffect(() => {
    let cancelled = false;
    setDirLoading(true);
    setDirError(null);
    api.get(`/matchdata/${matchDataId}/uid-directory`, { params: { source } })
      .then(({ data }) => {
        if (cancelled) return;
        const dir: DirectoryTeam[] = Array.isArray(data?.teams) ? data.teams : [];
        setDirectory(dir);
        setRows(toReview(matchRowsToTeams(rawRowsRef.current, dir), dir));
      })
      .catch((err: any) => { if (!cancelled) setDirError(err?.response?.data?.error || 'Could not load player UIDs'); })
      .finally(() => { if (!cancelled) setDirLoading(false); });
    return () => { cancelled = true; };
  }, [matchDataId, source, toReview]);

  const scanFiles = useCallback(async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setScanError(null);
    setResult(null);
    try {
      // Loaded on first scan only — keeps Tesseract out of the panel's bundle.
      const { recognizeScreenshot } = await import('./screenshotScan/ocr');
      const fresh: OcrRow[] = [];
      for (let i = 0; i < images.length; i++) {
        setScanStatus(`Reading screenshot ${i + 1} of ${images.length}…`);
        const { words, width } = await recognizeScreenshot(images[i]);
        fresh.push(...parseScreenshotWords(words, width, `shot${Date.now()}-${i}`));
      }
      if (fresh.length === 0) {
        setScanError('No player rows found — use the results screen screenshot (name + "N eliminations" lines).');
        return;
      }
      const dir = directoryRef.current;
      const matched = matchRowsToTeams(fresh, dir);
      rawRowsRef.current = [...rawRowsRef.current, ...fresh];
      setRows(prev => [...prev, ...toReview(matched, dir)]);
      setGroupRanks(prev => {
        const next = { ...prev };
        fresh.forEach(r => { if (r.rank != null && next[r.groupKey] === undefined) next[r.groupKey] = String(r.rank); });
        return next;
      });
      setShotCount(c => c + images.length);
    } catch (err: any) {
      setScanError(err?.message || 'Could not read the screenshot');
    } finally {
      setScanStatus(null);
    }
  }, [toReview]);

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    scanFiles(files);
  };

  // Ctrl+V a screenshot straight from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []);
      if (files.some(f => f.type.startsWith('image/'))) {
        e.preventDefault();
        scanFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [scanFiles]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byKey = new Map<string, ReviewRow[]>();
    rows.forEach(r => {
      if (!byKey.has(r.groupKey)) { byKey.set(r.groupKey, []); order.push(r.groupKey); }
      byKey.get(r.groupKey)!.push(r);
    });
    return order.map(key => ({ key, rows: byKey.get(key)! }));
  }, [rows]);

  const updateRow = (id: string, patch: Partial<ReviewRow>) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const pickPlayer = (row: ReviewRow, uId: string) => {
    const known = teamById.get(row.teamId || '')?.players.find(p => p.uId === uId);
    updateRow(row.id, known ? { uId, uidText: uId, playerName: known.playerName } : { uId: undefined, uidText: '', playerName: row.rawName });
  };

  const pickTeam = (groupKey: string, teamId: string) => {
    const team = teamById.get(teamId);
    setRows(prev => {
      const groupRows = prev.filter(r => r.groupKey === groupKey);
      const repaired = team
        ? toReview(pairRowsWithTeam(groupRows, team), directory)
        : groupRows.map(r => ({ ...r, teamId: undefined, uId: undefined, uidText: '', playerName: r.rawName }));
      const byId = new Map(repaired.map(r => [r.id, r]));
      return prev.map(r => byId.get(r.id) || r);
    });
  };

  const removeGroup = (groupKey: string) => {
    rawRowsRef.current = rawRowsRef.current.filter(r => r.groupKey !== groupKey);
    setRows(prev => prev.filter(r => r.groupKey !== groupKey));
  };

  // Why each row can't be imported yet ('' = ready). A UID seen on an earlier
  // row (overlapping screenshots) is a duplicate, not an error.
  const problems = useMemo(() => {
    const seen = new Set<string>();
    const out = new Map<string, string>();
    rows.forEach(r => {
      const uid = r.uidText.trim();
      let problem = '';
      if (!r.teamId || !teamById.has(r.teamId)) problem = 'pick a team';
      else if (!PLAYER_ID_FORMAT.test(uid)) problem = 'needs a UID';
      else if (!/^\d+$/.test(r.killsText.trim())) problem = 'kills must be a number';
      else if (!r.playerName.trim()) problem = 'needs a name';
      else if (seen.has(uid)) problem = 'duplicate — skipped';
      if (!problem) seen.add(uid);
      out.set(r.id, problem);
    });
    return out;
  }, [rows, teamById]);

  const readyRows = rows.filter(r => !problems.get(r.id));

  const handleImport = useCallback(async () => {
    if (importing || readyRows.length === 0) return;
    setImporting(true);
    setImportError(null);
    try {
      const payload = readyRows.map(r => {
        const team = teamById.get(r.teamId!)!;
        return {
          teamName: team.teamName,
          teamTag: team.teamTag,
          playerName: r.playerName.trim(),
          playerUid: r.uidText.trim(),
          kills: r.killsText.trim(),
          rank: (groupRanks[r.groupKey] || '').trim(),
        };
      });
      const { data } = await api.post(`/matchdata/${matchDataId}/import-csv`, { rows: payload });
      setResult(data);
      onImported(data);
    } catch (err: any) {
      setImportError(err?.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [importing, readyRows, teamById, groupRanks, matchDataId, onImported]);

  const sourceLabel = (s: string) => (s === 'current' ? 'this match' : s === 'roster' ? 'team roster' : '');

  return (
    <div className="fixed inset-0 z-[200] bg-[#0B0C0E]/92 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[92vh] bg-[#131418] border border-[#24262B] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-[#0F1013] border-b border-[#24262B] shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-[#E11D2E] border border-[#E11D2E]/35 bg-[#E11D2E]/[0.06] px-2 py-1">SCAN</span>
            <div className="font-display font-bold text-base text-[#F4F2EE] uppercase">Import from screenshot</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center border border-[#24262B] text-[#55565C] hover:border-[#E11D2E]/50 hover:text-[#E11D2E]">
            <FaTimes size={13} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {result ? (
            <ImportResultView result={result} onClose={onClose} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[9px] tracking-[0.18em] text-[#55565C] uppercase">Take UIDs from</span>
                <select
                  value={source}
                  onChange={e => setSource(e.target.value)}
                  className="bg-[#0B0C0E] border border-[#24262B] text-[#E11D2E] font-mono text-[10px] font-bold px-3 py-1.5 outline-none focus-visible:border-[#E11D2E]"
                >
                  <option value="all">ALL MATCHES IN TOURNAMENT</option>
                  {matchOptions.map(m => <option key={m._id} value={m._id}>{m.label}</option>)}
                </select>
                {dirLoading && <span className="font-mono text-[10px] text-[#55565C]">loading UIDs…</span>}
                {!dirLoading && !dirError && (
                  <span className="font-mono text-[10px] text-[#55565C]">
                    {directory.reduce((s, t) => s + t.players.length, 0)} known players
                  </span>
                )}
              </div>
              {dirError && <p className="text-[13px] text-[#E11D2E] mt-2">{dirError}</p>}

              <label htmlFor="matchdata-shot-file" className="flex flex-col items-center gap-2 mt-4 px-4 py-7 border border-dashed border-[#24262B] cursor-pointer hover:border-[#E11D2E]/50">
                <FaImage size={18} className="text-[#E11D2E]" />
                <span className="text-sm font-semibold text-[#F4F2EE]">
                  {scanStatus || (shotCount ? `${shotCount} screenshot${shotCount === 1 ? '' : 's'} read — add more` : 'Click to choose result screenshots, or paste one (Ctrl+V)')}
                </span>
                <span className="font-mono text-[10px] text-[#55565C] text-center">
                  results screen · rank · player name · N eliminations
                </span>
              </label>
              <input id="matchdata-shot-file" type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} disabled={!!scanStatus} />

              <p className="text-[12px] text-[#93959C] mt-3">
                Each name on the screenshot is matched to a known player of that team, and the UID is filled in from the match you pick above. Check the rows below, fix anything that's wrong, then import. The rank sets the team's rank and place points.
              </p>
              {scanError && <p className="text-[13px] text-[#E11D2E] mt-3">{scanError}</p>}

              {rows.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <Stat label="Rows" value={rows.length} />
                    <Stat label="Ready" value={readyRows.length} />
                    {rows.length > readyRows.length && <Stat label="Need a look" value={rows.length - readyRows.length} accent />}
                  </div>

                  <div className="flex flex-col gap-3 mt-4">
                    {groups.map(group => {
                      const teamId = group.rows[0].teamId || '';
                      const team = teamById.get(teamId);
                      return (
                        <div key={group.key} className="bg-[#0F1013] border border-[#24262B]">
                          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[#24262B]">
                            <span className="font-mono text-[9px] tracking-wider text-[#55565C] uppercase">Rank</span>
                            <input
                              value={groupRanks[group.key] ?? ''}
                              onChange={e => setGroupRanks(prev => ({ ...prev, [group.key]: e.target.value.replace(/\D/g, '') }))}
                              className={`${inputCls} w-12 text-center`}
                              aria-label="Team rank"
                            />
                            <select
                              value={teamId}
                              onChange={e => pickTeam(group.key, e.target.value)}
                              className={`${inputCls} flex-1 ${team ? '' : 'border-[#E11D2E]/60'}`}
                              aria-label="Team"
                            >
                              <option value="">— pick team —</option>
                              {directory.map(t => (
                                <option key={t.teamId} value={t.teamId}>S{t.slot ?? '-'} · {t.teamTag || t.teamName} — {t.teamName}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => removeGroup(group.key)}
                              className="font-mono text-[9px] px-2 py-1 border border-[#24262B] text-[#55565C] hover:border-[#E11D2E]/50 hover:text-[#E11D2E]"
                            >
                              REMOVE
                            </button>
                          </div>

                          <div className="flex flex-col">
                            {group.rows.map(row => {
                              const problem = problems.get(row.id);
                              return (
                                <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_52px] gap-2 items-center px-3 py-1.5 border-b border-[#24262B]/60 last:border-b-0">
                                  <div className="min-w-0">
                                    <div className="font-mono text-[10px] text-[#55565C] truncate" title={row.rawName}>read: {row.rawName}</div>
                                    <input
                                      value={row.playerName}
                                      onChange={e => updateRow(row.id, { playerName: e.target.value })}
                                      className={`${inputCls} w-full mt-0.5`}
                                      aria-label="Player name"
                                    />
                                  </div>
                                  <select
                                    value={row.uId && team?.players.some(p => p.uId === row.uId) ? row.uId : ''}
                                    onChange={e => pickPlayer(row, e.target.value)}
                                    className={`${inputCls} w-full`}
                                    disabled={!team}
                                    aria-label="Matched player"
                                  >
                                    <option value="">— no match —</option>
                                    {(team?.players || []).map(p => (
                                      <option key={p.uId} value={p.uId}>
                                        {p.playerName} ({p.uId}){p.source === 'match' && p.matchNo != null ? ` · M${p.matchNo}` : sourceLabel(p.source) ? ` · ${sourceLabel(p.source)}` : ''}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="min-w-0">
                                    <input
                                      value={row.uidText}
                                      onChange={e => updateRow(row.id, { uidText: e.target.value.replace(/\s/g, '') })}
                                      placeholder="UID"
                                      className={`${inputCls} w-full ${problem === 'needs a UID' ? 'border-[#E11D2E]/60' : ''}`}
                                      aria-label="Player UID"
                                    />
                                    {problem && <div className="font-mono text-[9px] text-[#E11D2E] mt-0.5">{problem}</div>}
                                  </div>
                                  <input
                                    value={row.killsText}
                                    onChange={e => updateRow(row.id, { killsText: e.target.value.replace(/\D/g, '') })}
                                    className={`${inputCls} w-full text-center`}
                                    aria-label="Kills"
                                    title="Kills"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {importError && <p className="text-[13px] text-[#E11D2E] mt-4">{importError}</p>}
                  {rows.length > readyRows.length && (
                    <div className="flex items-start gap-2 mt-4 px-3 py-2 bg-[#E11D2E]/10 border border-[#E11D2E]/30">
                      <FaExclamationTriangle className="text-[#E11D2E] shrink-0 mt-0.5" size={11} />
                      <span className="text-[12px] text-[#F4F2EE]">Rows marked in red are left out of the import until they're fixed.</span>
                    </div>
                  )}

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
                      disabled={readyRows.length === 0 || importing || !!scanStatus}
                      className="flex-1 flex items-center justify-center py-3 bg-[#E11D2E] hover:bg-[#8C1220] disabled:opacity-40 disabled:cursor-not-allowed text-white font-display font-bold text-[12px] tracking-wide"
                    >
                      {importing ? 'IMPORTING…' : `IMPORT ${readyRows.length} PLAYER${readyRows.length === 1 ? '' : 'S'}`}
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

export default MatchDataScreenshotImportModal;
