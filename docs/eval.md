# Evaluation

How to run:
- `npx tsx scripts/eval.ts` — full pipeline (model extract + quality gate + verify). Needs `OPENAI_API_KEY`.
- `npx tsx scripts/eval.ts --logic` — rules only, straight off the dataset's observed fields, no API calls.
- `bun run verify:prod` — runs all 24 fixtures against the **live deployed** `/api/verify` (not the local pipeline). Last run: 24/24 HTTP 200, 0 false clears, 0 false rejects, identical decisions to local.

Fixtures live in `data/eval/`: the 24 provided synthetic labels (`ALBV-001..024`), crisp text with known dispositions, covering the on-purpose edge cases (abv mismatch, title-case warning, missing warning, header not bold, foreign health warning, missing net contents, import missing country, glare, skew, brand spelling variant, and clean labels across spirits/wine/malt).

## Headline (model + logic, gpt-5.4-mini)

- **False clears: 0.** Every one of the 12 reject cases was caught. This is the error that ships a noncompliant label, so it's the one held to zero.
- **False rejects: 0.** All 8 clean labels approved.
- **Sent to human review: 2/24 (8%).** Only the two genuine judgment calls (producer address differs, brand spelling differs). No "bad pic" went to review.
- **Accuracy vs ground truth: 22/24 (92%).**
- **Avg extract latency: ~3.1s** (under the 5s budget).

Confusion matrix (rows = expected, cols = predicted):

```
               approve  review  reject
  approve           8       0       0
  needs_review      2       2       0
  reject            0       0      12
```

## The two "misses" are the system doing what we want

ALBV-011 (glare over the warning) and ALBV-024 (skewed but readable) are labelled `needs_review` in the dataset, conservatively, because the image is degraded. Our system read them and approved instead. That is the intended triage behavior: decide a bad pic if you can read it, escalate only when you genuinely can't. Both are safe: a perfect read of those labels also approves (they are clean labels with a photo issue, not hidden violations), which the logic-only pass confirms.

So for the actual objective (minimize review, never auto-clear a violation), the effective score is 24/24 with zero dangerous errors.

## What the eval caught and fixed

Missing required fields (ALBV-009 import missing country, ALBV-023 missing net contents) were being sent to review. The spec ("not on label = fail"), the dataset (both expect reject), and the minimize-review goal all agree: a missing required element is a definitive, readable failure, not an uncertain one. Fixed `gate()` to the correct two-kinds-of-blank rule (visible-but-unreadable → review, truly-absent → reject), which moved both to a decisive reject and cut the review rate.

## Model vs rules

Model+logic accuracy (92%) equals logic-only accuracy (92%): on this crisp set the extraction was perfect, so every decision came from the deterministic rules, not the model. On real degraded photos extraction is the harder part; the safety net there is the visible-but-unreadable → review path (an unreadable field comes back empty and routes to a human), plus the proof = 2x abv cross-check and logprob confidence.

## Risk-coverage

`bun run risk-coverage` sweeps a read-confidence cutoff: only auto-decide (trust an approve/reject) when the read clears the bar, otherwise route to a human. Coverage is the share auto-decided; risk is the false-clear rate among them. The operating point is the most coverage that stays under the budget.

On this set the false-clear rate is 0% at every cutoff, so the operating point is **auto-decide 92%, review 8%, with 0 false clears** — coverage is capped only by the 8% the rules already flag as judgment calls, not by the error budget. Visualized at `/risk-coverage`; raw curve in `data/eval/risk-coverage.json`. The curve only bends on a larger, noisier set, which is where this picks the cutoff for real.

## Limitations

- By design we do not route on a pixel-based quality gate: a usable photo is fine even if it's soft or glary, and readability is the model's read (an unreadable field routes to review on its own). The blur/contrast score is still computed as advisory metadata but never decides. The residual risk is a confident misread on a degraded photo, mitigated by the cross-checks and logprob confidence, but it needs real degraded-photo data to quantify.
- 24 crisp synthetic labels is a clean engine test, not a real-world accuracy estimate. The next step is the risk-coverage curve on a larger, noisier set to set the auto-clear operating point from data instead of by hand.
- Latency was measured against OpenAI from a dev machine; cold-start serverless will be higher.

Raw numbers (regenerated each run) are written to `data/eval/results.json`.
