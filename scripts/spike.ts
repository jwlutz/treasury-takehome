// live extraction spike. image -> gpt vision (strict structured output + logprobs) -> verify() -> compare to expected.
// run: npx tsx scripts/spike.ts        env: MODEL, DETAIL (high/auto/low), PER (images per bucket)
import OpenAI from 'openai';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { verify } from '../lib/policy/index';
import type { ApplicationFields, Extraction } from '../lib/policy/types';

// load .env (no dep)
for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const MODEL = process.env.MODEL ?? 'gpt-4o-mini';
const DETAIL = (process.env.DETAIL ?? 'high') as 'high' | 'auto' | 'low';
const PER = Number(process.env.PER ?? 2); // images per ai_ bucket
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM = `You read U.S. alcohol beverage labels for TTB compliance. You are given a photo of one label. Transcribe the required fields EXACTLY as printed.

Rules:
- Copy text verbatim: keep capitalization, punctuation, spacing and symbols (e.g. "45% Alc./Vol."). Do not normalize, fix spelling, expand abbreviations, or infer.
- If a field is not visibly printed on the label, return null. Never guess it from the brand or product type.
- government_warning_text: transcribe the entire Government Warning verbatim. Reproduce the header's capitalization EXACTLY as printed: if it shows "Government Warning" or any non-uppercase form, copy it that way and do NOT change it to "GOVERNMENT WARNING". The exact casing and punctuation are compliance signals, so copy them character-for-character. Transcribe what is printed, never what you expect. null if no warning is shown.
- government_warning_header_bold: true only if the "GOVERNMENT WARNING" header is visibly bolder/heavier than the text after it.
- extra_statement: any extra standalone statement near the warning (e.g. "CONTAINS SULFITES"); "" if none.
- legible: set to false if ANY required text is degraded by glare, blur, low contrast, skew, or cropping, EVEN IF you can still guess it. Only set true when every required field is crisp and clearly readable. When in doubt, set false.
- legibility_note: which field/issue when legible is false, else "".
- field_confidence: 0.0-1.0, how sure you are each field was read correctly.`;

const STR = { type: ['string', 'null'] };
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'brand_name', 'class_type', 'alcohol_content', 'net_contents', 'producer_name',
    'producer_address', 'country_of_origin', 'government_warning_text',
    'government_warning_header_bold', 'extra_statement', 'legible', 'legibility_note', 'field_confidence',
  ],
  properties: {
    brand_name: STR, class_type: STR, alcohol_content: STR, net_contents: STR,
    producer_name: STR, producer_address: STR, country_of_origin: STR,
    government_warning_text: STR,
    government_warning_header_bold: { type: 'boolean' },
    extra_statement: { type: 'string' },
    legible: { type: 'boolean' },
    legibility_note: { type: 'string' },
    field_confidence: {
      type: 'object',
      additionalProperties: false,
      required: ['brand_name', 'class_type', 'alcohol_content', 'net_contents', 'producer_name', 'producer_address', 'country_of_origin', 'government_warning'],
      properties: {
        brand_name: { type: 'number' }, class_type: { type: 'number' }, alcohol_content: { type: 'number' },
        net_contents: { type: 'number' }, producer_name: { type: 'number' }, producer_address: { type: 'number' },
        country_of_origin: { type: 'number' }, government_warning: { type: 'number' },
      },
    },
  },
};

async function extract(imagePath: string) {
  const abs = join(process.cwd(), 'data', imagePath);
  const b64 = readFileSync(abs).toString('base64');
  const ext = extname(abs).slice(1).toLowerCase().replace('jpg', 'jpeg');
  const t0 = Date.now();
  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    logprobs: true,
    response_format: { type: 'json_schema', json_schema: { name: 'label_extraction', strict: true, schema: SCHEMA } },
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the fields from this alcohol label.' },
          { type: 'image_url', image_url: { url: `data:image/${ext};base64,${b64}`, detail: DETAIL } },
        ],
      },
    ],
  });
  const ms = Date.now() - t0;
  const parsed = JSON.parse(res.choices[0].message.content ?? '{}');
  const lps = res.choices[0].logprobs?.content ?? [];
  const probs = lps.map((t) => Math.exp(t.logprob));
  const meanProb = probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : null;
  let minTok = { token: '', p: 1 };
  for (const t of lps) { const p = Math.exp(t.logprob); if (p < minTok.p) minTok = { token: t.token, p }; }
  return { parsed, ms, meanProb, minTok };
}

