import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { FaTrash, FaEdit, FaPlus, FaTimes, FaCalendarAlt, FaBroadcastTower } from 'react-icons/fa';
import Group, { GroupRef } from './GroupsData.tsx';
import api from '../login/api.tsx';
import { socket } from './socket.tsx';
import { getOrFetch, setCache, clearCacheByPrefix } from './cache';

interface RoundData {
  _id: string;
  roundName: string;
  roundNumber: number;
  tournamentId?: string;
  day?: string;
  apiEnable?: boolean;
}

// ── Design system ─────────────────────────────────────────────────────────────
// Same tokens as Teams.tsx / GroupsData.tsx: Space Grotesk / Inter / JetBrains
// Mono, #0B0C0E / #131418 / #24262B / #E11D2E. Keeping "Rounds" visually
// identical to "Teams" and "Groups" so the whole tournament dashboard reads
// as one product. Class names are prefixed rd- to avoid collisions.
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

.rd-root * { box-sizing: border-box; }
.rd-root { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
.rd-orb { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif !important; }
.rd-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

.rd-page { min-height: 100vh; background: #0B0C0E; padding: 36px 20px 64px; position: relative; overflow: hidden; }
.rd-hex { position: fixed; inset: 0; pointer-events: none; z-index: 0; background: radial-gradient(ellipse 80% 40% at 50% 0%, rgba(225,29,46,0.07), transparent); }
.rd-inner { position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; }

/* ── Header ── */
.rd-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
.rd-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #93959C; letter-spacing: 0.22em; text-transform: uppercase; margin-bottom: 8px; }
.rd-eyebrow-dot { width: 6px; height: 6px; background: #E11D2E; flex-shrink: 0; }
.rd-title { font-family: 'Space Grotesk', sans-serif; font-size: 28px; font-weight: 800; color: #F4F2EE; letter-spacing: -0.01em; margin: 0 0 6px; text-transform: uppercase; }
.rd-subtitle { color: #93959C; font-size: 14px; max-width: 480px; }
.rd-header-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

/* ── Buttons ── */
.rd-btn-primary { display: inline-flex; align-items: center; gap: 8px; background: #E11D2E; color: #fff; border: 1px solid #E11D2E; font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 700; padding: 11px 20px; cursor: pointer; }
.rd-btn-primary:hover { background: #F4F2EE; color: #0B0C0E; border-color: #F4F2EE; }
.rd-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.rd-btn-primary:disabled:hover { background: #E11D2E; color: #fff; border-color: #E11D2E; }
.rd-btn-ghost { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: #93959C; border: 1px solid #24262B; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; padding: 10px 18px; cursor: pointer; }
.rd-btn-ghost:hover { border-color: #E11D2E; color: #F4F2EE; }
.rd-btn-cancel { background: transparent; color: #93959C; border: 1px solid #24262B; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600; padding: 10px 18px; cursor: pointer; }
.rd-btn-cancel:hover { border-color: #55565C; color: #F4F2EE; }
.rd-btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }
.rd-icon-btn { width: 32px; height: 32px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #131418; border: 1px solid #24262B; color: #93959C; cursor: pointer; }
.rd-icon-btn:hover { border-color: #F4F2EE; color: #F4F2EE; }
.rd-icon-btn.danger:hover { border-color: #E11D2E; color: #E11D2E; }
.rd-icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Button spinner ── */
.rd-btn-spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: rd-spin 0.7s linear infinite;
  flex-shrink: 0;
}

/* ── Stats bar ── */
.rd-statsbar { display: flex; gap: 10px; margin-bottom: 26px; flex-wrap: wrap; }
.rd-stat { background: #131418; border: 1px solid #24262B; padding: 12px 18px; display: flex; flex-direction: column; gap: 2px; min-width: 110px; }
.rd-stat-val { font-family: 'Space Grotesk', sans-serif; font-size: 20px; font-weight: 800; color: #E11D2E; }
.rd-stat-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #55565C; letter-spacing: 0.15em; text-transform: uppercase; }

/* ── Section divider ── */
.rd-section-label { display: flex; align-items: center; gap: 12px; margin: 30px 0 16px; }
.rd-section-label span { font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 0.22em; color: #E11D2E; white-space: nowrap; }
.rd-section-label::before, .rd-section-label::after { content: ''; flex: 1; height: 1px; background: #24262B; }

/* ── Round list ── */
.rd-list { display: flex; flex-direction: column; gap: 10px; list-style: none; margin: 0; padding: 0; }
.rd-row { position: relative; background: #131418; border: 1px solid #24262B; display: flex; align-items: stretch; }
.rd-row:hover { border-color: rgba(225,29,46,0.4); }
.rd-accent { width: 3px; flex-shrink: 0; background: #24262B; }
.rd-accent.api-on { background: #E11D2E; }
.rd-row-content { flex: 1; padding: 16px 18px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }

.rd-num-badge { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #E11D2E; background: rgba(225,29,46,0.08); border: 1px solid rgba(225,29,46,0.3); padding: 4px 10px; letter-spacing: 0.05em; flex-shrink: 0; }
.rd-round-name { font-family: 'Space Grotesk', sans-serif; font-size: 16px; font-weight: 700; color: #F4F2EE; text-decoration: none; letter-spacing: 0.01em; }
.rd-round-name:hover { color: #E11D2E; }

.rd-meta { display: flex; align-items: center; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
.rd-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #93959C; background: #0B0C0E; border: 1px solid #24262B; padding: 3px 10px; }
.rd-chip.api { color: #E11D2E; background: rgba(225,29,46,0.08); border-color: rgba(225,29,46,0.3); font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.05em; }
.rd-api-dot { width: 6px; height: 6px; border-radius: 50%; background: #E11D2E; flex-shrink: 0; }

.rd-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }

/* ── Empty state ── */
.rd-empty { text-align: center; padding: 72px 24px; border: 1px dashed #24262B; }
.rd-empty-icon-wrap { width: 64px; height: 64px; border-radius: 50%; margin: 0 auto 18px; background: rgba(225,29,46,0.08); border: 1px solid rgba(225,29,46,0.3); display: flex; align-items: center; justify-content: center; }
.rd-empty-title { font-family: 'Space Grotesk', sans-serif; font-size: 16px; font-weight: 700; color: #F4F2EE; margin-bottom: 8px; text-transform: uppercase; }
.rd-empty-desc { color: #93959C; font-size: 14px; margin-bottom: 22px; }

/* ── Loading / error ── */
.rd-loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0B0C0E; flex-direction: column; gap: 16px; }
.rd-spinner { width: 40px; height: 40px; border: 3px solid #24262B; border-top-color: #E11D2E; border-radius: 50%; }
.rd-loading-text { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #93959C; letter-spacing: 0.15em; }

/* ── Modal ── */
.rd-modal-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; padding: 16px; }
.rd-modal { width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; background: #0B0C0E; border: 1px solid rgba(225,29,46,0.35); box-shadow: 0 40px 80px rgba(0,0,0,0.7); }
.rd-modal-hdr { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px 14px; border-bottom: 1px solid #24262B; }
.rd-modal-body { padding: 20px 22px 22px; }
.rd-pill { display: inline-flex; align-items: center; background: rgba(225,29,46,0.08); border: 1px solid rgba(225,29,46,0.3); color: #E11D2E; font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 3px 9px; letter-spacing: 0.05em; font-weight: 700; }

.rd-field-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #E11D2E; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 7px; }
.rd-fields { display: flex; flex-direction: column; gap: 16px; }
.rd-input { width: 100%; padding: 11px 13px; background: #131418; border: 1px solid #24262B; color: #F4F2EE; font-family: 'Inter', sans-serif; font-size: 14px; outline: none; }
.rd-input::placeholder { color: #55565C; }
.rd-input:focus { border-color: #E11D2E; }
.rd-input:disabled { opacity: 0.6; cursor: not-allowed; }

.rd-toggle { display: flex; align-items: center; gap: 10px; padding: 11px 13px; background: #131418; border: 1px solid #24262B; cursor: pointer; }
.rd-toggle.on { border-color: rgba(225,29,46,0.5); background: rgba(225,29,46,0.06); }
.rd-toggle input { accent-color: #E11D2E; width: 16px; height: 16px; }
.rd-toggle span { font-size: 14px; font-weight: 600; color: #F4F2EE; }

.rd-modal-actions { display: flex; gap: 10px; margin-top: 22px; padding-top: 18px; border-top: 1px solid #24262B; }

@keyframes rd-spin { to { transform: rotate(360deg); } }

@media (max-width: 560px) {
  .rd-header { align-items: flex-start; }
  .rd-header-actions { width: 100%; }
  .rd-header-actions .rd-btn-primary, .rd-header-actions .rd-btn-ghost { flex: 1; justify-content: center; }
  .rd-row-content { flex-direction: column; align-items: flex-start; }
  .rd-actions { align-self: flex-end; }
}
`;

const isCanceled = (err: any) => err?.name === 'CanceledError' || err?.name === 'AbortError' || err?.code === 'ERR_CANCELED';

const Round: React.FC = () => {
  const { t } = useTranslation();
  const { tournamentId } = useParams<{ tournamentId?: string }>();
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = `cache:v1:rounds:${tournamentId ?? 'user'}`;
  const groupRef = useRef<GroupRef>(null);

  // Modal & form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [roundName, setRoundName] = useState('');
  const [roundNumber, setRoundNumber] = useState<number>(1);
  const [day, setDay] = useState('');
  const [apiEnable, setApiEnable] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit states
  const [editRoundId, setEditRoundId] = useState<string | null>(null);
  const [editRoundName, setEditRoundName] = useState('');
  const [editRoundNumber, setEditRoundNumber] = useState<number>(1);
  const [editDay, setEditDay] = useState('');
  const [editApiEnable, setEditApiEnable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Track per-row delete-in-flight so only the clicked row's button spins
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchRounds = useCallback(async () => {
    setLoading(true);
    try {
      let url = tournamentId
        ? `/tournaments/${tournamentId}/rounds`
        : '/user/rounds';
      const data = await getOrFetch(cacheKey, () => api.get(url).then(r => r.data), { maxAge: 90 * 1000, storage: 'session' });
      // A cached or live response can be a non-array (e.g. a backend error
      // body that slipped through as a 200) — degrade to empty rather than
      // crash the .filter/.map calls below.
      setRounds(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err: any) {
      if (isCanceled(err)) return;
      setError(err.message || 'Failed to fetch rounds');
    } finally {
      setLoading(false);
    }
  }, [tournamentId, cacheKey]);

  useEffect(() => {
    fetchRounds();
    // The event carries no tournament id, and rounds are now genuinely
    // read from cache (not a dead write-only cache) — so a stale entry for
    // a *different* tournament than the one currently mounted must also be
    // cleared, or it could be served as fresh on the next visit.
    const handleRoundUpdated = () => {
      clearCacheByPrefix('cache:v1:rounds:', 'session');
      fetchRounds();
    };
    socket.on('roundUpdated', handleRoundUpdated);
    return () => {
      // Must pass the SAME reference that was registered above — off()
      // silently no-ops on a mismatched reference (this used to pass
      // fetchRounds here, which was never the listener that got added, so
      // the real handler was never actually removed and leaked a
      // stale-closure listener on every remount).
      socket.off('roundUpdated', handleRoundUpdated);
    };
  }, [tournamentId, cacheKey, fetchRounds]);

  const openAddModal = () => {
    setShowAddModal(true);
    setRoundName('');
    setRoundNumber(rounds.length + 1);
    setDay('');
    setApiEnable(false);
  };

  const closeAddModal = () => {
    if (isSaving) return; // don't let the user dismiss mid-save
    setShowAddModal(false);
  };

  // ── Optimized create: uses the server's returned round directly instead
  // of re-fetching the whole list. If this round turned apiEnable on, we
  // mirror that locally by clearing apiEnable on every other round, since
  // the backend enforces only one active round per user/tournament.
  const handleAddRound = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roundName || isSaving) return;
    setIsSaving(true);
    try {
      const url = tournamentId
        ? `/tournaments/${tournamentId}/rounds`
        : '/tournaments/undefined/rounds';
      const { data: newRound } = await api.post(url, { roundName, roundNumber, day, apiEnable });

      setRounds(prev => {
        const base = apiEnable ? prev.map(r => ({ ...r, apiEnable: false })) : prev;
        const next = [newRound, ...base];
        setCache(cacheKey, next, 'session');
        return next;
      });

      closeAddModal();
    } catch (err: any) {
      alert(err.message || 'Error creating round');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (roundId: string) => {
    if (!window.confirm('Are you sure you want to delete this round?')) return;
    setDeletingId(roundId);
    try {
      const url = tournamentId
        ? `/tournaments/${tournamentId}/rounds/${roundId}`
        : `/rounds/${roundId}`;
      await api.delete(url);
      const updatedRounds = rounds.filter(r => r._id !== roundId);
      setRounds(updatedRounds);
      setCache(cacheKey, updatedRounds, 'session');
    } catch (err: any) {
      alert(err.message || 'Error deleting round');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditClick = (round: RoundData) => {
    setEditRoundId(round._id);
    setEditRoundName(round.roundName);
    setEditRoundNumber(round.roundNumber);
    setEditDay(round.day || '');
    setEditApiEnable(round.apiEnable || false);
  };

  const closeEditModal = () => {
    if (isUpdating) return;
    setEditRoundId(null);
  };

  // ── Optimized update: same idea — apply the server's returned round
  // directly, and mirror the "only one apiEnable at a time" rule locally.
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRoundId || isUpdating) return;
    setIsUpdating(true);
    try {
      const url = tournamentId
        ? `/tournaments/${tournamentId}/rounds/${editRoundId}`
        : `/rounds/${editRoundId}`;
      const { data: updated } = await api.put(url, {
        roundName: editRoundName,
        roundNumber: editRoundNumber,
        day: editDay,
        apiEnable: editApiEnable,
      });

      setRounds(prev => {
        const next = prev.map(r => {
          if (r._id === updated._id) return updated;
          if (updated.apiEnable && r.apiEnable) return { ...r, apiEnable: false };
          return r;
        });
        setCache(cacheKey, next, 'session');
        return next;
      });

      setEditRoundId(null);
    } catch (err: any) {
      alert(err.message || 'Error updating round');
    } finally {
      setIsUpdating(false);
    }
  };

  const apiActiveCount = rounds.filter(r => r.apiEnable).length;

  // ── Loading / Error ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div className="rd-root rd-loading">
          <div className="rd-spinner" style={{ animation: 'rd-spin 0.9s linear infinite' }} />
          <p className="rd-loading-text">LOADING ROUNDS…</p>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <style>{STYLES}</style>
        <div className="rd-root rd-loading">
          <p className="rd-mono" style={{ color: '#E11D2E', fontSize: 13, letterSpacing: '0.05em' }}>
            ERROR: {error}
          </p>
        </div>
      </>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <>
      <style>{STYLES}</style>
      <div className="rd-root rd-page">
        <div className="rd-hex" />

        <div className="rd-inner">

          {/* ── Page header ── */}
          <div className="rd-header">
            <div>
              <div className="rd-eyebrow"><span className="rd-eyebrow-dot" /> BROADCAST SYSTEM</div>
              <h1 className="rd-title">{t('rounds.title')}</h1>
              <p className="rd-subtitle">Manage rounds, schedule and API broadcast feeds</p>
            </div>
            <div className="rd-header-actions">
              <button className="rd-btn-ghost" onClick={() => groupRef.current?.openForm()}>
                <FaPlus size={11} /> {t('rounds.addGroup')}
              </button>
              <button className="rd-btn-primary" onClick={openAddModal}>
                <FaPlus size={11} /> {t('rounds.addRound')}
              </button>
            </div>
          </div>

          {/* ── Stats bar ── */}
          <div className="rd-statsbar">
            <div className="rd-stat">
              <span className="rd-stat-val">{rounds.length}</span>
              <span className="rd-stat-label">Total rounds</span>
            </div>
            <div className="rd-stat">
              <span className="rd-stat-val">{apiActiveCount}</span>
              <span className="rd-stat-label">API active</span>
            </div>
            <div className="rd-stat">
              <span className="rd-stat-val">{rounds.filter(r => r.day).length}</span>
              <span className="rd-stat-label">Scheduled</span>
            </div>
          </div>

          {/* ── Group component ── */}
          <Group ref={groupRef} />

          {/* ── Section divider ── */}
          <div className="rd-section-label"><span>ROUNDS</span></div>

          {/* ── Round list ── */}
          {rounds.length > 0 ? (
            <ul className="rd-list" style={{ paddingBottom: 48 }}>
              {rounds.map(round => (
                <li key={round._id} className="rd-row">
                  <div className={`rd-accent${round.apiEnable ? ' api-on' : ''}`} />
                  <div className="rd-row-content">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span className="rd-num-badge">R{round.roundNumber}</span>
                        {tournamentId ? (
                          <Link to={`/tournaments/${tournamentId}/rounds/${round._id}/matches`} className="rd-round-name">
                            {round.roundName}
                          </Link>
                        ) : (
                          <span className="rd-round-name">{round.roundName}</span>
                        )}
                      </div>
                      <div className="rd-meta">
                        <span className="rd-chip">
                          <FaCalendarAlt size={10} />
                          {round.day || t('rounds.noDaySet')}
                        </span>
                        {round.apiEnable && (
                          <span className="rd-chip api">
                            <span className="rd-api-dot" /> {t('rounds.apiActive')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="rd-actions">
                      <button
                        className="rd-icon-btn"
                        onClick={() => handleEditClick(round)}
                        aria-label="Edit round"
                        title="Edit"
                        disabled={deletingId === round._id}
                      >
                        <FaEdit size={12} />
                      </button>
                      <button
                        className="rd-icon-btn danger"
                        onClick={() => handleDelete(round._id)}
                        aria-label="Delete round"
                        title="Delete"
                        disabled={deletingId === round._id}
                      >
                        {deletingId === round._id ? (
                          <span className="rd-btn-spinner" style={{ borderColor: 'rgba(225,29,46,0.35)', borderTopColor: '#E11D2E' }} />
                        ) : (
                          <FaTrash size={12} />
                        )}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            /* ── Empty state ── */
            <div className="rd-empty">
              <div className="rd-empty-icon-wrap">
                <FaBroadcastTower size={24} style={{ color: '#E11D2E', opacity: 0.8 }} />
              </div>
              <h3 className="rd-empty-title">No rounds yet</h3>
              <p className="rd-empty-desc">Create your first round to start managing the broadcast schedule.</p>
              <button className="rd-btn-primary" style={{ margin: '0 auto' }} onClick={openAddModal}>
                <FaPlus size={11} /> {t('rounds.addRound')}
              </button>
            </div>
          )}
        </div>

        {/* ── Add modal ── */}
        {showAddModal && (
          <div className="rd-modal-overlay" onClick={closeAddModal}>
            <div className="rd-modal" onClick={e => e.stopPropagation()}>
              <div className="rd-modal-hdr">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="rd-pill">NEW</span>
                  <span className="rd-orb" style={{ color: '#F4F2EE', fontSize: 15, fontWeight: 700, textTransform: 'uppercase' }}>
                    {t('rounds.addNewRound')}
                  </span>
                </div>
                <button className="rd-icon-btn" onClick={closeAddModal} aria-label="Close" disabled={isSaving}><FaTimes size={13} /></button>
              </div>

              <div className="rd-modal-body">
                <form onSubmit={handleAddRound}>
                  <fieldset disabled={isSaving} style={{ border: 'none', padding: 0, margin: 0 }}>
                    <div className="rd-fields">
                      <div>
                        <p className="rd-field-label">{t('rounds.roundName')}</p>
                        <input
                          type="text"
                          placeholder="e.g. Grand Finals"
                          value={roundName}
                          onChange={e => setRoundName(e.target.value)}
                          className="rd-input"
                          autoFocus
                          required
                        />
                      </div>
                      <div>
                        <p className="rd-field-label">Round number</p>
                        <input
                          type="number"
                          min={1}
                          value={roundNumber}
                          onChange={e => setRoundNumber(parseInt(e.target.value, 10) || 1)}
                          className="rd-input"
                        />
                      </div>
                      <div>
                        <p className="rd-field-label">{t('rounds.day')}</p>
                        <input
                          type="text"
                          placeholder="e.g. Day 1"
                          value={day}
                          onChange={e => setDay(e.target.value)}
                          className="rd-input"
                        />
                      </div>
                      <label className={`rd-toggle${apiEnable ? ' on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={apiEnable}
                          onChange={e => setApiEnable(e.target.checked)}
                        />
                        <span>{t('rounds.enableApi')}</span>
                      </label>
                    </div>

                    <div className="rd-modal-actions">
                      <button type="button" className="rd-btn-cancel" style={{ flex: 1 }} onClick={closeAddModal} disabled={isSaving}>
                        {t('rounds.cancel')}
                      </button>
                      <button type="submit" className="rd-btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={isSaving}>
                        {isSaving ? <span className="rd-btn-spinner" /> : null}
                        {isSaving ? t('rounds.saving') || 'Saving…' : t('rounds.saveRound')}
                      </button>
                    </div>
                  </fieldset>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ── Edit modal ── */}
        {editRoundId && (
          <div className="rd-modal-overlay" onClick={closeEditModal}>
            <div className="rd-modal" onClick={e => e.stopPropagation()}>
              <div className="rd-modal-hdr">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="rd-pill">EDIT</span>
                  <span className="rd-orb" style={{ color: '#F4F2EE', fontSize: 15, fontWeight: 700, textTransform: 'uppercase' }}>
                    {t('rounds.saveChanges')}
                  </span>
                </div>
                <button className="rd-icon-btn" onClick={closeEditModal} aria-label="Close" disabled={isUpdating}><FaTimes size={13} /></button>
              </div>

              <div className="rd-modal-body">
                <form onSubmit={handleUpdate}>
                  <fieldset disabled={isUpdating} style={{ border: 'none', padding: 0, margin: 0 }}>
                    <div className="rd-fields">
                      <div>
                        <p className="rd-field-label">{t('rounds.name')}</p>
                        <input
                          type="text"
                          value={editRoundName}
                          onChange={e => setEditRoundName(e.target.value)}
                          className="rd-input"
                          placeholder="Round name"
                          autoFocus
                          required
                        />
                      </div>
                      <div>
                        <p className="rd-field-label">{t('rounds.day')}</p>
                        <input
                          type="text"
                          value={editDay}
                          onChange={e => setEditDay(e.target.value)}
                          className="rd-input"
                          placeholder="e.g. Day 1"
                        />
                      </div>
                      <label className={`rd-toggle${editApiEnable ? ' on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={editApiEnable}
                          onChange={e => setEditApiEnable(e.target.checked)}
                        />
                        <span>{t('rounds.enableApi')}</span>
                      </label>
                    </div>

                    <div className="rd-modal-actions">
                      <button type="button" className="rd-btn-cancel" style={{ flex: 1 }} onClick={closeEditModal} disabled={isUpdating}>
                        {t('rounds.cancel')}
                      </button>
                      <button type="submit" className="rd-btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={isUpdating}>
                        {isUpdating ? <span className="rd-btn-spinner" /> : null}
                        {isUpdating ? t('saving changes') || 'Saving…' : t('rounds.saveChanges')}
                      </button>
                    </div>
                  </fieldset>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Round;