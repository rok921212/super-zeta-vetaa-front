// Notification bell (navbar): team changes sent from the public team page
// with an event code, waiting for the tournament owner. Each shows slot,
// team name, tag, the code used, who sent it, and what changed (before →
// after). Approve applies it to the team (and every match it is in); Reject
// drops it. Backend: publicTeams.controller.js.
//
// One request when the page opens, then live: the server pushes
// teamEditRequested / teamEditDecided to this account's socket room.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaBell, FaCheck, FaTimes } from 'react-icons/fa';
import api from '../login/api.tsx';
import { socket } from './socket.tsx';
import { removeCache, teamsListCacheKey } from './cache';

interface EditPlayer { playerName: string; playerId: string; photo?: string; photos?: string[] }
interface TeamEdit {
  id: string;
  teamId: string;
  teamName: string;
  teamTag: string;
  logo: string;
  slot: number | null;
  groupName: string | null;
  code: string;
  submitterTeamName: string;
  changes: { teamFullName?: string; teamTag?: string; logo?: string; teamFlag?: string; players?: EditPlayer[] };
  before: { teamFullName?: string; teamTag?: string; logo?: string; teamFlag?: string; players?: EditPlayer[] };
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

const CSS = `
.teb { position: relative; }
.teb-btn { position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 34px; background: transparent; border: 1px solid #24262B; color: #93959C; cursor: pointer; }
.teb-btn:hover, .teb-btn.on { border-color: #E11D2E; color: #F4F2EE; }
.teb-count { position: absolute; top: -6px; right: -6px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 9px; background: #E11D2E; color: #fff; font: 700 10px/17px 'JetBrains Mono', monospace; text-align: center; }
.teb-panel { position: absolute; right: 0; top: 42px; width: min(440px, calc(100vw - 32px)); max-height: 70vh; overflow-y: auto; background: #131418; border: 1px solid #24262B; box-shadow: 0 18px 40px rgba(0,0,0,.5); z-index: 60; }
.teb-hdr { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid #24262B; font: 700 11px 'JetBrains Mono', monospace; letter-spacing: .1em; color: #F4F2EE; text-transform: uppercase; }
.teb-empty { padding: 22px 14px; color: #93959C; font-size: 13px; text-align: center; }
.teb-item { padding: 12px 14px; border-bottom: 1px solid #1D1F24; font-size: 12.5px; color: #C9CAD0; }
.teb-item.done { opacity: .55; }
.teb-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.teb-chip { font: 700 10px 'JetBrains Mono', monospace; padding: 2px 6px; border: 1px solid #24262B; color: #93959C; }
.teb-chip.red { color: #E11D2E; border-color: rgba(225,29,46,.4); }
.teb-name { font-weight: 700; color: #F4F2EE; }
.teb-by { color: #93959C; font-size: 11.5px; margin-bottom: 8px; }
.teb-diff { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.teb-diff li { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.teb-k { font: 700 10px 'JetBrains Mono', monospace; color: #55565C; text-transform: uppercase; min-width: 56px; }
.teb-old { color: #93959C; text-decoration: line-through; }
.teb-new { color: #4ADE80; }
.teb-diff img { width: 24px; height: 24px; object-fit: contain; background: #0B0C0E; border: 1px solid #24262B; }
.teb-acts { display: flex; gap: 8px; }
.teb-act { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font: 700 11px 'JetBrains Mono', monospace; cursor: pointer; border: 1px solid #24262B; background: transparent; color: #F4F2EE; }
.teb-act.ok { border-color: #4ADE80; color: #4ADE80; }
.teb-act.no:hover { border-color: #E11D2E; color: #E11D2E; }
.teb-act:disabled { opacity: .5; cursor: wait; }
.teb-err { color: #FCA5A5; font-size: 12px; margin-top: 6px; }
`;

const Img: React.FC<{ src?: string }> = ({ src }) => (src ? <img src={src} alt="" loading="lazy" /> : <span className="teb-old">none</span>);

/** Field-by-field what an edit changes. */
function diffLines(e: TeamEdit): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const c = e.changes || {};
  const b = e.before || {};
  if (c.teamFullName !== undefined) out.push(<li key="n"><span className="teb-k">Name</span><span className="teb-old">{b.teamFullName}</span>→<span className="teb-new">{c.teamFullName}</span></li>);
  if (c.teamTag !== undefined) out.push(<li key="t"><span className="teb-k">Tag</span><span className="teb-old">{b.teamTag}</span>→<span className="teb-new">{c.teamTag}</span></li>);
  if (c.logo !== undefined) out.push(<li key="l"><span className="teb-k">Logo</span><Img src={b.logo} />→<Img src={c.logo} /></li>);
  if (c.teamFlag !== undefined) out.push(<li key="f"><span className="teb-k">Flag</span><Img src={b.teamFlag} />→<Img src={c.teamFlag} /></li>);
  if (Array.isArray(c.players)) {
    const old = new Map((b.players || []).map(p => [p.playerId, p]));
    for (const p of c.players) {
      const o = old.get(p.playerId);
      if (!o) { out.push(<li key={`a${p.playerId}`}><span className="teb-k">+ Player</span><span className="teb-new">{p.playerName} ({p.playerId})</span><Img src={p.photo} /></li>); continue; }
      if (o.playerName !== p.playerName) out.push(<li key={`r${p.playerId}`}><span className="teb-k">Player</span><span className="teb-old">{o.playerName}</span>→<span className="teb-new">{p.playerName}</span></li>);
      if ((o.photo || '') !== (p.photo || '')) out.push(<li key={`p${p.playerId}`}><span className="teb-k">Photo</span>{p.playerName}: <Img src={o.photo} />→<Img src={p.photo} /></li>);
      const before = new Set(o.photos || []);
      const after = new Set(p.photos || []);
      const added = (p.photos || []).filter(u => !before.has(u));
      const removed = (o.photos || []).filter(u => !after.has(u));
      if (added.length || removed.length) {
        out.push(<li key={`x${p.playerId}`}><span className="teb-k">Poses</span>{p.playerName}:{added.map(u => <span key={u} className="teb-new">+<Img src={u} /></span>)}{removed.map(u => <span key={u} className="teb-old">−<Img src={u} /></span>)}</li>);
      }
    }
  }
  return out;
}

