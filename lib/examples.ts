// the demo "try an example" bank. read straight from the labelled manifest so there is a single
// source of truth. server-only (touches the filesystem) - never import from a client file.
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { ApplicationFields } from './policy/types';
import { inferBeverage } from './policy';

export type ExampleCategory = 'compliant' | 'noncompliant' | 'unclear' | 'real';

export interface Example {
  id: string;
  title: string;
  blurb: string;
  category: ExampleCategory;
  application: ApplicationFields;
  image: string; // data url, so the client can both preview and submit it
  mime: string;
}

// manifest expected_decision -> the bucket "try an example" randomizes within
const CATEGORY: Record<string, ExampleCategory> = {
  correct: 'compliant',
  wrong: 'noncompliant',
  needs_review: 'unclear',
  real_reference: 'real',
};

const BLURB: Record<ExampleCategory, string> = {
  compliant: 'everything should match',
  noncompliant: 'a deliberate problem on the label',
  unclear: 'a rough photo that may need a human',
  real: 'a real label scan',
};

let cache: Example[] | null = null;

// the whole bank, loaded once. ~35 labels: 5 compliant / 5 noncompliant / 5 review + 20 real scans.
function loadAll(): Example[] {
  if (cache) return cache;
  const rows = readFileSync(join(process.cwd(), 'data', 'manifest.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

  cache = rows
    .filter((r: any) => CATEGORY[r.expected_decision])
    .map((r: any) => {
      const category = CATEGORY[r.expected_decision];
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
      return { id: r.id, title: r.id, blurb: BLURB[category], category, application, image, mime };
    });
  return cache;
}

export function examplesByCategory(category: ExampleCategory): Example[] {
  return loadAll().filter((e) => e.category === category);
}

// one random example from a bucket, so "try an example" isn't the same label every time.
export function randomExample(category: ExampleCategory): Example | null {
  const pool = examplesByCategory(category);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// one of each disposition (legacy single-pick demo / fallback when no category is asked for)
export function loadExamples(): Example[] {
  return (['compliant', 'noncompliant', 'unclear'] as ExampleCategory[])
    .map((c) => examplesByCategory(c)[0])
    .filter(Boolean) as Example[];
}
