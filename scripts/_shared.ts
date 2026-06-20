// shared helpers for the eval / verify scripts (eval.ts, risk-coverage.ts, verify-prod.ts, spike.ts).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ApplicationFields } from '../lib/policy/types';

// load .env into process.env (the lazy OpenAI client reads OPENAI_API_KEY at call time).
export function loadEnv() {
  const p = join(process.cwd(), '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// bounded-concurrency map: at most n calls to fn run at once; results keep input order.
export async function pool<T, R>(items: T[], n: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

export const EVAL_DIR = join(process.cwd(), 'data', 'eval');

// the labelled fixtures (ground_truth.jsonl), one parsed row each.
export function loadFixtures(): any[] {
  return readFileSync(join(EVAL_DIR, 'ground_truth.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
}

// the application form values for a fixture row (beverage_type lives at the top level, not in application_fields).
export function appOf(row: any): ApplicationFields {
  return { beverage_type: row.beverage_type, ...row.application_fields };
}

export const imagePath = (id: string) => join(EVAL_DIR, 'images', `${id}.png`);