const TeamEditBell: React.FC = () => {
  const [edits, setEdits] = useState<TeamEdit[]>([]);
  const [pending, setPending] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const signedIn = (() => { try { return !!JSON.parse(localStorage.getItem('user') || 'null')?.token; } catch { return false; } })();

  const load = useCallback(async () => {
    if (!signedIn) return;
    try {
      const { data } = await api.get('/team-edits');
      setEdits(Array.isArray(data?.edits) ? data.edits : []);
      setPending(Number(data?.pendingCount) || 0);
    } catch { /* backend without the feature yet: the bell stays empty */ }
  }, [signedIn]);

  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    socket.on('teamEditRequested', refresh);
    socket.on('teamEditDecided', refresh);
    return () => {
      socket.off('teamEditRequested', refresh);
      socket.off('teamEditDecided', refresh);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const decide = async (e: TeamEdit, action: 'approve' | 'reject') => {
    setBusy(e.id);
    setError(null);
    try {
      await api.post(`/team-edits/${e.teamId}/${e.id}/${action}`);
      if (action === 'approve') {
        removeCache(teamsListCacheKey(), 'session');
        removeCache(`cache:v1:teams:byId:${e.teamId}`, 'session');
        window.dispatchEvent(new CustomEvent('team-edit-approved', { detail: { teamId: e.teamId } }));
      }
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || `Could not ${action} this change.`);
    } finally {
      setBusy(null);
    }
  };

  if (!signedIn) return null;
  return (
    <div className="teb" ref={box}>
      <style>{CSS}</style>
      <button className={`teb-btn${open ? ' on' : ''}`} onClick={() => setOpen(o => !o)} title="Team changes waiting for your approval" aria-label="Team change notifications">
        <FaBell size={13} />
        {pending > 0 && <span className="teb-count">{pending > 99 ? '99+' : pending}</span>}
      </button>
      {open && (
        <div className="teb-panel">
          <div className="teb-hdr"><span>Team changes</span><span style={{ color: '#93959C' }}>{pending} waiting</span></div>
          {error && <div className="teb-err" style={{ padding: '8px 14px' }}>{error}</div>}
          {edits.length === 0 && <div className="teb-empty">No team changes yet. Teams send them from /team-update with their event code.</div>}
          {edits.map(e => (
            <div key={e.id} className={`teb-item${e.status !== 'pending' ? ' done' : ''}`}>
              <div className="teb-top">
                {e.slot != null && <span className="teb-chip red">SLOT {e.slot}</span>}
                <span className="teb-name">{e.teamName}</span>
                <span className="teb-chip">{e.teamTag}</span>
                <span className="teb-chip" title="Event code used">{e.code}</span>
                {e.status !== 'pending' && <span className="teb-chip">{e.status.toUpperCase()}</span>}
              </div>
              <div className="teb-by">
                Sent by <b style={{ color: '#F4F2EE' }}>{e.submitterTeamName}</b>{e.groupName ? ` · ${e.groupName}` : ''} · {new Date(e.createdAt).toLocaleString()}
                {e.submitterTeamName.trim().toLowerCase() !== e.teamName.trim().toLowerCase() && (
                  <span style={{ color: '#FBBF24' }}> · sender name differs from the team</span>
                )}
              </div>
              <ul className="teb-diff">{diffLines(e)}</ul>
              {e.status === 'pending' && (
                <div className="teb-acts">
                  <button className="teb-act ok" disabled={busy === e.id} onClick={() => void decide(e, 'approve')}><FaCheck size={10} /> Approve</button>
                  <button className="teb-act no" disabled={busy === e.id} onClick={() => void decide(e, 'reject')}><FaTimes size={10} /> Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamEditBell;
