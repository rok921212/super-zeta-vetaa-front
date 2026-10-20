import { createWorker, PSM, Worker as TesseractWorker } from 'tesseract.js';

/** A recognized word with its box in the (preprocessed) image's pixel space. */
export interface OcrWord {
  text: string;
  confidence: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Worker, wasm core and eng.traineddata are copied into public/tesseract by
// scripts/copy-tesseract.js, so OCR never needs the network.
function assetUrl(path: string) {
  return new URL(`${process.env.PUBLIC_URL || ''}${path}`, window.location.href).href;
}

let workerPromise: Promise<TesseractWorker> | null = null;

function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng', 1 /* LSTM_ONLY */, {
        workerPath: assetUrl('/tesseract/worker.min.js'),
        corePath: assetUrl('/tesseract/core'),
        langPath: assetUrl('/tesseract/lang'),
        gzip: true,
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: '1',
      });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

const SCALE = 2;
// Game result screens draw white text on dark *and* gold panels. Gold has a
// low blue channel and the dark panels are dark everywhere, so the minimum
// RGB channel isolates the white text on both.
const TEXT_MIN_CHANNEL = 150;

/** Upscales and binarizes a screenshot into dark text on a white background. */
async function preprocess(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width * SCALE;
  canvas.height = bitmap.height * SCALE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.min(d[i], d[i + 1], d[i + 2]) >= TEXT_MIN_CHANNEL ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Runs OCR on one result screenshot and returns its words. */
export async function recognizeScreenshot(file: Blob): Promise<{ words: OcrWord[]; width: number }> {
  const [worker, canvas] = await Promise.all([getWorker(), preprocess(file)]);
  const { data } = await worker.recognize(canvas);
  const words = (data.words ?? [])
    .filter((w) => w.text.trim())
    .map((w) => ({
      text: w.text.trim(),
      confidence: w.confidence,
      x0: w.bbox.x0,
      y0: w.bbox.y0,
      x1: w.bbox.x1,
      y1: w.bbox.y1,
    }));
  return { words, width: canvas.width };
}
