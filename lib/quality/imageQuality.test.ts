import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assessImageQuality } from './imageQuality';

// uses the dataset images; skips if data/ is absent
const manifestPath = join(process.cwd(), 'data', 'manifest.jsonl');
const rows = existsSync(manifestPath)
  ? readFileSync(manifestPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];
const pathOf = (id: string) => {
  const r = rows.find((x) => x.id === id);
  return r ? join(process.cwd(), 'data', r.image_path) : '';
};

(rows.length ? describe : describe.skip)('image-quality gate', () => {
  it('flags the blurry image (AI-REVIEW-002)', async () => {
    expect((await assessImageQuality(pathOf('AI-REVIEW-002'))).ok).toBe(false);
  });

  it('passes a clean image (AI-CORRECT-001)', async () => {
    expect((await assessImageQuality(pathOf('AI-CORRECT-001'))).ok).toBe(true);
  });
});
