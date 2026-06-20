// eval harness: run the labelled fixtures through the real pipeline (model extract + quality gate +
// verify) and score against ground truth. also runs a "logic-only" pass straight off the dataset's
// observed_label_fields (no model) so we can tell a rules bug from an extraction miss.
//
//   npx tsx scripts/eval.ts            # full set, model in the loop (needs OPENAI_API_KEY)
//   npx tsx scripts/eval.ts --logic    # logic-only, no api calls
//
// fixtures live in data/eval/ (the 24 ALBV synthetic cases: crisp text, known dispositions).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verify } from '../lib/policy';
import type { ApplicationFields, Decision, EvidenceRecord } from '../lib/policy/types';
import { verifyImage } from '../lib/pipeline';
import { loadEnv, pool, EVAL_DIR, loadFixtures, appOf, imagePath } from './_shared';

const DECISIONS: Decision[] = ['approve', 'needs_review', 'reject'];

interface Row {
  id: string;
  beverage_type: ApplicationFields['beverage_type'];
  application_fields: Omit<ApplicationFields, 'beverage_type'>;
  observed_label_fields: any;
  label_artwork: { png: string; degradation: string };
  expected_decision: Decision;
  title: string;
}

// build an evidence record from the dataset's observed fields = a perfect read, for the logic-only pass
function evidenceFromObserved(o: any): EvidenceRecord {
  const fe = (v: any) => ({ value: v ?? null, visible: v != null && v !== '', legible: true, evidence_text: v ?? null, location_note: 'front label' });
  const wt: string = o.government_warning_text ?? '';
  const header = (wt.match(/^\s*(government\s+warning:?)/i) ?? [])[1] ?? null;
  return {
    brand_name: fe(o.brand_name),
    class_type: fe(o.class_type),
    alcohol_content: fe(o.alcohol_content),
    net_contents: fe(o.net_contents),
    producer_name: fe(o.producer_name),
    producer_address: fe(o.producer_address),
    country_of_origin: fe(o.country_of_origin),
    government_warning: {
      text: wt || null,
      visible: !!wt,
      legible: true,
      header_text: header,
      header_all_caps: header ? header === header.toUpperCase() && /[A-Z]/.test(header) : null,
      header_bold: o.government_warning_header_bold ?? null,
      separate_from_other_text: true,
      contrast_issue: false,
    },
    extra_statement: fe(o.extra_statement),
  };
}

function matrix(pairs: { expected: Decision; got: Decision }[]) {
  const m: Record<string, Record<string, number>> = {};
  for (const e of DECISIONS) m[e] = { approve: 0, needs_review: 0, reject: 0 };
  for (const p of pairs) m[p.expected][p.got]++;
  return m;
}

function printMatrix(title: string, m: Record<string, Record<string, number>>) {
  console.log(`\n${title} (rows = expected, cols = predicted)`);
  console.log('               approve  review  reject');
  for (const e of DECISIONS) {
    console.log(`  ${e.padEnd(12)} ${String(m[e].approve).padStart(6)} ${String(m[e].needs_review).padStart(7)} ${String(m[e].reject).padStart(7)}`);
  }
}

async function main() {
  const logicOnly = process.argv.includes('--logic');
  loadEnv();
  if (!logicOnly && !process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set (needed for the model pass). use --logic for the no-api pass.');
    process.exit(1);
  }
  const rows = loadFixtures() as Row[];
  console.log(`eval: ${rows.length} fixtures from data/eval/  |  mode: ${logicOnly ? 'logic-only (no model)' : 'model + logic'}`);

  const t0 = Date.now();
  const results = await pool(rows, logicOnly ? rows.length : 4, async (r) => {
    const app = appOf(r);
    const logic = verify(app, evidenceFromObserved(r.observed_label_fields)).decision;
    if (logicOnly) return { id: r.id, expected: r.expected_decision, deg: r.label_artwork.degradation, logic, got: logic, latencyMs: 0, confidence: null as number | null, reasons: [] as string[] };
    const buf = readFileSync(imagePath(r.id));
    const res = await verifyImage(buf, app, 'image/png');
    const reasons = res.checks.filter((c) => c.severity === 'error' || c.severity === 'warning').map((c) => `${c.field}:${c.severity}`);
    return { id: r.id, expected: r.expected_decision, deg: r.label_artwork.degradation, logic, got: res.decision, latencyMs: res.latencyMs, confidence: res.confidence, reasons };
  });

  // per-item table
  console.log('\n id        expected      logic-only    predicted     ok   deg        reasons');
  for (const x of results) {
    const ok = x.got === x.expected ? '✓ ' : '✗ ';
    console.log(`  ${x.id.padEnd(9)} ${x.expected.padEnd(13)} ${x.logic.padEnd(13)} ${x.got.padEnd(13)} ${ok}  ${x.deg.padEnd(9)} ${x.reasons.join(', ')}`);
  }

  const acc = results.filter((x) => x.got === x.expected).length;
  const logicAcc = results.filter((x) => x.logic === x.expected).length;
  const reviewRate = results.filter((x) => x.got === 'needs_review').length;
  // the scary error: ground truth says reject (a real violation) but we cleared it
  const falseClears = results.filter((x) => x.expected === 'reject' && x.got === 'approve');
  const falseRejects = results.filter((x) => x.expected === 'approve' && x.got === 'reject');
  const avgLatency = logicOnly ? 0 : Math.round(results.reduce((s, x) => s + x.latencyMs, 0) / results.length);

  printMatrix('model+logic' + (logicOnly ? ' (logic-only)' : ''), matrix(results.map((x) => ({ expected: x.expected, got: x.got }))));

  console.log(`\nsummary`);
  console.log(`  accuracy (predicted vs expected):   ${acc}/${results.length} (${((acc / results.length) * 100).toFixed(0)}%)`);
  if (!logicOnly) console.log(`  logic-only accuracy (perfect read): ${logicAcc}/${results.length} (${((logicAcc / results.length) * 100).toFixed(0)}%)`);
  console.log(`  sent to human review:               ${reviewRate}/${results.length} (${((reviewRate / results.length) * 100).toFixed(0)}%)`);
  console.log(`  FALSE CLEARS (reject -> approve):   ${falseClears.length}${falseClears.length ? '  !! ' + falseClears.map((x) => x.id).join(', ') : '  (none)'}`);
  console.log(`  false rejects (approve -> reject):  ${falseRejects.length}${falseRejects.length ? '  ' + falseRejects.map((x) => x.id).join(', ') : '  (none)'}`);
  if (!logicOnly) console.log(`  avg extract latency:                ${avgLatency}ms`);

  // disagreements worth eyeballing (we differ from ground truth)
  const diffs = results.filter((x) => x.got !== x.expected);
  if (diffs.length) {
    console.log(`\ndisagreements vs ground truth:`);
    for (const x of diffs) console.log(`  ${x.id} (${x.deg}): expected ${x.expected}, got ${x.got}  [${x.reasons.join(', ') || 'no flags'}]`);
  }

  writeFileSync(join(EVAL_DIR, 'results.json'), JSON.stringify({ mode: logicOnly ? 'logic' : 'model', n: results.length, accuracy: acc, logicAccuracy: logicAcc, reviewRate, falseClears: falseClears.map((x) => x.id), falseRejects: falseRejects.map((x) => x.id), avgLatencyMs: avgLatency, ranAtMs: Date.now(), totalMs: Date.now() - t0, results }, null, 2));
  console.log(`\nwrote data/eval/results.json  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
