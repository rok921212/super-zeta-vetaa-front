// Country flag picker: search a public flag collection (flagcdn.com, every
// ISO 3166 country plus England/Scotland/Wales/N. Ireland, EU and UN), click
// one, and it is copied to our own Cloudinary folder (teams/flags) exactly
// like an uploaded flag — so overlays never depend on flagcdn at show time.
// "Upload my own picture" hands back to the normal file upload.
//
// Country names come from the browser (Intl.DisplayNames), so the list is a
// short string of codes rather than a 250-row table.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { uploadToCloudinary } from '../utils/cloudinaryUpload.tsx';

const CODES = (
  'ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ' +
  'ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr ' +
  'ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ' +
  'ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz ' +
  'na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw ' +
  'sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ' +
  'ua ug um us uy uz va vc ve vg vi vn vu wf ws xk ye yt za zm zw'
).split(' ');

/** Flags flagcdn has that are not ISO countries (no browser name for them). */
const EXTRA: Record<string, string> = {
  'gb-eng': 'England', 'gb-sct': 'Scotland', 'gb-wls': 'Wales', 'gb-nir': 'Northern Ireland',
  eu: 'European Union', un: 'United Nations', xk: 'Kosovo',
};

/** Other names people search by. */
const ALIASES: Record<string, string> = {
  us: 'usa america united states', gb: 'uk britain great britain england', ae: 'uae emirates dubai',
  kr: 'korea south korea', kp: 'north korea dprk', ru: 'russia', cn: 'china prc', tw: 'taiwan',
  vn: 'vietnam', tr: 'turkey turkiye', cz: 'czech republic czechia', nl: 'holland netherlands',
  ci: 'ivory coast', mm: 'burma myanmar', sa: 'ksa saudi', ps: 'palestine', ir: 'iran', la: 'laos',
  sy: 'syria', mk: 'macedonia', sz: 'swaziland eswatini', cv: 'cape verde', bo: 'bolivia',
  ve: 'venezuela', md: 'moldova', tz: 'tanzania', cd: 'drc congo kinshasa', cg: 'congo brazzaville',
  va: 'vatican holy see', ph: 'philippines', bd: 'bangladesh', np: 'nepal', pk: 'pakistan', in: 'india bharat',
};

export interface FlagEntry { code: string; name: string; search: string }

let cached: FlagEntry[] | null = null;
export function flagList(): FlagEntry[] {
  if (cached) return cached;
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* very old browser: codes only */ }
  const all = [...CODES, ...Object.keys(EXTRA).filter((c) => !CODES.includes(c))].map((code) => {
    let name = EXTRA[code] || '';
    if (!name) { try { name = names?.of(code.toUpperCase()) || ''; } catch { /* unknown code */ } }
    name = name || code.toUpperCase();
    return { code, name, search: `${name} ${code} ${ALIASES[code] || ''}`.toLowerCase() };
  });
  cached = all.sort((a, b) => a.name.localeCompare(b.name));
  return cached;
}

export const flagThumb = (code: string) => `https://flagcdn.com/w80/${code}.png`;
const flagFull = (code: string) => `https://flagcdn.com/w640/${code}.png`;

/** Copy one flagcdn flag into our Cloudinary flag folder; returns its URL. */
export async function uploadCountryFlag(code: string): Promise<string> {
  try {
    const res = await fetch(flagFull(code), { mode: 'cors' });
    if (!res.ok) throw new Error(`flag download failed (${res.status})`);
    return await uploadToCloudinary(await res.blob(), 'teams/flags', 'team_flag', `${code}.png`);
  } catch {
    // Browser could not read the picture (network/CORS): let Cloudinary fetch it itself.
    const form = new FormData();
    form.append('file', flagFull(code));
    form.append('upload_preset', 'team_flag');
    form.append('folder', 'teams/flags');
    const r = await axios.post('https://api.cloudinary.com/v1_1/dczgqqgdp/image/upload', form);
    return r.data.secure_url;
  }
}

