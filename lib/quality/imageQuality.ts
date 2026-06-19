// deterministic image-quality gate. independent of the model, which reads straight through
// glare/blur and reports legible=true. a degraded image -> human review, no matter how confident the model is.
import sharp from 'sharp';

export interface QualityMetrics {
  blur: number; // variance of the laplacian; low = blurry/soft
  glare: number; // fraction of blown-out near-white pixels; high = glare
  contrast: number; // stddev of luminance; low = washed out
}

export interface QualityVerdict {
  ok: boolean;
  reasons: string[];
  metrics: QualityMetrics;
}

// calibrated on the labelled set (scripts/quality-calib.ts). global pixel stats reliably
// separate only blur/softness; glare is dropped (real product photos hit 80-94% bright
// pixels, so the ratio can't isolate a glare streak). glare/crop/skew need local/geometric
// detection, out of scope here -> documented limitation.
export const THRESHOLDS = {
  blurMin: 1000, // laplacian variance; the soft/blurry review images sit at 89 and 955, clean images >= 1199
  contrastMin: 30, // safety floor for a genuinely washed-out image
};

export async function computeMetrics(input: string | Buffer): Promise<QualityMetrics> {
  // grayscale + downscale so the metrics are resolution-independent and fast
  const { data, info } = await sharp(input)
    .grayscale()
    .resize(512, 512, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  const w = info.width;
  const h = info.height;
  const lum = (x: number, y: number) => data[(y * w + x) * ch];

  // contrast (stddev) + glare (bright-pixel ratio) in one pass
  let sum = 0;
  let sumSq = 0;
  let bright = 0;
  const n = w * h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = lum(x, y);
      sum += v;
      sumSq += v * v;
      if (v >= 245) bright++;
    }
  }
  const mean = sum / n;
  const contrast = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  const glare = bright / n;

  // blur = variance of the 4-neighbor laplacian over interior pixels
  let lSum = 0;
  let lSumSq = 0;
  let lN = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const lap = 4 * lum(x, y) - lum(x - 1, y) - lum(x + 1, y) - lum(x, y - 1) - lum(x, y + 1);
      lSum += lap;
      lSumSq += lap * lap;
      lN++;
    }
  }
  const lMean = lSum / lN;
  const blur = lSumSq / lN - lMean * lMean;

  return { blur, glare, contrast };
}

export async function assessImageQuality(input: string | Buffer): Promise<QualityVerdict> {
  const metrics = await computeMetrics(input);
  const reasons: string[] = [];
  if (metrics.blur < THRESHOLDS.blurMin) reasons.push('image is too soft/blurry to read reliably');
  if (metrics.contrast < THRESHOLDS.contrastMin) reasons.push('label contrast is too low');
  return { ok: reasons.length === 0, reasons, metrics };
}
