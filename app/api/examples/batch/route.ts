import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { inferBeverage } from '../../../../lib/policy';
import type { ApplicationFields } from '../../../../lib/policy/types';

export const runtime = 'nodejs';

// the manifest labels its ai images correct/wrong/needs_review; map to the engine's decision vocab
const EXPECTED: Record<string, string | null> = { correct: 'approve', wrong: 'reject', needs_review: 'needs_review' };

// a ready-made batch (the 15 ai labels) so the dashboard can be demoed with no csv + upload.
export function GET() {
  try {
    const rows = readFileSync(join(process.cwd(), 'data', 'manifest.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    const items = rows
      .filter((r: any) => String(r.category).startsWith('ai_'))
      .map((r: any) => {
        const f = r.application_fields;
        const abs = join(process.cwd(), 'data', r.image_path);
        const mime = 'image/' + extname(abs).slice(1).toLowerCase().replace('jpg', 'jpeg');
        const application: ApplicationFields = {
          beverage_type: inferBeverage(f.class_type),
          brand_name: f.brand_name,
          class_type: f.class_type,
          alcohol_content: f.alcohol_content,
          net_contents: f.net_contents,
          producer_name: f.producer_name,
          producer_address: f.producer_address,
          country_of_origin: f.country_of_origin,
        };
        return {
          id: r.id,
          filename: basename(r.image_path),
          expected: EXPECTED[r.expected_decision] ?? null, // demo only: lets the dashboard show accuracy
          application,
          image: `data:${mime};base64,${readFileSync(abs).toString('base64')}`,
          mime,
        };
      });
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'could not load batch examples' }, { status: 500 });
  }
}
