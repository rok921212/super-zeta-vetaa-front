import React, {
  useState, useEffect, useRef, useCallback, useMemo, useTransition,
  ChangeEvent, FormEvent, memo,
} from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  FaEdit, FaTrash, FaDiscord, FaUpload, FaTrophy, FaUsers, FaEye,
FaSignOutAlt, FaSearch, FaTimes, FaBars, FaPlus, FaSpinner,} from "react-icons/fa";
import { useTranslation } from 'react-i18next';
import api from "../login/api"; // Axios instance, attaches Authorization: Bearer <token>
import SocketManager from "./socketManager";
import { stopAllPolling } from "./isPolling.tsx";
import { socket } from "./socket"; // socket instance
import { setCache, getCache, removeCache } from "./cache"; // caching utils
import { uploadToCloudinary } from '../utils/cloudinaryUpload.tsx';

interface TournamentFormState {
  tournamentName: string;
  torLogo: string;
  primaryColor: string;
  secondaryColor: string;
  overlayBg: string;
}

interface Tournament extends TournamentFormState {
  _id: string;
}

const EMPTY_FORM: TournamentFormState = {
  tournamentName: "", torLogo: "", primaryColor: "", secondaryColor: "", overlayBg: "",
};

const COLOR_FIELDS: { name: keyof TournamentFormState; labelKey: string }[] = [
  { name: "primaryColor", labelKey: "primaryColor" },
  { name: "secondaryColor", labelKey: "secondaryColor" },
  { name: "overlayBg", labelKey: "overlayBg" },
];

const GLOBAL_CACHE_KEY = "auth_user";
const CACHE_KEY_BASE = "tournaments";

// ── Design system ────────────────────────────────────────────────────────────
// Same identity as Team Ops / Overlay Control: dark void, one red tally
// accent, Space Grotesk / Inter / JetBrains Mono. No transitions, no
// keyframes, no backdrop-filter on anything but the sticky nav — hover and
// selection states just snap, which is what makes the page feel instant.
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

.db-root * { box-sizing: border-box; }
.db-root { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
.db-orb { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif !important; }
.db-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

.db-glow {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background: radial-gradient(ellipse 80% 40% at 50% 0%, rgba(225,29,46,0.07), transparent);
}

.db-spinner {
  animation: db-spin 0.8s linear infinite;
}

@keyframes db-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.db-btn-primary:disabled {
  opacity: 0.65;
  cursor: wait;
}

.db-btn-ghost:disabled {
  opacity: 0.5;
  cursor: wait;
}

.db-toast {
  position: fixed; bottom: 24px; right: 24px; z-index: 300;
  display: flex; align-items: center; gap: 10px;
  background: #131418; border: 1px solid rgba(74,222,128,0.4);
  padding: 13px 18px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600;
  color: #F4F2EE; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  animation: db-toast-in 0.18s ease-out;
}
.db-toast-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ADE80; flex-shrink: 0; box-shadow: 0 0 6px rgba(74,222,128,0.6); }
@keyframes db-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

