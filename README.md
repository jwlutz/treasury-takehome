# Label check

AI-assisted TTB label-compliance triage: upload a label photo plus the submitted application values, and the app clears / flags / sends-to-review, with the reason for every call.

**Live demo:** https://treasury-takehome-liard.vercel.app

## Run it

```bash
npm install
echo "OPENAI_API_KEY=sk-..." > .env
npm run dev          # http://localhost:3000
```

```bash
npm test             # unit tests (engine, csv, generator)
npm run test:e2e     # Playwright UI tests (home, verify, batch, guide, feedback)
npm run eval         # scores the model+pipeline against the labelled fixtures
npm run eval:logic   # same scoring, based on rules only, no API calls
```

## The problem and the stance

Examiners are drowning in routine label checks. Most labels are fine and should clear without a human, the clearly-broken ones should reject, and only the genuinely-uncertain ones should reach a person. The error that matters is a **false clear** (waving through a noncompliant label), which is far worse than a false flag, so the system is built to drive false clears to zero, not to maximize raw accuracy.

## Approach

**The model perceives, the code decides.** The vision model only produces an evidence record (what text and visual facts are on the label, via OpenAI structured outputs so the shape can't be hallucinated). Every compliance verdict is plain deterministic code, so each decision is auditable ("abv 45 != 40") and unit-testable, and a rule can change without retraining.

Four calls define the behavior:
- **Two kinds of blank.** A required field truly absent from the label is a reject; a field that's present but unreadable is a review. Not the same thing.
- **The warning is strict, everything else is fuzzy.** Brand, producer, etc. are normalized and fuzzy-matched (real labels vary in case and punctuation). The government warning must match verbatim with the header in caps and bold, because that's the regulation.
- **Image quality is the model's read, not a pixel gate.** A soft or glary photo is fine if the model can read it; quality only matters when it actually costs a read, which surfaces as an unreadable field that routes to review on its own.
- **Review only when it genuinely can't tell.** A confident read off an imperfect photo gets compared, not punted to a human.

Free cross-check: stated proof should equal 2x ABV, which catches a garbled number for nothing.

## Results

Scored against the 24 provided synthetic fixtures (clean labels plus on-purpose edge cases: abv mismatch, title-case warning, missing warning, foreign warning, missing fields, glare, skew):

- **0 false clears**, **0 false rejects**
- **8% sent to human review** (only genuine judgment calls)
- 92% match vs ground truth, ~3.1s average
- The two ground-truth "misses" are the system reading through a glared/skewed photo and deciding it instead of reviewing, which is the intended triage behavior

Details and the confusion matrix: [docs/eval.md](docs/eval.md). Re-run with `npm run eval`.

## Tradeoffs and what's next

Architecture decisions, each with its genuine tradeoff, are in [docs/decisions.md](docs/decisions.md); the original scoping notes are in [docs/spec.md](docs/spec.md).

Honest gaps:
- The **risk-coverage curve** (the headline differentiator: "to hold false clears under 1% we auto-clear X%") is designed but not yet built. The eval set doubles as its data set.
- The eval is 24 crisp synthetic labels, a clean engine test, not a real-world accuracy estimate. On noisy real photos, extraction is the harder part.

## Constraints and production notes

- **~5s budget per verify** (~3s in practice).
- **Blocked-outbound target environment:** the agency's prod network blocks outbound, so a real deployment would swap a self-hosted vision model for OpenAI (same "model perceives" seam, no code change downstream). This is also a security win: no submission data leaves the boundary. The hosted demo above calls OpenAI because Vercel is not that restricted environment.
- **No PII at rest:** images are processed in memory only, never written to disk; usage and state are session-only.
- **Roles are mocked** (agent / supervisor) to show the workflow split; production would need real SSO, per-user scoping, and an audit log. Full prod-hardening list is in [docs/decisions.md](docs/decisions.md).

## Layout

- `lib/policy/` — the decision engine (normalize, warning, verify) + tests
- `lib/extract/` — evidence extraction (the model)
- `lib/pipeline.ts` — extract -> verify
- `app/` — single-label page, batch dashboard + review queue, usage, the guide assistant
- `scripts/eval.ts` — the evaluation harness
- `data/eval/` — the 24 labelled fixtures
- `docs/` — spec, decisions, eval

## Stack

Next.js 16 (App Router) + React 19 + TypeScript, OpenAI `gpt-5.4-mini` for extraction and the guide and `gpt-image-1` for generated test labels, hand-rolled CSS for full control over contrast and accessibility. Deployed on Vercel.
