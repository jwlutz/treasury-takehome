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
- logprobs give a per-read confidence from the one call we already make (flipped the original "skip logprobs": cheaper than sampling N times for agreement, which would blow 5s)
- quoting the text off the label + the cross-checks feed in too
- still skip the multi-model council (correlated errors, not worth the cost)
- routing today is rules + field readability; confidence + the quality score are shown but don't auto-route yet
- cutoff comes from data, not a vibes 90% -> the risk-coverage curve (next to build)
- single pass is already <5s so no cascade needed yet

## batch
- many files / folder + csv manifest (filename → expected values)
- results table sortable + status line: "247 done: 198 cleared, 31 flagged, 18 review"
- parallelize for batches?

## usability
- big browse button AND drag & drop, paste, photo
- "try an example" so you don't have to upload anything to see it work
- minimal typing, plain words, big + high contrast
- result is obvious: big green/amber/red + the reason

## differentiator
- risk-coverage curve -> "to keep false-clears under 1% we auto-clear X%". bounds the scary error, puts a number on sarah's "drowning in routine"

## test data
- generate labels myself + write the expected values (own both sides)
- ~30-50, on-purpose edge cases: clean, abv off, title-case warning, missing warning, glare→review, STONE'S THROW, proof != 2×abv
- doubles as the risk-coverage set

## stretch
- golden test set page on the site, live dispositions + running accuracy
- "generate & test match / mismatch" buttons
  - svg/html template -> png, NOT diffusion (garbles text + needs blocked outbound). mismatch = perturb one field
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
- [x] image-quality helper: blur + contrast (lib/quality) + 2 tests. NOT in the verify path -- image quality never routes (a usable photo is fine; an unreadable field routes on its own). kept as a dev/calibration utility, out of the serverless function (sharp is native and was crashing it at load)
- [x] pipeline: extract -> verify (lib/pipeline)
- [x] single-label page: drag-drop/browse upload, app-values form, big 3-state result + reasons
- [x] /api/verify: key stays server-side, nothing written to disk
- [x] try an example: one of each outcome, no upload needed
- [x] batch: csv manifest + images -> adjustable-parallelism run, progress bar + eta, live status line, sortable table (quote-aware csv + 5 tests)
- [x] review dashboard + role switch: dashboard metrics / review queue (needs-review only) -> review modal with big image (click to enlarge), expected values, the AI reason, big accept/reject + advance
- [x] accessibility guide chat: on-by-default + minimizable assistant, explains the flow + points at on-screen elements with a red box (/api/chat -> {say, highlight})
- [x] usage tracking: nav tab (/usage) + rail panel, tokens / checks / chats / generated (session only, resets on reload)
- [x] report issue / feedback modal -> prefilled github issue (feedback/issue toggle)
- [x] paste-to-upload (browse + drag-drop + paste)
- [x] e2e: playwright covers the guide (answer + red box + minimize) and the feedback modal
- [x] home redesign: left-rail radial menu (try example / generate test fan a semicircle; batch links out), centered dropzone that swaps to the image, fields beside it on one screen
- [ ] tunable missing-field policy (strict/lenient) wired into verify() + surfaced in the guide
- [x] risk-coverage curve: scripts/risk-coverage.ts sweeps a read-confidence cutoff -> coverage vs false-clear rate + operating point; /risk-coverage page visualizes it (0 false clears, auto-decide 92%, review 8%)
- [x] weighted loading bar (app/ProgressBar.tsx): fills fast then decelerates over the expected duration + shows live wall-clock, on verify + generate; result shows real round-trip, not just model latency
- [x ] accessibility pass: keyboard + screen reader + contrast audit
- [x] readme (setup, approach, tradeoffs) + deploy to vercel
- [x] generate & test: live image-gen (gpt-image-1, portrait) of a compliant/noncompliant/random label -> verify live, expected vs got; offline svg template as the fallback when the image model is unavailable (+ 9 tests). caveat: the image model garbles exact numbers + the verbatim govt warning, so a "compliant" gen often still rejects -> it's an honest stress test of the verifier, not a guaranteed-pass. composite (photoreal bg + crisp text overlay) would make compliant gens reliable if we want that.
- [x] review only when the model genuinely can't read it: a confident value (even off a glared/soft photo) is compared, not punted; warning contrast is a note, not a trigger; the deterministic blur/contrast gate stays the safety net for unreadable images. test set re-curated to match (AI-REVIEW-001/003/005 -> compliant; 002/004 stay needs_review)
- [x] try-example randomizes from the full bank (~35 labels) by outcome bucket instead of a fixed pick; result renders under the image, not full-width
- [ ] stretch: golden test set page with running accuracy
- [x] value source toggle (single label, app/page.tsx): "given" (default everywhere -- fresh page, examples, generated tests, batch, even a bare upload) vs "fill from image". lookup mode skips the required-fields guard (/api/verify) and has the model read the label to stand in for the cola lookup; the read becomes the application, populates the now-editable form, and flips back to given. beverage type defaults to "other" until the read infers it. caveat: with only the image as input the looked-up values are the model's own read, so field matches self-pass -- the real signal in lookup mode is the warning/format/mandatory-presence checks (a field it can't read still routes to review/reject). honest label-only review, not the two-source compare the brief is really about (values are usually given: an agent matches a label against an existing application)
- [x] batch results: "top reason" column -> clickable label thumbnail that opens the existing lightbox; refreshed batch intro + review-queue-clear copy + home subtitle (application values = the cola-confirmed values we check the label against)