const CSS = `
.fp-back { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.72); display: flex; align-items: center; justify-content: center; padding: 16px; }
.fp-box { width: min(720px, 100%); max-height: min(640px, 100%); display: flex; flex-direction: column; background: #111214; border: 1px solid #24262B; color: #E8E9EC; font-family: inherit; }
.fp-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid #24262B; }
.fp-title { font-weight: 700; letter-spacing: .08em; font-size: 13px; flex: 1; }
.fp-x { background: none; border: 0; color: #93959C; font-size: 20px; cursor: pointer; line-height: 1; }
.fp-search { margin: 12px 16px 4px; padding: 10px 12px; background: #0B0C0E; border: 1px solid #24262B; color: #E8E9EC; font-size: 14px; outline: none; }
.fp-search:focus { border-color: #E11D2E; }
.fp-note { padding: 4px 16px 8px; font-size: 12px; color: #93959C; min-height: 18px; }
.fp-note.err { color: #FF6B6B; }
.fp-grid { flex: 1; overflow-y: auto; padding: 4px 16px 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
.fp-item { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 6px; background: #0B0C0E; border: 1px solid #24262B; color: #C9CBD0; cursor: pointer; font-size: 12px; text-align: center; }
.fp-item:hover:not(:disabled) { border-color: #E11D2E; color: #fff; }
.fp-item:disabled { opacity: .45; cursor: wait; }
.fp-item.busy { opacity: 1; border-color: #E11D2E; }
.fp-item img { width: 56px; height: 40px; object-fit: cover; border: 1px solid #24262B; background: #1a1b1e; }
.fp-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 16px; border-top: 1px solid #24262B; font-size: 12px; color: #93959C; }
.fp-own { background: none; border: 1px solid #24262B; color: #E8E9EC; padding: 8px 12px; cursor: pointer; font-size: 12px; letter-spacing: .06em; }
.fp-own:hover { border-color: #E11D2E; }
`;

interface Props {
  open: boolean;
  onClose: () => void;
  /** The uploaded flag's URL (our Cloudinary). */
  onPicked: (url: string, country: FlagEntry) => void;
  /** Optional: offer "upload my own picture" (opens the normal file upload). */
  onUploadOwn?: () => void;
}

const FlagPicker: React.FC<Props> = ({ open, onClose, onPicked, onUploadOwn }) => {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const all = useMemo(() => (open ? flagList() : []), [open]);

  useEffect(() => {
    if (!open) return;
    setQuery(''); setError(null); setBusy(null);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    const words = q.split(/\s+/);
    const hits = all.filter((f) => words.every((w) => f.search.includes(w)));
    // Exact code or name-start matches first ("in" → India before Argentina).
    const rank = (f: FlagEntry) => (f.code === q ? 0 : f.name.toLowerCase().startsWith(q) ? 1 : 2);
    return hits.sort((a, b) => rank(a) - rank(b));
  }, [all, query]);

  if (!open) return null;

  const pick = async (f: FlagEntry) => {
    if (busy) return;
    setBusy(f.code); setError(null);
    try {
      const url = await uploadCountryFlag(f.code);
      onPicked(url, f);
      onClose();
    } catch (e: any) {
      setError(`Could not add the ${f.name} flag: ${e?.response?.data?.error?.message || e?.message || 'upload failed'}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fp-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <style>{CSS}</style>
      <div className="fp-box" role="dialog" aria-label="Choose a country flag">
        <div className="fp-head">
          <span className="fp-title">CHOOSE A COUNTRY FLAG</span>
          <button type="button" className="fp-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <input
          ref={inputRef}
          className="fp-search"
          placeholder="Search a country (e.g. India, Brazil, KR, UAE)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && shown[0]) { e.preventDefault(); pick(shown[0]); } }}
        />
        <div className={`fp-note${error ? ' err' : ''}`}>
          {error || (busy ? 'Adding flag…' : `${shown.length} flag${shown.length === 1 ? '' : 's'} · click one to use it (Enter picks the first)`)}
        </div>
        <div className="fp-grid">
          {shown.map((f) => (
            <button key={f.code} type="button" className={`fp-item${busy === f.code ? ' busy' : ''}`} disabled={!!busy} onClick={() => pick(f)} title={f.name}>
              <img src={flagThumb(f.code)} alt="" loading="lazy" decoding="async" width={56} height={40} />
              <span>{busy === f.code ? 'Adding…' : f.name}</span>
            </button>
          ))}
          {!shown.length && <div style={{ gridColumn: '1 / -1', color: '#93959C', fontSize: 13, padding: 12 }}>No country matches “{query}”.</div>}
        </div>
        <div className="fp-foot">
          <span>Flags from flagcdn.com, saved to your team like an upload.</span>
          {onUploadOwn && (
            <button type="button" className="fp-own" disabled={!!busy} onClick={() => { onClose(); onUploadOwn(); }}>
              UPLOAD MY OWN PICTURE
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FlagPicker;
