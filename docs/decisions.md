**Which Vision Model?**
- chose openAI bc we get structured outputs which eliminates field-shape hallucination (every field present, right type); wrong values get caught by the extract-only prompt + cross-checks
- also gives us access to token logprobs which we can use for confidence estimations
- final pick gpt-5.4-mini for extraction + the guide, gpt-image-1 for label generation

**Model vs code decision?**
- model only emits an evidence record (what's visible); every verdict is plain deterministic code
- upside: auditable ("abv 45 != 40", not "the AI said reject"), unit-testable, same input same output, change a rule without retraining
- tradeoff: the code only catches what we encoded. label variety we didn't anticipate needs new rules. we traded model flexibility for control + defensibility, which is the right call for a regulatory tool. in practice we would catch edge cases within hours to days with the team's help

**two kinds of blank?**
- not on the label = fail (a required field is missing). can't read it = review (might be there, just glare/crop). different outcomes, not the same bug
- field-aware: only the govt warning is a hard reject when it's truly absent. every other missing field goes to review (could be on another panel or embossed)

**warning strict, everything else fuzzy?**
- brand/producer/etc get normalized + fuzzy matched b/c real labels vary in case/punct/spacing (STONE'S THROW = Stone's Throw)
- the govt warning is the exception: verbatim text, header must be GOVERNMENT WARNING in caps + bold, title-case header = reject. it's literally the regulation so we don't fuzz it
- free cross-check: proof should = 2x abv, catches a garbled number for free

**image-quality gate?**
- separate deterministic check (blur + contrast via sharp), not the model, b/c a VLM reads straight through glare/blur and reports legible=true
- a degraded image -> human review no matter how confident the model is
- tradeoff: global pixel stats only reliably catch blur/wash. glare/crop/skew need local detection we didn't build, so it's a coarse net not full image-quality analysis

**Stack: Typescript, Next.js + Vercel serverless**
- a serverless route keeps the api key off the client and deploys in one step
- Typescript strict typing system preferred, and makes deployment easy so obvious choice. Python considered but not needed, easier to keep it one language.
- tradeoff: image-gen takes 30-45s so maxDuration has to be bumped (and it would blow a default hobby timeout), cold starts add latency, and the whole design assumes outbound network that the target prod env blocks

**When does it go to human review?**
- only when the model can't read a value, or the deterministic gate trips. a confident read off an imperfect photo gets compared
- upside: directly attacks the "drowning in routine" problem, far fewer needless escalations
- tradeoff: we're trusting the model's read on a degraded image, so a confident-but-wrong read could auto-clear or auto-reject. mitigated by the blur gate, the proof=2x-abv cross-check, and logprob confidence, but it's a real risk we chose to take

**confidence + the operating point?**
- planned multi-sample agreement and skipping logprobs; flipped it. logprobs give a per-read confidence from the one call we already make, no N-times cost or latency. sampling N times for agreement would blow the 5s budget
- still skip the multi-model council (correlated errors, not worth the cost)
- today the verdict is rules + the quality gate, not a confidence threshold. confidence is computed + shown but doesn't route yet
- the scary error is a false clear (we ship a noncompliant label), much worse than a false flag (a human glances at a fine one). the cutoff should bound false-clears, not chase accuracy
- that's the risk-coverage curve: "to hold false-clears under 1% we auto-clear X%", data sets the cutoff instead of a vibes 90%. next to build

**how do we know it works? (test set)**
- generated our own ~35 labels and wrote the expected values, so we own both sides and know the ground truth
- on-purpose edge cases: clean, abv off, title-case warning, missing warning, glare, proof != 2x abv
- doubles as the risk-coverage set. "how accurate is it" gets answered on data, not vibes

**If we were to really deploy:**
- auth: replace the mock role switcher with real SSO + per-user/role scoping, and an audit log of who cleared/rejected what
- data: images stay out of storage by default; if audit needs them, encrypt at rest + a retention policy + a privacy review first
- secrets: key is already server-only; prod uses the platform secret store, a scoped key, and rotation
- network: the target env blocks outbound, so prod runs a self-hosted VLM. that's also a security win: no submission data leaves the boundary, nothing shared with a third party
- abuse/rate limits: verify + image-gen call paid APIs and are currently unauthenticated; put them behind auth + rate limits (cost and DoS)
- input: cap image size/dimensions before sharp decodes them (decompression bombs); field validation is already there
  - Could let humans crop images before sending them in but might be overkill. would need at least a few hundred real datapoints to decide.