// live evidence spike. image -> evidence record -> quality gate -> verify() -> compare to expected.
// run: npx tsx scripts/spike.ts   env: MODEL, DETAIL (high/auto/low), PER (images per bucket)
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { verify, inferBeverage } from '../lib/policy/index';
import type { ApplicationFields } from '../lib/policy/types';
import { extractLabelEvidence } from '../lib/extract/extract';
import { assessImageQuality } from '../lib/quality/imageQuality';
import { loadEnv } from './_shared';

loadEnv();

const PER = Number(process.env.PER ?? 2);

// beverage type comes from the application form in the real app; infer it from class/type here (lib/policy/beverage)
const norm = (s: any) => String(s ?? '').replace(/\s+/g, ' ').trim();
const DECISION: Record<string, string> = { correct: 'approve', wrong: 'reject', needs_review: 'needs_review' };
const FIELDS = ['brand_name', 'class_type', 'alcohol_content', 'net_contents', 'producer_name', 'producer_address', 'country_of_origin', 'government_warning_text'];

async function main() {
  const manifest = readFileSync(join(process.cwd(), 'data', 'manifest.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));

  const buckets: Record<string, any[]> = {};
  for (const r of manifest) if (r.category.startsWith('ai_')) (buckets[r.category] ??= []).push(r);
  const rows = Object.values(buckets).flatMap((b) => b.slice(0, PER));

  console.log(`model=${process.env.MODEL ?? 'gpt-5.4-mini'} detail=${process.env.DETAIL ?? 'high'} | ${rows.length} images\n`);
  let decisionHits = 0;
  let fieldHits = 0;
  let fieldTotal = 0;
  const latencies: number[] = [];

  for (const r of rows) {
    const abs = join(process.cwd(), 'data', r.image_path);
    const mime = 'image/' + extname(abs).slice(1).toLowerCase().replace('jpg', 'jpeg');
    const app: ApplicationFields = { ...r.application_fields, beverage_type: inferBeverage(r.application_fields.class_type) };

    const { evidence, latencyMs, confidence } = await extractLabelEvidence(readFileSync(abs), mime);
    const gate = await assessImageQuality(abs);
    latencies.push(latencyMs);

    const result = verify(app, evidence); // gate is advisory only now; printed below, not routed on
    const expected = DECISION[r.expected_decision] ?? r.expected_decision;
    const okDecision = result.decision === expected;
    if (okDecision) decisionHits++;

    const gw = evidence.government_warning;
    console.log(`[${r.id}] ${r.expected_decision} -> expect ${expected} | got ${result.decision} ${okDecision ? 'OK' : 'MISS'}`);
    console.log(`  ${(latencyMs / 1000).toFixed(1)}s conf=${confidence?.toFixed(3)} gate=${gate.ok ? 'ok' : 'FAIL:' + gate.reasons.join(',')} | warn(visible=${gw.visible} caps=${gw.header_all_caps} bold=${gw.header_bold} contrast_issue=${gw.contrast_issue})`);

    // field-level read accuracy vs manifest observed truth
    const obs = r.observed_label_fields;
    if (obs) {
      for (const k of FIELDS) {
        if (obs[k] === undefined) continue;
        fieldTotal++;
        const got = k === 'government_warning_text' ? norm(evidence.government_warning.text) : norm((evidence as any)[k]?.value);
        const truth = norm(obs[k]);
        if (got === truth) fieldHits++;
        else console.log(`  misread ${k}: got=${JSON.stringify(got).slice(0, 64)} truth=${JSON.stringify(truth).slice(0, 64)}`);
      }
    }
    if (!okDecision) console.log(`  reasons: ${result.checks.filter((c) => c.status !== 'pass').map((c) => `${c.field}:${c.status}`).join(', ') || 'none'}`);
    console.log();
  }

  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log('--- summary ---');
  console.log(`decisions:  ${decisionHits}/${rows.length} correct`);
  console.log(`field reads: ${fieldHits}/${fieldTotal} exact (${((100 * fieldHits) / fieldTotal).toFixed(0)}%)`);
  console.log(`latency:    mean ${(mean(latencies) / 1000).toFixed(1)}s  max ${(Math.max(...latencies) / 1000).toFixed(1)}s  (budget 5s)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