/* ── Top navbar ── */
.db-nav { position: sticky; top: 0; z-index: 60; background: rgba(11,12,14,0.96); border-bottom: 1px solid #24262B; }
.db-nav-inner { max-width: 1280px; margin: 0 auto; padding: 0 20px; display: flex; align-items: center; height: 64px; gap: 18px; }
.db-nav-brand { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.db-nav-links { display: flex; align-items: center; gap: 4px; }
.db-nav-link { display: flex; align-items: center; gap: 8px; padding: 8px 14px; color: #93959C; text-decoration: none; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; border: 1px solid transparent; background: none; white-space: nowrap; }
.db-nav-link:hover { color: #F4F2EE; }
.db-nav-link.active { color: #E11D2E; border-bottom: 2px solid #E11D2E; padding-bottom: 6px; }
.db-nav-right { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.db-nav-user { display: flex; align-items: center; gap: 8px; padding: 5px 12px 5px 6px; border: 1px solid #24262B; }
.db-nav-avatar { width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; background: rgba(225,29,46,0.15); border: 1px solid rgba(225,29,46,0.4); display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: #E11D2E; }
.db-nav-logout { display: flex; align-items: center; gap: 7px; padding: 8px 13px; background: transparent; border: 1px solid #24262B; color: #93959C; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; }
.db-nav-logout:hover { border-color: #E11D2E; color: #E11D2E; }
.db-nav-burger { display: none; background: none; border: 1px solid #24262B; color: #F4F2EE; width: 38px; height: 38px; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
.db-nav-mobile-panel { display: none; flex-direction: column; padding: 10px 20px 16px; gap: 2px; border-bottom: 1px solid #24262B; background: #0B0C0E; }
.db-nav-mobile-panel.open { display: flex; }
@media (max-width: 860px) {
  .db-nav-links { display: none; }
  .db-nav-burger { display: flex; }
  .db-nav-user span { display: none; }
}

.db-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #93959C; letter-spacing: 0.22em; text-transform: uppercase; }
.db-eyebrow-dot { width: 6px; height: 6px; background: #E11D2E; flex-shrink: 0; }
.db-pill { display: inline-flex; align-items: center; background: rgba(225,29,46,0.08); border: 1px solid rgba(225,29,46,0.3); color: #E11D2E; font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 3px 9px; letter-spacing: 0.05em; font-weight: 700; }

/* ── Buttons / inputs ── */
.db-btn-primary { display: inline-flex; align-items: center; gap: 8px; background: #E11D2E; color: #fff; border: 1px solid #E11D2E; font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; padding: 12px 22px; cursor: pointer; }
.db-btn-primary:hover { background: #F4F2EE; color: #0B0C0E; border-color: #F4F2EE; }
.db-btn-ghost { background: transparent; color: #93959C; border: 1px solid #24262B; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600; padding: 10px 18px; cursor: pointer; }
.db-btn-ghost:hover { border-color: #E11D2E; color: #F4F2EE; }
.db-icon-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: rgba(11,12,14,0.7); border: 1px solid #24262B; color: #93959C; cursor: pointer; flex-shrink: 0; }
.db-icon-btn:hover { border-color: #F4F2EE; color: #F4F2EE; }
.db-icon-btn.danger:hover { border-color: #E11D2E; color: #E11D2E; }
.db-input { width: 100%; padding: 11px 13px; background: #0B0C0E; border: 1px solid #24262B; color: #F4F2EE; font-family: 'Inter', sans-serif; font-size: 14px; outline: none; }
.db-input::placeholder { color: #55565C; }
.db-input:focus { border-color: #E11D2E; }

/* ── Page layout ── */
.db-page { max-width: 1280px; margin: 0 auto; padding: 36px 20px 64px; position: relative; z-index: 1; }
.db-header-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
.db-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
.db-search-wrap { position: relative; flex: 1; min-width: 220px; max-width: 380px; }
.db-search-ic { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #55565C; font-size: 12px; pointer-events: none; }
.db-stats { display: flex; gap: 10px; margin-left: auto; flex-wrap: wrap; }
.db-stat { background: #131418; border: 1px solid #24262B; padding: 8px 14px; display: flex; align-items: baseline; gap: 7px; }

/* ── Tournament card grid ── */
.db-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 14px; }
.db-card { position: relative; background: #131418; border: 1px solid #24262B; }
.db-card:hover { border-color: rgba(225,29,46,0.4); }
.db-card-accent { height: 3px; background: #E11D2E; }
.db-card-inner { padding: 18px; }
.db-card-link { text-decoration: none; display: block; }
.db-card-top { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding-right: 60px; }
.db-card-logo { width: 48px; height: 48px; object-fit: cover; border: 1px solid #24262B; flex-shrink: 0; }
.db-card-logo-ph { width: 48px; height: 48px; flex-shrink: 0; background: #0B0C0E; border: 1px solid #24262B; display: flex; align-items: center; justify-content: center; }
.db-card-actions { position: absolute; top: 14px; right: 14px; display: flex; gap: 6px; }
.db-card-name { font-family: 'Space Grotesk', sans-serif; font-size: 15px; font-weight: 700; color: #F4F2EE; text-transform: uppercase; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-card-foot { display: flex; align-items: center; gap: 8px; padding-top: 14px; border-top: 1px solid #24262B; }
.db-card-foot-lbl { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #55565C; letter-spacing: 0.05em; margin-right: 2px; }
.db-swatch { width: 20px; height: 20px; border: 1px solid rgba(255,255,255,0.15); flex-shrink: 0; }
.db-card-view { margin-left: auto; font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600; color: #55565C; }
.db-card:hover .db-card-view { color: #E11D2E; }

/* ── Modals ── */
.db-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 16px; }
.db-modal-box { width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; background: #0B0C0E; border: 1px solid rgba(225,29,46,0.35); }
.db-modal-hdr { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px 14px; border-bottom: 1px solid #24262B; position: sticky; top: 0; background: #0B0C0E; z-index: 2; }
.db-modal-body { padding: 20px 22px 22px; }
.db-modal-close { width: 30px; height: 30px; background: transparent; border: 1px solid #24262B; color: #93959C; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.db-modal-close:hover { border-color: #E11D2E; color: #E11D2E; }

/* ── Color field row (create/edit modal) ── */
.db-color-row { display: flex; align-items: center; gap: 10px; }
.db-color-preview { width: 44px; height: 44px; flex-shrink: 0; border: 1px solid #24262B; background: #0B0C0E; }

/* ── Empty state ── */
.db-empty { text-align: center; padding: 72px 24px; border: 1px dashed #24262B; }
.db-empty-icon-wrap { width: 68px; height: 68px; border-radius: 50%; margin: 0 auto 20px; background: rgba(225,29,46,0.08); border: 1px solid rgba(225,29,46,0.3); display: flex; align-items: center; justify-content: center; }

@media (max-width: 560px) {
  .db-header-row { align-items: flex-start; }
  .db-header-row .db-btn-primary { width: 100%; justify-content: center; }
  .db-stats { width: 100%; margin-left: 0; }
  .db-stat { flex: 1; justify-content: center; }
  .db-grid { grid-template-columns: 1fr; }
}
`;

// ── Top navigation ───────────────────────────────────────────────────────────
// Memoized: only `user` should ever change it, so it won't re-render for
// search typing, form edits, or card actions happening below.
const TopNav = memo(({ user, onLogout }: { user: any; onLogout: () => void }) => {
  const [open, setOpen] = useState(false);

  const links = [
    { label: 'TOURNAMENTS', icon: <FaTrophy size={13} />, active: true },
    { label: 'TEAMS', icon: <FaUsers size={13} />, onClick: () => window.location.href = '/teams' },
    { label: 'HUD', icon: <FaEye size={13} />, onClick: () => window.location.href = '/displayhud' },
    { label: 'HELP', icon: <FaDiscord size={13} />, onClick: () => window.open('https://discord.com/channels/623776491682922526/1426117227257663558', '_blank') },
  ];

  return (
    <nav className="db-nav">
      <div className="db-nav-inner">
        <div className="db-nav-brand">
          <img src="./logo.avif" alt="logo" style={{ width: 30, height: 30, objectFit: 'contain' }} />
          <span className="db-orb" style={{ fontSize: 14, fontWeight: 700, color: '#F4F2EE', letterSpacing: '0.02em' }}>TOURNAMENT OPS</span>
        </div>

        <div className="db-nav-links">
          {links.map(link => (
            <button key={link.label} className={`db-nav-link ${link.active ? 'active' : ''}`} onClick={link.onClick}>
              {link.icon} {link.label}
            </button>
          ))}
        </div>

        <div className="db-nav-right">
          {user && (
            <div className="db-nav-user">
              <div className="db-nav-avatar">{(user.username || '?').slice(0, 2).toUpperCase()}</div>
              <span className="db-mono" style={{ fontSize: 11, color: '#F4F2EE' }}>{user.username}</span>
            </div>
          )}
          <button className="db-nav-logout" onClick={onLogout}>
            <FaSignOutAlt size={12} /> LOGOUT
          </button>
          <button className="db-nav-burger" onClick={() => setOpen(v => !v)} aria-label="Toggle menu">
            {open ? <FaTimes size={15} /> : <FaBars size={15} />}
          </button>
        </div>
      </div>

      <div className={`db-nav-mobile-panel ${open ? 'open' : ''}`}>
        {links.map(link => (
          <button
            key={link.label}
            className={`db-nav-link ${link.active ? 'active' : ''}`}
            style={{ justifyContent: 'flex-start', padding: '12px 8px', borderBottom: 'none' }}
            onClick={() => { link.onClick?.(); setOpen(false); }}
          >
            {link.icon} {link.label}
          </button>
        ))}
      </div>
    </nav>
  );
});

// ── Search box ───────────────────────────────────────────────────────────────
// Local state + a short debounce (via useTransition) so typing stays instant
// no matter how many tournaments exist — the filter only runs once typing
// pauses, and it never blocks the input itself.
const SearchInput = memo(({ onSearchChange }: { onSearchChange: (q: string) => void }) => {
  const [localQuery, setLocalQuery] = useState('');
  const [, startTransition] = useTransition();

  useEffect(() => {
    const id = setTimeout(() => {
      startTransition(() => onSearchChange(localQuery));
    }, localQuery === '' ? 0 : 200);
    return () => clearTimeout(id);
  }, [localQuery, onSearchChange]);

  return (
    <div className="db-search-wrap">
      <FaSearch className="db-search-ic" />
      <input
        type="text" value={localQuery}
        onChange={e => setLocalQuery(e.target.value)}
        placeholder="Search tournaments…"
        className="db-input" style={{ paddingLeft: 34 }}
      />
    </div>
  );
});

// ── Tournament card ──────────────────────────────────────────────────────────
const TournamentCard = memo(({
  tournament, onEdit, onDelete,
}: {
  tournament: Tournament;
  onEdit: (t: Tournament) => void;
  onDelete: (id: string) => void;
}) => (
  <div className="db-card">
    <div className="db-card-accent" style={{
      background: `linear-gradient(90deg, ${tournament.primaryColor || '#E11D2E'}, ${tournament.secondaryColor || '#7c0f18'})`,
    }} />
    <div className="db-card-inner">
      <div className="db-card-actions">
        <button className="db-icon-btn" onClick={() => onEdit(tournament)} aria-label="Edit tournament"><FaEdit size={12} /></button>
        <button className="db-icon-btn danger" onClick={() => onDelete(tournament._id)} aria-label="Delete tournament"><FaTrash size={12} /></button>
      </div>

      <Link to={`/tournaments/${tournament._id}/rounds`} className="db-card-link">
        <div className="db-card-top">
          {tournament.torLogo
            ? <img src={tournament.torLogo} alt={tournament.tournamentName} className="db-card-logo" loading="lazy" onError={e => e.currentTarget.src = './logo.png'} />
            : <div className="db-card-logo-ph"><FaTrophy size={18} style={{ color: '#E11D2E', opacity: 0.5 }} /></div>}
          <div className="db-card-name">{tournament.tournamentName}</div>
        </div>

        <div className="db-card-foot">
          <span className="db-card-foot-lbl">COLORS</span>
          {tournament.primaryColor && <div className="db-swatch" style={{ background: tournament.primaryColor }} title="Primary" />}
          {tournament.secondaryColor && <div className="db-swatch" style={{ background: tournament.secondaryColor }} title="Secondary" />}
          {tournament.overlayBg && <div className="db-swatch" style={{ background: tournament.overlayBg }} title="Overlay background" />}
          <span className="db-card-view">View rounds →</span>
        </div>
      </Link>
    </div>
  </div>
));

// ── Shared create/edit form ─────────────────────────────────────────────────
const TournamentFormFields = memo(({
  form, idPrefix, t, onChange, onLogoUpload, onSubmit, onCancel, submitLabel, submitting,
}: {
  form: TournamentFormState;
  idPrefix: string;
  t: (k: string) => string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onLogoUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
  submitting: boolean;
}) => (
  <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <input type="text" name="tournamentName" placeholder={t('dashboard.page.create.name')}
      value={form.tournamentName} onChange={onChange} required autoFocus className="db-input" />

    <div>
      <label htmlFor={`${idPrefix}-logo`} className="db-input" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <FaUpload size={13} style={{ color: '#E11D2E', flexShrink: 0 }} />
        <span style={{ color: '#93959C' }}>{t('dashboard.page.create.logo')}</span>
      </label>
      <input id={`${idPrefix}-logo`} type="file" accept="image/*" onChange={onLogoUpload} style={{ display: 'none' }} />
      {form.torLogo && (
        <img src={form.torLogo} alt="Preview" style={{ width: 64, height: 64, objectFit: 'contain', border: '1px solid #24262B', marginTop: 8 }}
          loading="lazy" onError={e => e.currentTarget.src = './logo.png'} />
      )}
    </div>

   <div className="db-mono" style={{ fontSize: 9, color: '#E11D2E', letterSpacing: '2px', paddingTop: 2 }}>BRAND COLORS</div>
{COLOR_FIELDS.map(field => (
  <div key={field.name} className="db-color-row">
    <label
      className="db-color-preview"
      style={{
        position: 'relative',
        background: form[field.name] || 'transparent',
        cursor: 'pointer',
        display: 'block',
      }}
      title="Pick a color"
    >
      <input
        type="color"
        value={/^#([0-9A-Fa-f]{6})$/.test(form[field.name]) ? form[field.name] : '#000000'}
        onChange={e =>
          onChange({
            target: { name: field.name, value: e.target.value },
          } as ChangeEvent<HTMLInputElement>)
        }
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          border: 0,
          padding: 0,
          cursor: 'pointer',
        }}
      />
    </label>
    <input
      type="text"
      name={field.name}
      placeholder={t(`dashboard.page.create.${field.labelKey}`)}
      value={form[field.name]}
      onChange={onChange}
      className="db-input"
    />
  </div>
))}

    <div style={{ display: 'flex', gap: 10, paddingTop: 6, borderTop: '1px solid #24262B', marginTop: 2 }}>
      <button type="button" onClick={onCancel} className="db-btn-ghost" disabled={submitting}>{t('dashboard.page.create.cancel')}</button>
      <button type="submit" className="db-btn-primary" disabled={submitting} style={{ minWidth: 130, justifyContent: 'center' }}>
        {submitting ? (
          <>
            <FaSpinner size={12} className="db-spinner" />
            {submitLabel}
          </>
        ) : (
          submitLabel
        )}
      </button>
    </div>
  </form>
));

// ── Create/Edit modal ────────────────────────────────────────────────────────
const FormModal: React.FC<{
  mode: 'create' | 'edit';
  initial: TournamentFormState;
  t: (k: string) => string;
  onClose: () => void;
  onSubmit: (form: TournamentFormState) => Promise<void>;
}> = ({ mode, initial, t, onClose, onSubmit }) => {
  const [form, setForm] = useState<TournamentFormState>(initial);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setForm(prev => ({
        ...prev,
        [name]: value,
      }));
    },
    []
  );

  const handleLogoUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      if (!file) return;

      try {
        const url = await uploadToCloudinary(
          file,
          "tournaments/logos",
          "team_logo"
        );

        setForm(prev => ({
          ...prev,
          torLogo: url,
        }));
      } catch {
        alert("Upload failed");
      }
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (submitting) return;

      setSubmitting(true);

      try {
        await onSubmit(form);
      } catch (error) {
        console.error("Submit failed:", error);
      } finally {
        setSubmitting(false);
      }
    },
    [form, onSubmit, submitting]
  );

  return (
    <div
      className="db-modal-overlay"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="db-modal-box"
        onClick={e => e.stopPropagation()}
      >

        {/* HEADER */}

        <div className="db-modal-hdr">

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >

            <span className="db-pill">
              {mode === 'create'
                ? 'NEW'
                : 'EDIT'}
            </span>

            <span
              className="db-orb"
              style={{
                color: '#F4F2EE',
                fontSize: 15,
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              {mode === 'create'
                ? t('dashboard.page.create.title')
                : t('dashboard.page.edit.title')}
            </span>

          </div>

          <button
            className="db-modal-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            <FaTimes size={13} />
          </button>

        </div>


        {/* BODY */}

        <div className="db-modal-body">

          <TournamentFormFields
            form={form}
            idPrefix={mode}
            t={t}
            onChange={handleChange}
            onLogoUpload={handleLogoUpload}
            onSubmit={handleSubmit}
            onCancel={onClose}

            submitLabel={
              submitting
                ? (
                    mode === 'create'
                      ? 'ADDING...'
                      : 'UPDATING...'
                  )
                : (
                    mode === 'create'
                      ? t('dashboard.page.create.button')
                      : 'Save Changes'
                  )
            }

            submitting={submitting}
          />

        </div>

      </div>
    </div>
  );
};
const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [user, setUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  // Holds the CURRENT user id for use inside stable closures (e.g. the
  // socket listener registered once in useEffect with []). React state
  // (`user`) would be stale inside that closure; a ref never is.
  const userIdRef = useRef<string | null>(null);

  const tournamentsKey = (userId: string) => `${CACHE_KEY_BASE}_${userId}`;

  // --- Auth check ---
  // Always verifies identity against the server. If a stale cached user
  // (from a previous person on this browser) doesn't match the real
  // session, wipe their leftover data before trusting the new identity.
  const checkAuth = useCallback(async () => {
    try {
      const { data } = await api.get("/users/me");

      const cachedUser = getCache(GLOBAL_CACHE_KEY, 1000 * 60 * 5);
      if (cachedUser && cachedUser._id !== data._id) {
        removeCache(GLOBAL_CACHE_KEY);
        removeCache(tournamentsKey(cachedUser._id));
      }

      setCache(GLOBAL_CACHE_KEY, data);
      return data;
    } catch (err) {
      console.error("Auth check failed:", err);
      removeCache(GLOBAL_CACHE_KEY);
      return null;
    }
  }, []);

  // --- Fetch tournaments with caching (per user) ---
  const fetchTournaments = useCallback(async () => {
    const userData = await checkAuth();
    if (!userData) {
      navigate("/login");
      return;
    }
    setUser(userData);
    userIdRef.current = userData._id;

    socket.emit('join', userData._id);

    const key = tournamentsKey(userData._id);

    const cached = getCache(key, 1000 * 90);
    if (cached) {
      setTournaments(cached);
      return;
    }

    try {
      const { data } = await api.get<Tournament[]>("/tournaments");
      setTournaments(data);
      setCache(key, data);
    } catch (err: any) {
      console.error("Error fetching tournaments:", err.response?.data?.message || err.message);
    }
  }, [checkAuth, navigate]);

  useEffect(() => {
    fetchTournaments();

    const handleNewTournament = (tournament: Tournament) => {
      setTournaments((prev) => {
        if (prev.find((tr) => tr._id === tournament._id)) return prev;
        const updated = [...prev, tournament];
        if (userIdRef.current) {
          setCache(tournamentsKey(userIdRef.current), updated);
        }
        return updated;
      });
    };

    socket.on("newTournament", handleNewTournament);

    return () => {
      socket.off("newTournament", handleNewTournament);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleTournaments = useMemo(() => {
    if (!searchQuery) return tournaments;
    const q = searchQuery.toLowerCase();
    return tournaments.filter(tr => tr.tournamentName.toLowerCase().includes(q));
  }, [tournaments, searchQuery]);

  // --- Create ---
  const handleCreate = useCallback(async (form: TournamentFormState) => {
    try {
      const { data } = await api.post("/tournaments", form);
      setTournaments(prev => {
        const updated = [...prev, data];
        if (userIdRef.current) setCache(tournamentsKey(userIdRef.current), updated);
        return updated;
      });
      setShowForm(false);
      setToast(t('dashboard.page.messages.created'));
    } catch (err: any) {
      console.error("Error creating tournament:", err.response?.data?.message || err.message);
      alert(t('dashboard.page.messages.updateFailed'));
    }
  }, [t]);

  // --- Edit ---
  const handleEditSave = useCallback(async (form: TournamentFormState) => {
    if (!editingTournament) return;
    try {
      const { data: updatedTournament } = await api.put<Tournament>(
        `/tournaments/${editingTournament._id}`, form
      );
      setTournaments(prev => {
        const updated = prev.map(tr => tr._id === updatedTournament._id ? updatedTournament : tr);
        if (userIdRef.current) setCache(tournamentsKey(userIdRef.current), updated);
        return updated;
      });
      setEditingTournament(null);
      setToast(t('dashboard.page.messages.updated'));
    } catch (err: any) {
      console.error("Edit error:", err.response?.data?.message || err.message);
      alert(t('dashboard.page.messages.updateFailed'));
    }
  }, [editingTournament, t]);

  // --- Delete ---
  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this tournament?")) return;
    try {
      await api.delete(`/tournaments/${id}`);
      setTournaments(prev => {
        const updated = prev.filter(tr => tr._id !== id);
        if (userIdRef.current) setCache(tournamentsKey(userIdRef.current), updated);
        return updated;
      });
      alert(t('dashboard.page.messages.deleted'));
    } catch (err: any) {
      console.error("Delete error:", err.response?.data?.message || err.message);
      alert(t('dashboard.page.messages.deleteFailed'));
    }
  }, [t]);

  const handleLogout = useCallback(async () => {
    await stopAllPolling();
    try {
      await api.post("/users/logout");
    } catch (err) {
      console.error("Logout error:", err);
      // proceed with client-side cleanup even if the server call fails
    }

    removeCache(GLOBAL_CACHE_KEY);
    if (userIdRef.current) {
      removeCache(tournamentsKey(userIdRef.current));
    }
    localStorage.removeItem("user");
    SocketManager.getInstance().updateAuthToken(null);
    SocketManager.getInstance().forceDisconnect();

    setUser(null);
    setTournaments([]);
    userIdRef.current = null;

    navigate("/login");
  }, [navigate]);

  return (
    <div className="db-root" style={{ minHeight: '100vh', background: '#0B0C0E' }}>
      <style>{STYLES}</style>
      <div className="db-glow" />

      <TopNav user={user} onLogout={handleLogout} />

      <div className="db-page">
        <div className="db-header-row">
          <div>
            <div className="db-eyebrow" style={{ marginBottom: 8 }}>
              <span className="db-eyebrow-dot" /> TOURNAMENT MANAGEMENT
            </div>
            <h1 className="db-orb" style={{ fontSize: 28, fontWeight: 800, color: '#F4F2EE', letterSpacing: '-0.01em', marginBottom: 6, textTransform: 'uppercase' }}>
              {t('dashboard.page.title')}
            </h1>
            <p style={{ color: '#93959C', fontSize: 14, maxWidth: 480 }}>{t('dashboard.page.subtitle')}</p>
          </div>
          <button className="db-btn-primary" onClick={() => setShowForm(true)}>
            <FaPlus size={12} /> {t('dashboard.page.addTournament')}
          </button>
        </div>

        <div className="db-toolbar">
          <SearchInput onSearchChange={setSearchQuery} />
          <span className="db-mono" style={{ fontSize: 11, color: '#55565C' }}>{visibleTournaments.length} / {tournaments.length} shown</span>
          <div className="db-stats">
            <div className="db-stat">
              <span className="db-orb" style={{ fontSize: 15, fontWeight: 800, color: '#E11D2E' }}>{tournaments.length}</span>
              <span className="db-mono" style={{ fontSize: 9, color: '#55565C', letterSpacing: '1px' }}>TOURNAMENTS</span>
            </div>
          </div>
        </div>

        {visibleTournaments.length === 0 ? (
          <div className="db-empty">
            <div className="db-empty-icon-wrap"><FaTrophy size={26} style={{ color: '#E11D2E', opacity: 0.7 }} /></div>
            <h3 className="db-orb" style={{ fontSize: 16, color: '#F4F2EE', marginBottom: 8, textTransform: 'uppercase' }}>
              {tournaments.length === 0 ? t('dashboard.page.empty.title') : 'No tournaments match your search'}
            </h3>
            <p style={{ color: '#93959C', marginBottom: 24, fontSize: 14 }}>
              {tournaments.length === 0 ? t('dashboard.page.empty.desc') : 'Try a different name.'}
            </p>
            {tournaments.length === 0 && (
              <button className="db-btn-primary" style={{ margin: '0 auto' }} onClick={() => setShowForm(true)}>
                <FaPlus size={12} /> {t('dashboard.page.empty.button')}
              </button>
            )}
          </div>
        ) : (
          <div className="db-grid">
            {visibleTournaments.map(tr => (
              <TournamentCard key={tr._id} tournament={tr} onEdit={setEditingTournament} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <FormModal mode="create" initial={EMPTY_FORM} t={t} onClose={() => setShowForm(false)} onSubmit={handleCreate} />
      )}

      {editingTournament && (
        <FormModal
          mode="edit"
          initial={{
            tournamentName: editingTournament.tournamentName,
            torLogo: editingTournament.torLogo || '',
            primaryColor: editingTournament.primaryColor || '',
            secondaryColor: editingTournament.secondaryColor || '',
            overlayBg: editingTournament.overlayBg || '',
          }}
          t={t}
          onClose={() => setEditingTournament(null)}
          onSubmit={handleEditSave}
        />
      )}

      {toast && (
        <div className="db-toast">
          <span className="db-toast-dot" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
};

export default Dashboard;