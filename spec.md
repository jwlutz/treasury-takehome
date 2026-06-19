upload label pic(s) -> check against the application values -> clear / flag / review. triage, not auto-approve. basically inventory recon again.

## flow
- upload image + expected values (come WITH the submission, not a db to download)
- model reads fields off the image
- code compares + decides
- clear / flagged / needs review (reason if review). review pile to a dashboard, agent works it

## key split
- model only EXTRACTS. code DECIDES. keeps it auditable "abv 45 != 40"
- forced structured output, never guess a field
- two kinds of blank: not on label = fail (missing required) vs can't read = review. not the same thing

## fields
brand, class/type, abv, net contents, bottler name+addr, country of origin (imports), govt warning
- all fuzzy match EXCEPT the warning (normalize case/space/punct -> STONE'S THROW = Stone's Throw)
- warning strict: exact text, only "GOVERNMENT WARNING" caps+bold (not the whole thing), title-case = reject
- free cross-check: proof should = 2x abv
- use structured outputs

## confidence / routing
- not just "rate confidence 1-10"
- blend: agreement across a couple samples + did it actually quote the text off the label + the cross-checks
- cascade: one fast pass, only escalate the unsure ones -> stays under 5s
- cutoff comes from data, not a vibes 90%
- skip logprobs, skip multi-model council (correlated errors, not mathematically worth it)

## batch
- many files / folder + csv manifest (filename → expected values)
- results table sortable + status line: "247 done: 198 cleared, 31 flagged, 18 review"
- parallelize for batches?

## usability
- big browse button AND drag-drop, paste, photo
- "try an example" so you don't have to upload anything to see it work
- minimal typing, plain words, big + high contrast
- result is obvious: big green/amber/red + the reason

## differentiator
- risk-coverage curve → "to keep false-clears under 1% we auto-clear X%". bounds the scary error, puts a number on sarah's "drowning in routine"

## test data
- generate labels myself + write the expected values (own both sides)
- ~30-50, on-purpose edge cases: clean, abv off, title-case warning, missing warning, glare→review, STONE'S THROW, proof≠2×abv
- doubles as the risk-coverage set

## stretch
- golden test set page on the site, live dispositions + running accuracy
- "generate & test match / mismatch" buttons
  - svg/html template → png, NOT diffusion (garbles text + needs blocked outbound). mismatch = perturb one field
- glare/angle photo demo maybe
- accessibility mode on by default:
  - chatbot that will highlight buttons and explain processes
  - tunable behavior (what do we do with missing fields, or just add this to assumptions that we assumed xyz)

## constraints
- ~5s to verify (vendor died at 30-40s). image-gen demo exempt
- network blocks outbound: acknowledge in readme, prod would need a local model
- no pii, don't store images, session memory only
- standalone, no cola integration

## roles — fake it
- agent: queue + approve/reject. supervisor: batch summary + metrics. role switcher, no real auth

## stack
- nextjs + vercel, serverless route hides the key, gpt vision? need to check model costs

## open Qs
- fuzzy threshold? tune on the test set
- how real do the generated labels need to look?

## build

- [x] decision engine: normalize + warning + verify, beverage + field aware (lib/policy) + 23 tests
- [x] evidence extraction: gpt-5.4-mini, forced structured output, model only EXTRACTS (lib/extract)
- [x] image-quality gate: blur + contrast, independent of the model (lib/quality) + 2 tests
- [x] pipeline: extract + gate run in parallel -> verify (lib/pipeline)
- [x] single-label page: drag-drop/browse upload, app-values form, big 3-state result + reasons
- [x] /api/verify: key stays server-side, nothing written to disk
- [x] try an example: one of each outcome, no upload needed
- [x] batch: csv manifest + images -> bounded-concurrency run, live status line, sortable table (quote-aware csv + 5 tests)
- [x] review dashboard + role switch: dashboard metrics / review queue with clear-or-reject override
- [x] accessibility guide chat: on-by-default assistant, explains the flow + points at on-screen elements (/api/chat -> {say, highlight})
- [ ] tunable missing-field policy (strict/lenient) wired into verify() + surfaced in the guide
- [ ] risk-coverage curve
- [ ] accessibility pass: keyboard + screen reader + contrast audit
- [ ] readme (setup, approach, tradeoffs) + deploy to vercel
- [ ] stretch: golden test set page, generate + test match/mismatch buttons

