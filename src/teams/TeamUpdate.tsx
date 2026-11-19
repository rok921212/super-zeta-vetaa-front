// Public team page (/team-update, no login). A team opens itself with the
// event code the organiser gave it, changes its name, tag, logo, flag,
// players and photos, says which team is sending the change, and sends it.
// Nothing goes live until the organiser approves it from the notification
// bell (backend publicTeams.controller.js). Nothing can be deleted here:
// players already on the team stay.

import React, { Suspense, lazy, useCallback, useRef, useState } from 'react';
import FlagPicker from '../components/FlagPicker';
import api from '../login/api.tsx';
import { uploadToCloudinary } from '../utils/cloudinaryUpload.tsx';
import type { ImageKind } from '../utils/imagePrep';

// The same image studio as the organiser's team form: background removal
// (AI or colour key), mark / erase, crop, resize, all on this computer; only
// the finished picture is uploaded. Loaded when a picture is picked.
const ImageStudio = lazy(() => import('../dashboard/imageStudio/ImageStudio'));

/** Where a finished picture goes. */
type Slot = { kind: 'logo' } | { kind: 'flag' } | { kind: 'photo'; i: number } | { kind: 'pose'; i: number };

interface PlayerRow { playerName: string; playerId: string; photo: string; photos: string[]; locked: boolean }
interface Loaded {
  tournamentName: string;
  tournamentLogo: string;
  slot: number | null;
  groupName: string | null;
  team: { teamFullName: string; teamTag: string; logo: string; teamFlag: string; players: Omit<PlayerRow, 'locked'>[] };
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
.tu-page { min-height: 100vh; background: #0B0C0E; color: #F4F2EE; font-family: 'Inter', sans-serif; padding: 40px 16px 64px; }
.tu-wrap { max-width: 760px; margin: 0 auto; }
.tu-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .14em; color: #E11D2E; text-transform: uppercase; }
.tu-h1 { font-family: 'Space Grotesk', sans-serif; font-size: 28px; font-weight: 800; text-transform: uppercase; margin: 8px 0 6px; }
.tu-sub { color: #93959C; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
.tu-card { background: #131418; border: 1px solid #24262B; padding: 20px; margin-bottom: 16px; }
.tu-label { display: block; font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: .1em; color: #93959C; text-transform: uppercase; margin-bottom: 6px; }
.tu-input { width: 100%; box-sizing: border-box; padding: 10px 12px; background: #0B0C0E; border: 1px solid #24262B; color: #F4F2EE; font-size: 14px; outline: none; }
.tu-input:focus { border-color: #E11D2E; }
.tu-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.tu-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 18px; background: #E11D2E; border: 1px solid #E11D2E; color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; letter-spacing: .08em; cursor: pointer; }
.tu-btn:disabled { opacity: .5; cursor: not-allowed; }
.tu-btn.ghost { background: transparent; color: #F4F2EE; border-color: #24262B; }
.tu-btn.ghost:hover { border-color: #E11D2E; }
.tu-err { color: #FCA5A5; font-size: 13px; margin-top: 10px; }
.tu-ok { border-color: rgba(74,222,128,.5); color: #4ADE80; }
.tu-img { display: flex; align-items: center; gap: 12px; }
.tu-img img { width: 56px; height: 56px; object-fit: contain; background: #0B0C0E; border: 1px solid #24262B; }
.tu-player { border: 1px solid #24262B; padding: 12px; margin-bottom: 10px; display: grid; grid-template-columns: 1fr 140px; gap: 10px; }
.tu-photos { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.tu-photo { position: relative; }
.tu-photo img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid #24262B; display: block; }
.tu-photo.main img { border-color: #E11D2E; }
.tu-photo button { position: absolute; top: -4px; right: -4px; width: 16px; height: 16px; border-radius: 50%; border: none; background: #E11D2E; color: #fff; font-size: 10px; line-height: 1; cursor: pointer; padding: 0; }
.tu-file { display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border: 1px dashed #24262B; color: #93959C; font-size: 12px; cursor: pointer; }
.tu-file:hover { border-color: #E11D2E; color: #F4F2EE; }
.tu-file input { display: none; }
button.tu-file { background: none; font-family: inherit; }
.tu-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.tu-chip { font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 4px 8px; border: 1px solid #24262B; color: #93959C; }
@media (max-width: 560px) { .tu-row, .tu-player { grid-template-columns: 1fr; } }
`;

const FileButton: React.FC<{ label: string; onFile: (f: File) => void }> = ({ label, onFile }) => (
  <label className="tu-file" title="Pick a picture: remove the background, crop and resize before it is sent">
    {label}
    <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
  </label>
);

const TeamUpdate: React.FC = () => {
  const [code, setCode] = useState('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [logo, setLogo] = useState('');
  const [flag, setFlag] = useState('');
  const [flagPickerOpen, setFlagPickerOpen] = useState(false);
  const closeFlagPicker = useCallback(() => setFlagPickerOpen(false), []);
  const flagFileRef = useRef<HTMLInputElement>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [submitter, setSubmitter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [studio, setStudio] = useState<{ file: File; slot: Slot; key: number } | null>(null);
  const edit = (file: File, slot: Slot) => setStudio({ file, slot, key: Date.now() });

  const open = async () => {
    setError(null);
    setBusy('open');
    try {
      const { data } = await api.post('/public/team-edits/lookup', { code: code.trim() });
      const d = data as Loaded;
      setLoaded(d);
      setName(d.team.teamFullName);
      setTag(d.team.teamTag);
      setLogo(d.team.logo);
      setFlag(d.team.teamFlag);
      setPlayers(d.team.players.map(p => ({ ...p, photos: p.photos || [], locked: true })));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not open the team. Check your connection.');
    } finally {
      setBusy(null);
    }
  };

  const setPlayer = useCallback((i: number, patch: Partial<PlayerRow> | ((p: PlayerRow) => Partial<PlayerRow>)) =>
    setPlayers(prev => prev.map((p, j) => (j === i ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p))), []);

  // The studio's finished picture: uploaded, then put where it was picked for.
  const uploadFinished = useCallback(async (slot: Slot, blob: Blob, filename: string) => {
    if (slot.kind === 'logo') setLogo(await uploadToCloudinary(blob, 'teams/logos', 'team_logo', filename));
    else if (slot.kind === 'flag') setFlag(await uploadToCloudinary(blob, 'teams/flags', 'team_flag', filename));
    else {
      const url = await uploadToCloudinary(blob, 'players/photos', 'player_photo', filename);
      if (slot.kind === 'photo') setPlayer(slot.i, { photo: url });
      else setPlayer(slot.i, p => ({ photos: [...p.photos.filter(u => u !== url), url].slice(0, 8) }));
    }
  }, [setPlayer]);

  const studioKind = (slot: Slot): ImageKind => (slot.kind === 'logo' ? 'logo' : slot.kind === 'flag' ? 'flag' : 'player');
  const studioTitle = (slot: Slot) => (slot.kind === 'logo' ? 'Team logo' : slot.kind === 'flag' ? 'Team flag'
    : `${players[slot.i]?.playerName || 'Player'} · ${slot.kind === 'pose' ? 'extra pose' : 'photo'}`);

  const send = async () => {
    setError(null);
    if (submitter.trim().length < 2) { setError('Enter your own team name: who is sending this change.'); return; }
    if (players.some(p => !p.playerName.trim() || !/^\d{5,20}$/.test(p.playerId.trim()))) {
      setError('Every player needs a name and a game ID (digits only).');
      return;
    }
    setBusy('send');
    try {
      const { data } = await api.post('/public/team-edits', {
        code: code.trim(),
        submitterTeamName: submitter.trim(),
        changes: {
          teamFullName: name.trim(),
          teamTag: tag.trim(),
          logo,
          teamFlag: flag,
          players: players.map(({ locked, ...p }) => ({ ...p, playerName: p.playerName.trim(), playerId: p.playerId.trim() })),
        },
      });
      setSent(data?.message || 'Sent for approval.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Sending failed. Check your connection.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="tu-page">
      <style>{CSS}</style>
      <div className="tu-wrap">
        <div className="tu-eyebrow">Team update</div>
        <h1 className="tu-h1">Update your team</h1>
        <p className="tu-sub">
          Enter the event code your organiser gave your team. Changes are checked by the organiser before they go live.
          Changing another team's information is not allowed and is logged.
        </p>

        {sent ? (
          <div className="tu-card tu-ok">{sent}</div>
        ) : !loaded ? (
          <div className="tu-card">
            <label className="tu-label" htmlFor="tu-code">Event code</label>
            <input id="tu-code" className="tu-input" value={code} autoComplete="off" spellCheck={false} maxLength={10}
              onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && code.trim().length === 10) void open(); }}
              placeholder="10 characters" style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.12em' }} />
            <div style={{ marginTop: 14 }}>
              <button className="tu-btn" disabled={code.trim().length !== 10 || busy === 'open'} onClick={() => void open()}>
                {busy === 'open' ? 'Opening…' : 'Open my team'}
              </button>
            </div>
            {error && <div className="tu-err">{error}</div>}
          </div>
        ) : (
          <>
            <div className="tu-meta">
              <span className="tu-chip">{loaded.tournamentName}</span>
              {loaded.groupName && <span className="tu-chip">{loaded.groupName}</span>}
              {loaded.slot != null && <span className="tu-chip">Slot {loaded.slot}</span>}
            </div>

            <div className="tu-card">
              <div className="tu-row">
                <div><label className="tu-label">Team name</label><input className="tu-input" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></div>
                <div><label className="tu-label">Team tag</label><input className="tu-input" value={tag} maxLength={20} onChange={e => setTag(e.target.value)} /></div>
              </div>
              <div className="tu-row" style={{ marginTop: 14 }}>
                <div>
                  <label className="tu-label">Logo</label>
                  <div className="tu-img">
                    {logo && <img src={logo} alt="" />}
                    <FileButton label={logo ? 'Change logo' : 'Upload logo'} onFile={f => edit(f, { kind: 'logo' })} />
                  </div>
                </div>
                <div>
                  <label className="tu-label">Flag</label>
                  <div className="tu-img">
                    {flag && <img src={flag} alt="" />}
                    <button type="button" className="tu-file" onClick={() => setFlagPickerOpen(true)} title="Search a country flag, or upload your own picture">
                      {flag ? 'Change flag' : 'Upload flag'}
                    </button>
                    <input ref={flagFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/avif" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) edit(f, { kind: 'flag' }); }} />
                    <FlagPicker open={flagPickerOpen} onClose={closeFlagPicker} onPicked={url => setFlag(url)} onUploadOwn={() => flagFileRef.current?.click()} />
                  </div>
                </div>
              </div>
            </div>

            <div className="tu-card">
              <label className="tu-label">Players</label>
              {players.map((p, i) => (
                <div className="tu-player" key={i}>
                  <input className="tu-input" value={p.playerName} placeholder="Player name" maxLength={60} onChange={e => setPlayer(i, { playerName: e.target.value })} />
                  <input className="tu-input" value={p.playerId} placeholder="Game ID" disabled={p.locked} title={p.locked ? 'The game ID of an existing player cannot change here' : ''}
                    onChange={e => setPlayer(i, { playerId: e.target.value.replace(/\D/g, '') })} />
                  <div className="tu-photos">
                    {p.photo && <span className="tu-photo main" title="Main photo"><img src={p.photo} alt="" /></span>}
                    {p.photos.map(u => (
                      <span className="tu-photo" key={u} title="Extra pose">
                        <img src={u} alt="" />
                        <button type="button" aria-label="Remove pose" onClick={() => setPlayer(i, { photos: p.photos.filter(x => x !== u) })}>×</button>
                      </span>
                    ))}
                    <FileButton label={p.photo ? 'Change main photo' : 'Add photo'} onFile={f => edit(f, { kind: 'photo', i })} />
                    {p.photo && p.photos.length < 8 && (
                      <FileButton label="+ Another pose" onFile={f => edit(f, { kind: 'pose', i })} />
                    )}
                    {!p.locked && (
                      <button type="button" className="tu-btn ghost" style={{ padding: '6px 10px' }} onClick={() => setPlayers(prev => prev.filter((_, j) => j !== i))}>Remove new player</button>
                    )}
                  </div>
                </div>
              ))}
              <button type="button" className="tu-btn ghost" disabled={players.length >= 100}
                onClick={() => setPlayers(prev => [...prev, { playerName: '', playerId: '', photo: '', photos: [], locked: false }])}>
                + Add player
              </button>
            </div>

            <div className="tu-card">
              <label className="tu-label" htmlFor="tu-who">Your team name (who is making this change)</label>
              <input id="tu-who" className="tu-input" value={submitter} maxLength={80} onChange={e => setSubmitter(e.target.value)} placeholder="e.g. your team's full name" />
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button className="tu-btn" disabled={busy === 'send' || !!busy} onClick={() => void send()}>
                  {busy === 'send' ? 'Sending…' : 'Send for approval'}
                </button>
                <button className="tu-btn ghost" onClick={() => { setLoaded(null); setError(null); }}>Use another code</button>
              </div>
              {error && <div className="tu-err">{error}</div>}
            </div>
          </>
        )}
      </div>
      {studio && (
        <Suspense fallback={<div className="tu-card" style={{ position: 'fixed', inset: 'auto 16px 16px auto', zIndex: 50 }}>Opening the image editor…</div>}>
          <ImageStudio
            key={studio.key}
            title={studioTitle(studio.slot)}
            initialFiles={[studio.file]}
            kind={studioKind(studio.slot)}
            uploadOne={(_target, _kind, blob, filename) => uploadFinished(studio.slot, blob, filename)}
            onClose={() => setStudio(null)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default TeamUpdate;
