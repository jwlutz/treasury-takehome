// risk-coverage analysis: how much can we auto-decide while bounding the scary error (false clears)?
// runs the pipeline over the labelled fixtures, then sweeps a confidence threshold -- only trust an
// auto approve/reject when the read confidence clears the bar, otherwise send it to review. plots
// coverage (% auto-decided) against the false-clear rate, and picks the operating point for a target.
//   bun run risk-coverage              # target 1% false clears
//   TARGET=0.005 bun run risk-coverage # stricter budget
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ApplicationFields, Decision } from '../lib/policy/types';
import { verifyImage } from '../lib/pipeline';

function loadEnv() {
  const p = join(process.cwd(), '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const DIR = join(process.cwd(), 'data', 'eval');
const TARGET = Number(process.env.TARGET ?? 0.01);
const r3 = (x: number) => Math.round(x * 1000) / 1000;

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }));
  return out;
}

async function main() {
  loadEnv();
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set (the model pass needs it).');
    process.exit(1);
  }
  const rows = readFileSync(join(DIR, 'ground_truth.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  console.log(`risk-coverage: ${rows.length} fixtures, target false-clear rate <= ${(TARGET * 100).toFixed(1)}%\n`);

  const items = await pool(rows, 4, async (r: any) => {
    const app: ApplicationFields = { beverage_type: r.beverage_type, ...r.application_fields };
    const res = await verifyImage(readFileSync(join(DIR, 'images', `${r.id}.png`)), app, 'image/png');
    return { id: r.id as string, expected: r.expected_decision as Decision, decision: res.decision, confidence: res.confidence ?? 0 };
  });

  const total = items.length;
  // the rules auto-decide approve/reject; needs_review is held for a human regardless of confidence
  const auto = items.filter((i) => i.decision !== 'needs_review');
  const thresholds = [0, ...new Set(auto.map((i) => i.confidence))].sort((a, b) => a - b);

  // at each confidence bar: cover only the auto-decisions above the bar, measure the error among them
  const points = thresholds.map((t) => {
    const covered = auto.filter((i) => i.confidence >= t);
    const falseClears = covered.filter((i) => i.decision === 'approve' && i.expected === 'reject').length;
    const errors = covered.filter((i) => i.decision !== i.expected).length;
    return {
      threshold: r3(t),
      coverage: r3(covered.length / total),
      falseClearRate: covered.length ? r3(falseClears / covered.length) : 0,
      errorRate: covered.length ? r3(errors / covered.length) : 0,
      covered: covered.length,
      falseClears,
    };
  });

  // operating point = the most coverage we can buy while staying under the false-clear budget
  const feasible = points.filter((p) => p.falseClearRate <= TARGET).sort((a, b) => b.coverage - a.coverage);
  const op = feasible[0] ?? points[points.length - 1];
  const falseClearsTotal = items.filter((i) => i.decision === 'approve' && i.expected === 'reject').length;

  const out = {
    total,
    autoDecidable: auto.length,
    reviewRate: r3((total - auto.length) / total),
    target: TARGET,
    falseClearsTotal,
    operatingPoint: op,
    points,
    items: items.map((i) => ({ id: i.id, confidence: r3(i.confidence), decision: i.decision, expected: i.expected })),
  };
  writeFileSync(join(DIR, 'risk-coverage.json'), JSON.stringify(out, null, 2));

  console.log(' confidence bar   coverage   false-clear rate   error rate');
  for (const p of points) {
    console.log(`   >= ${p.threshold.toFixed(3)}      ${(p.coverage * 100).toFixed(0).padStart(3)}%        ${(p.falseClearRate * 100).toFixed(1).padStart(5)}%           ${(p.errorRate * 100).toFixed(1).padStart(5)}%`);
  }
  console.log(`\noperating point (false clears <= ${(TARGET * 100).toFixed(1)}%): auto-clear ${(op.coverage * 100).toFixed(0)}% at confidence >= ${op.threshold.toFixed(3)}, review the rest`);
  console.log(`total false clears on the set: ${falseClearsTotal}`);
  console.log(`wrote data/eval/risk-coverage.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
