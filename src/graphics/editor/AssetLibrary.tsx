// The Assets tab: the account's uploaded images. Upload by button or by
// dropping files here, see progress and per-file errors, click an image to use
// it (into the selected frame / image layer, else as a new layer), rename,
// delete. The same grid is the picker the inspector and the Image tool open.

import React, { memo, useRef, useState } from 'react';
import { apiErrorMessage, formatBytes, type AssetInfo } from '../api.ts';
import { ASSET_ACCEPT, assetFileUrl, assetThumbUrl, imageFilesOf } from '../renderer/assets.ts';
import { usedByOf, type AssetLibraryApi } from './useAssets.ts';
import { Modal } from './dialogs.tsx';
import { Btn, cx } from './ui.tsx';

const CHECKER: React.CSSProperties = {
  backgroundColor: '#17171c',
  backgroundImage: 'linear-gradient(45deg,#202027 25%,transparent 25%),linear-gradient(-45deg,#202027 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#202027 75%),linear-gradient(-45deg,transparent 75%,#202027 75%)',
  backgroundSize: '12px 12px',
  backgroundPosition: '0 0,0 6px,6px -6px,-6px 0',
};

/** The small picture shown for an asset: its stored thumbnail, else the image itself. */
export const assetPreviewUrl = (a: AssetInfo): string => (a.hasThumb ? assetThumbUrl(a._id) : assetFileUrl(a._id));

export interface AssetGridProps {
  library: AssetLibraryApi;
  /** What a click on an image does ("Use" in the tab, "Choose" in a picker). */
  onPick(asset: AssetInfo): void;
  /** The asset currently in use by the selected layer. */
  currentId?: string | null;
  disabled?: boolean;
  /** Rename / delete controls (the tab has them, a picker does not). */
  manage?: boolean;
  pickLabel?: string;
  /** More columns (the picker dialog is wider than the side panel). */
  wide?: boolean;
}

