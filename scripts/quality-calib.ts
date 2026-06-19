// prints image-quality metrics per image, grouped by category, so we can pick separating thresholds.
// run: npx tsx scripts/quality-calib.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeMetrics } from '../lib/quality/imageQuality';

async function main() {
  const manifest = readFileSync(join(process.cwd(), 'data', 'manifest.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  const byCat: Record<string, any[]> = {};
  for (const r of manifest) (byCat[r.category] ??= []).push(r);

  for (const [cat, rows] of Object.entries(byCat)) {
    console.log(`\n### ${cat}`);
    for (const r of rows) {
      const m = await computeMetrics(join(process.cwd(), 'data', r.image_path));
      const issue = r.known_issues?.[0]?.message ?? '';
      console.log(
        `  ${r.id.padEnd(16)} blur=${m.blur.toFixed(0).padStart(6)} glare=${(m.glare * 100).toFixed(1).padStart(5)}% contrast=${m.contrast.toFixed(1).padStart(5)}  ${issue}`,
      );
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
