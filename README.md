# label check

ai-assisted TTB label compliance triage. upload a label photo + the submitted application values -> clear / flag / review, with a reason for every call. triage, not auto-approve.

live: https://treasury-takehome-liard.vercel.app

## run it

- `bun install`
- add `OPENAI_API_KEY=sk-...` to `.env`
- `bun run dev` (http://localhost:3000)
- `bun run test` (38 unit tests), `bun run test:e2e` (8 playwright flows)
- `bun run eval` (scores the pipeline vs the labelled fixtures), `bun run eval:logic` (rules only, no api)
- `bun run risk-coverage` (computes the auto-clear operating point; visualized at `/risk-coverage`)

## the idea

- the model only EXTRACTS an evidence record (openai structured outputs, so it can't hallucinate the shape). the code DECIDES, deterministically -> every call is auditable ("abv 45 != 40"), unit-testable, and a rule can change without retraining
- the scary error is a false clear (waving through a noncompliant label), worse than a false flag -> built to drive false clears to zero, not to chase accuracy
- review only when it genuinely can't read it. image quality never routes on its own. warning is strict (verbatim, caps + bold header); everything else is fuzzy. missing required field = reject, unreadable field = review

## results

- 0 false clears, 0 false rejects, 8% sent to review, 92% vs ground truth, ~3.1s. details in `docs/eval.md`
- re-run: `bun run eval`

## where to look

- `docs/spec.md` — original scope, plan, and build checklist
- `docs/decisions.md` — every architecture decision with its genuine tradeoff (start here for the "why")
- `docs/eval.md` — how it's scored + the numbers + the limitations
- `lib/policy/` — the decision engine: `verify.ts` (the calls), `warning.ts`, `normalize.ts`, + tests
- `lib/extract/extract.ts` — evidence extraction (the model's only job)
- `lib/pipeline.ts` — extract -> verify
- `scripts/eval.ts` + `data/eval/` — the eval harness + the 24 labelled fixtures
- `app/` — single-label page, batch dashboard + review queue, usage, the guide assistant

## where the prompts live

- extraction: `lib/extract/extract.ts` — `SYSTEM` + `SCHEMA`, kept together so the prompt and the schema can't drift
- guide assistant: `app/api/chat/route.ts`
- generated test labels: `lib/generate.ts` — `imagePrompt()`

## constraints

- ~5s per verify (single pass, ~3s in practice)
- target prod blocks outbound -> a real deploy swaps a self-hosted vision model for openai (same "model perceives" seam, nothing downstream changes; also a security win, no submission data leaves the boundary). the hosted demo uses openai because vercel isn't that locked-down env
- no pii: images are processed in memory only, never written to disk; usage + state are session-only
- roles are mocked (agent / supervisor) to show the workflow split, no real auth. full prod-hardening list in `docs/decisions.md`

## stack

nextjs 16 (app router) + react 19 + typescript, openai `gpt-5.4-mini` (extraction + guide) and `gpt-image-1` (generated test labels), hand-rolled css for full contrast/accessibility control. deployed on vercel.