function toExtraction(f: any): Extraction {
  return {
    fields: {
      brand_name: f.brand_name ?? '',
      class_type: f.class_type ?? '',
      alcohol_content: f.alcohol_content ?? '',
      net_contents: f.net_contents ?? '',
      producer_name: f.producer_name ?? '',
      producer_address: f.producer_address ?? '',
      country_of_origin: f.country_of_origin ?? '',
      government_warning_text: f.government_warning_text ?? '',
      government_warning_header_bold: !!f.government_warning_header_bold,
      extra_statement: f.extra_statement ?? '',
    },
    legible: !!f.legible,
    qualityNote: f.legibility_note,
  };
}

const norm = (s: any) => String(s ?? '').replace(/\s+/g, ' ').trim();
const DECISION: Record<string, string> = { correct: 'approve', wrong: 'reject', needs_review: 'needs_review' };
const FIELDS = ['brand_name', 'class_type', 'alcohol_content', 'net_contents', 'producer_name', 'producer_address', 'country_of_origin', 'government_warning_text'];

async function main() {
  const manifest = readFileSync(join(process.cwd(), 'data', 'manifest.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));

  const buckets: Record<string, any[]> = {};
  for (const r of manifest) if (r.category.startsWith('ai_')) (buckets[r.category] ??= []).push(r);
  const rows = Object.values(buckets).flatMap((b) => b.slice(0, PER));

  console.log(`model=${MODEL} detail=${DETAIL} | ${rows.length} images\n`);
  let decisionHits = 0, fieldHits = 0, fieldTotal = 0;
  const latencies: number[] = [];

  for (const r of rows) {
    const { parsed, ms, meanProb, minTok } = await extract(r.image_path);
    latencies.push(ms);
    const extraction = toExtraction(parsed);
    const result = verify(r.application_fields, extraction);
    const expected = DECISION[r.expected_decision] ?? r.expected_decision;
    const ok = result.decision === expected;
    if (ok) decisionHits++;

    console.log(`[${r.id}] ${r.expected_decision} -> expect ${expected} | got ${result.decision} ${ok ? 'OK' : 'MISS'}`);
    console.log(`  ${(ms / 1000).toFixed(1)}s  conf(mean=${meanProb?.toFixed(3)} min-token="${minTok.token}"@${minTok.p.toFixed(2)})  legible=${extraction.legible}${extraction.legible ? '' : ' (' + parsed.legibility_note + ')'}`);

    // field-level read accuracy vs manifest observed truth
    const obs = r.observed_label_fields;
    if (obs) {
      for (const k of FIELDS) {
        if (obs[k] === undefined) continue;
        fieldTotal++;
        const got = norm((parsed as any)[k]);
        const truth = norm(obs[k]);
        if (got === truth) fieldHits++;
        else console.log(`  misread ${k}: got=${JSON.stringify(got).slice(0, 70)} truth=${JSON.stringify(truth).slice(0, 70)}`);
      }
    }
    if (!ok) console.log(`  reasons: ${result.checks.filter((c) => c.status !== 'pass').map((c) => `${c.field}:${c.status}`).join(', ') || 'none'}`);
    console.log();
  }

  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log('--- summary ---');
  console.log(`decisions:  ${decisionHits}/${rows.length} correct`);
  console.log(`field reads: ${fieldHits}/${fieldTotal} exact (${((100 * fieldHits) / fieldTotal).toFixed(0)}%)`);
  console.log(`latency:    mean ${(mean(latencies) / 1000).toFixed(1)}s  max ${(Math.max(...latencies) / 1000).toFixed(1)}s  (budget 5s)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
