// curated demo examples for "try an example". read straight from the labelled manifest so there is
// a single source of truth. server-only (touches the filesystem) - never import from a client file.
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { ApplicationFields } from './policy/types';
import { inferBeverage } from './policy';

export interface Example {
  id: string;
  title: string;
  blurb: string;
  application: ApplicationFields;
  image: string; // data url, so the client can both preview and submit it
  mime: string;
}

// one of each disposition, so the demo shows all three outcomes with no upload.
const PICKS: { id: string; title: string; blurb: string }[] = [
  { id: 'AI-CORRECT-001', title: 'compliant bourbon', blurb: 'everything matches' },
  { id: 'AI-WRONG-001', title: 'one field off', blurb: 'a deliberate mismatch' },
  { id: 'AI-REVIEW-001', title: 'rough photo', blurb: 'an image-quality issue' },
];

let cache: Example[] | null = null;

export function loadExamples(): Example[] {
  if (cache) return cache;
  const rows = readFileSync(join(process.cwd(), 'data', 'manifest.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  const byId = new Map<string, any>(rows.map((r: any) => [r.id, r]));

  cache = PICKS.map(({ id, title, blurb }) => {
    const r = byId.get(id);
    if (!r) throw new Error(`example ${id} is not in the manifest`);
    const f = r.application_fields;
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
    const abs = join(process.cwd(), 'data', r.image_path);
    const mime = 'image/' + extname(abs).slice(1).toLowerCase().replace('jpg', 'jpeg');
    const image = `data:${mime};base64,${readFileSync(abs).toString('base64')}`;
    return { id, title, blurb, application, image, mime };
  });
  return cache;
}
