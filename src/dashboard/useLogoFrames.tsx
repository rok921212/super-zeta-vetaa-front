import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaChevronLeft, FaTimes } from 'react-icons/fa';
import ImagePrepModal from './ImagePrepModal';
import { uploadToCloudinary } from '../utils/cloudinaryUpload.tsx';
import { OUTPUT_SIZE } from '../utils/imagePrep';
import { buildAnimatedLogo } from '../utils/imagePrep/animatedLogo';

// The tournament logo field. Each picked file goes through ImagePrepModal, one
// after the other. One logo stays a static image; two or more become a looping
// GIF. Nothing is uploaded until the form is saved, so removing or reordering
// logos leaves no unused files in Cloudinary.

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const SECONDS_CHOICES = [1, 2, 3, 5];
const DEFAULT_SECONDS = 2;
const SIZE = OUTPUT_SIZE.logo.width;

interface Frame {
  id: number;
  blob: Blob;
  filename: string;
  url: string;
}

interface Output {
  blob: Blob;
  filename: string;
}

export interface LogoFrames {
  frames: Frame[];
  seconds: number;
  setSeconds: (seconds: number) => void;
  /** What the saved logo will look like; null while there are no new logos. */
  previewUrl: string | null;
  error: string | null;
  addFiles: (files: File[]) => void;
  remove: (id: number) => void;
  moveEarlier: (id: number) => void;
  /** Uploads the logo and returns its URL; null when no new logo was picked. */
  upload: () => Promise<string | null>;
  prepModal: React.ReactNode;
}

const tooBig = (blob: Blob) => blob.size > MAX_UPLOAD_BYTES;

export function useLogoFrames(): LogoFrames {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [queue, setQueue] = useState<{ id: number; file: File }[]>([]);
  const [batchSize, setBatchSize] = useState(0);
  const [seconds, setSeconds] = useState(DEFAULT_SECONDS);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  const output = useRef<Promise<Output | null>>(Promise.resolve(null));
  const framesRef = useRef(frames);
  framesRef.current = frames;

  useEffect(() => () => framesRef.current.forEach((frame) => URL.revokeObjectURL(frame.url)), []);

  // The final image, rebuilt on each change. upload() waits on the same promise.
  useEffect(() => {
    setError(null);
    if (frames.length === 0) {
      output.current = Promise.resolve(null);
      setPreviewUrl(null);
      return;
    }
    if (frames.length === 1) {
      output.current = Promise.resolve({ blob: frames[0].blob, filename: frames[0].filename });
      setPreviewUrl(frames[0].url);
      return;
    }
    let current = true;
    let url: string | null = null;
    const building = buildAnimatedLogo(frames.map((frame) => frame.blob), SIZE, seconds * 1000)
      .then((blob) => ({ blob, filename: 'tournament-logo.gif' }));
    output.current = building;
    building
      .then(({ blob }) => {
        if (!current) return;
        url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        if (tooBig(blob)) setError('The animated logo is over 5 MB. Remove a logo.');
      })
      .catch((err) => {
        console.error('Animated logo failed:', err);
        if (current) setError('Could not build the animated logo. Remove the logo that was just added.');
      });
    return () => {
      current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [frames, seconds]);

  const addFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    setBatchSize(files.length);
    setQueue(files.map((file) => ({ id: nextId.current++, file })));
  }, []);

  const collect = useCallback(async (blob: Blob, filename: string) => {
    if (tooBig(blob)) throw new Error('Max file size is 5MB');
    const frame = { id: nextId.current++, blob, filename, url: URL.createObjectURL(blob) };
    setFrames((prev) => [...prev, frame]);
  }, []);

  const remove = useCallback((id: number) => {
    setFrames((prev) => {
      const gone = prev.find((frame) => frame.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((frame) => frame.id !== id);
    });
  }, []);

  const moveEarlier = useCallback((id: number) => {
    setFrames((prev) => {
      const at = prev.findIndex((frame) => frame.id === id);
      if (at < 1) return prev;
      const next = [...prev];
      [next[at - 1], next[at]] = [next[at], next[at - 1]];
      return next;
    });
  }, []);

  const upload = useCallback(async () => {
    const result = await output.current;
    if (!result) return null;
    return uploadToCloudinary(result.blob, 'tournaments/logos', 'team_logo', result.filename);
  }, []);

  const pending = queue[0];
  const prepModal = pending ? (
    <ImagePrepModal
      key={pending.id}
      file={pending.file}
      kind="logo"
      title={batchSize > 1 ? `Tournament logo ${batchSize - queue.length + 1} of ${batchSize}` : 'Tournament logo'}
      upload={collect}
      // Closes after "Use image" and after Cancel: Cancel skips this logo.
      onClose={() => setQueue((prev) => prev.slice(1))}
    />
  ) : null;

  return { frames, seconds, setSeconds, previewUrl, error, addFiles, remove, moveEarlier, upload, prepModal };
}

const STYLES = `
.lf-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.lf-frame { position: relative; width: 64px; height: 64px; border: 1px solid #24262B; background: #131418; }
.lf-frame img { width: 100%; height: 100%; object-fit: contain; display: block; }
.lf-btn { position: absolute; top: 2px; width: 18px; height: 18px; padding: 0; display: flex; align-items: center; justify-content: center; background: rgba(11,12,14,0.85); border: 1px solid #24262B; color: #F4F2EE; cursor: pointer; }
.lf-btn:hover { border-color: #E11D2E; color: #E11D2E; }
.lf-note { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; color: #93959C; font-size: 12px; }
.lf-note select { background: #131418; border: 1px solid #24262B; color: #F4F2EE; padding: 3px 6px; font-size: 12px; }
.lf-err { color: #E11D2E; font-size: 12px; margin-top: 6px; }
`;

/** The picked logos, shown under the upload button. */
export const LogoFramesList: React.FC<{ logo: LogoFrames }> = ({ logo }) => {
  if (!logo.frames.length) return null;
  const animated = logo.frames.length > 1;
  return (
    <>
      <style>{STYLES}</style>
      <div className="lf-row">
        {logo.frames.map((frame, index) => (
          <div className="lf-frame" key={frame.id}>
            <img src={frame.url} alt={`Logo ${index + 1}`} />
            {index > 0 && (
              <button type="button" className="lf-btn" style={{ left: 2 }} aria-label={`Move logo ${index + 1} earlier`} onClick={() => logo.moveEarlier(frame.id)}>
                <FaChevronLeft size={9} />
              </button>
            )}
            <button type="button" className="lf-btn" style={{ right: 2 }} aria-label={`Remove logo ${index + 1}`} onClick={() => logo.remove(frame.id)}>
              <FaTimes size={9} />
            </button>
          </div>
        ))}
      </div>
      <div className="lf-note">
        {animated ? (
          <>
            <span>{logo.frames.length} logos, saved as an animated GIF. Each shows for</span>
            <select aria-label="Seconds per logo" value={logo.seconds} onChange={(e) => logo.setSeconds(Number(e.target.value))}>
              {SECONDS_CHOICES.map((s) => <option key={s} value={s}>{s}s</option>)}
            </select>
          </>
        ) : (
          <span>One logo, saved as a static image. Add another to animate.</span>
        )}
      </div>
      {logo.error && <div className="lf-err">{logo.error}</div>}
    </>
  );
};
