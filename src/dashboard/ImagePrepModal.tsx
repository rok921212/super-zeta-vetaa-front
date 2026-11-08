import React, { useMemo } from 'react';
import type { ImageKind } from '../utils/imagePrep';
import ImageStudio from './imageStudio/ImageStudio';

// One picked picture → the image studio (background removal, marking, crop,
// fixed-size PNG — all on this computer). Kept for callers that handle one
// file at a time (tournament logo frames). The team form uses ImageStudio
// directly so logo + all player photos can go in together.

const KIND_LABEL: Record<ImageKind, string> = { logo: 'Team logo', flag: 'Team flag', player: 'Player photo' };

const ImagePrepModal: React.FC<{
  file: File;
  kind: ImageKind;
  /** Replaces the heading ("Team logo") for pages that aren't about teams. */
  title?: string;
  /** Uploads the chosen blob; the modal closes when it resolves. */
  upload: (blob: Blob, filename: string) => Promise<void>;
  onClose: () => void;
}> = ({ file, kind, title, upload, onClose }) => {
  const files = useMemo(() => [file], [file]);
  return (
    <ImageStudio
      title={title ?? KIND_LABEL[kind]}
      initialFiles={files}
      kind={kind}
      uploadOne={(_target, _kind, blob, filename) => upload(blob, filename)}
      onClose={onClose}
    />
  );
};

export default ImagePrepModal;