export const AssetGrid = memo(function AssetGrid({ library, onPick, currentId, disabled, manage, pickLabel = 'Use', wide }: AssetGridProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<{ asset: AssetInfo; drafts: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const assets = library.assets;
  const q = query.trim().toLowerCase();
  const shown = (assets || []).filter((a) => !q || a.name.toLowerCase().includes(q));

  const take = (files: File[]) => {
    if (disabled) return;
    if (!files.length) { setNotice('Only PNG, JPEG, WebP and SVG images can be uploaded.'); return; }
    setNotice(null);
    void library.upload(files);
  };

  const commitRename = async () => {
    if (!renaming) return;
    const { id, name } = renaming;
    setRenaming(null);
    const cur = assets?.find((a) => a._id === id);
    if (!cur || !name.trim() || name.trim() === cur.name) return;
    try { await library.rename(id, name.trim()); } catch (err) { setNotice(apiErrorMessage(err, 'Rename failed')); }
  };

  const remove = async (asset: AssetInfo, force = false) => {
    setBusy(asset._id);
    setNotice(null);
    try {
      await library.remove(asset._id, force);
      setConfirm(null);
    } catch (err) {
      const used = usedByOf(err);
      // On air: never deletable. In drafts only: the user may insist.
      if (used && used.published === 0 && used.drafts > 0 && !force) setConfirm({ asset, drafts: used.drafts });
      else { setConfirm(null); setNotice(apiErrorMessage(err, 'Delete failed')); }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={cx('flex min-h-full flex-col gap-2 p-2', over && 'bg-amber-400/5 outline-dashed outline-1 outline-amber-400/60')}
      data-testid="asset-grid"
      onDragOver={(e) => { if (!disabled && Array.from(e.dataTransfer?.types || []).includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); take(imageFilesOf(e.dataTransfer?.files)); }}
    >
      <div className="flex items-center gap-1.5">
        <Btn small active disabled={disabled || !!library.error} onClick={() => input.current?.click()}>Upload images</Btn>
        <input
          ref={input}
          type="file"
          multiple
          accept={ASSET_ACCEPT}
          className="hidden"
          data-testid="asset-file-input"
          onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; take(imageFilesOf(files).length === files.length ? files : imageFilesOf(files)); }}
        />
        <input
          type="search"
          aria-label="Search images"
          placeholder="Search"
          className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-0.5 text-[11px] text-slate-100 outline-none focus:border-amber-400/60"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
      <div className="text-[10px] text-slate-500">PNG, JPEG, WebP or SVG, up to 4 MB each. Drop files here or onto the canvas.</div>

      {library.error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-200" role="alert">
          {library.error} <button type="button" className="underline" onClick={() => void library.reload()}>Retry</button>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-100" role="status">
          <span className="min-w-0 flex-1">{notice}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>✕</button>
        </div>
      )}

      {library.uploads.map((u) => (
        <div key={u.key} className={cx('rounded border p-1.5 text-[11px]', u.status === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-white/10 bg-white/[0.03] text-slate-300')} data-upload={u.status}>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate" title={u.name}>{u.name}</span>
            <span>{u.status === 'uploading' ? `${Math.round(u.progress * 100)}%` : u.status === 'done' ? 'Uploaded' : 'Failed'}</span>
            {u.status === 'error' && <button type="button" aria-label="Dismiss" onClick={() => library.dismissUpload(u.key)}>✕</button>}
          </div>
          {u.status === 'uploading' && <div className="mt-1 h-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-amber-400" style={{ width: `${Math.round(u.progress * 100)}%` }} /></div>}
          {u.error && <div className="mt-0.5">{u.error}</div>}
        </div>
      ))}

      {!assets && !library.error && <div className="text-[11px] text-slate-500" role="status">Loading images…</div>}
      {assets && assets.length === 0 && !library.error && (
        <div className="rounded border border-dashed border-white/10 p-4 text-center text-[11px] text-slate-500">
          No images yet. Upload player portraits, team logos or backgrounds to use them in any design.
        </div>
      )}
      {assets && assets.length > 0 && shown.length === 0 && <div className="text-[11px] text-slate-500">No image is named like “{query}”.</div>}

      <div className={cx('grid gap-2', wide ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2')}>
        {shown.map((a) => (
          <div key={a._id} className={cx('overflow-hidden rounded border', currentId === a._id ? 'border-amber-400/70' : 'border-white/10')} data-asset-id={a._id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(a)}
              title={`${pickLabel} “${a.name}”`}
              aria-label={`${pickLabel} ${a.name}`}
              draggable
              onDragStart={(e) => { e.dataTransfer.setData('application/x-scoresync-asset', a._id); e.dataTransfer.effectAllowed = 'copy'; }}
              className="block aspect-square w-full disabled:opacity-40"
              style={CHECKER}
            >
              <img src={assetPreviewUrl(a)} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-contain" />
            </button>
            <div className="p-1.5">
              {renaming?.id === a._id ? (
                <input
                  autoFocus
                  aria-label="Image name"
                  className="w-full rounded border border-amber-400/50 bg-black/40 px-1 text-[11px] text-slate-100 outline-none"
                  value={renaming.name}
                  maxLength={120}
                  onChange={(e) => setRenaming({ id: a._id, name: e.target.value })}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') void commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                  onBlur={() => void commitRename()}
                />
              ) : (
                <div className="truncate text-[11px] text-slate-200" title={a.name}>{a.name}</div>
              )}
              <div className="truncate text-[10px] text-slate-500">{a.width && a.height ? `${a.width} × ${a.height} · ` : ''}{formatBytes(a.size)}</div>
              {manage && (
                <div className="mt-1 flex gap-1">
                  <Btn small disabled={disabled} onClick={() => setRenaming({ id: a._id, name: a.name })}>Rename</Btn>
                  <Btn small danger disabled={busy === a._id} onClick={() => void remove(a)}>{busy === a._id ? '…' : 'Delete'}</Btn>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {confirm && (
        <Modal title="This image is still used" onClose={() => setConfirm(null)} width={420}>
          <p className="mb-3 text-xs text-slate-300">
            “{confirm.asset.name}” is used by {confirm.drafts} design{confirm.drafts === 1 ? '' : 's'}. If you delete it, those layers show an empty frame until you choose another image. Nothing that is published uses it.
          </p>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setConfirm(null)}>Keep it</Btn>
            <Btn danger disabled={busy === confirm.asset._id} onClick={() => void remove(confirm.asset, true)}>Delete anyway</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
});

/** The picker the inspector and the Image tool open: the same library, in a dialog. */
export function AssetPickerDialog({ library, currentId, title = 'Choose an image', onPick, onClose }: {
  library: AssetLibraryApi; currentId?: string | null; title?: string; onPick(asset: AssetInfo): void; onClose(): void;
}) {
  return (
    <Modal title={title} onClose={onClose} width={640}>
      <div className="max-h-[60vh] overflow-auto" data-testid="asset-picker">
        <AssetGrid library={library} currentId={currentId} wide pickLabel="Choose" onPick={(a) => { onPick(a); onClose(); }} />
      </div>
    </Modal>
  );
}
