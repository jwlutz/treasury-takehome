// the verification pipeline the api route calls: one image + the application -> a decision.
// the model extracts; verify() decides on the reads. image quality is intentionally NOT part of the
// path: a usable photo isn't a problem unless it costs a read, which already shows up as an empty
// field that routes to review. (the deterministic blur/contrast helper in lib/quality is kept as a
// dev/calibration utility only; it's deliberately not imported here so the serverless function stays
// lean and free of the native sharp binary.)
import { verify, inferBeverage } from './policy';
import type { ApplicationFields, EvidenceRecord, FieldEvidence, VerificationResult } from './policy/types';
import { extractLabelEvidence } from './extract/extract';

export interface VerifyImageResult {
  decision: VerificationResult['decision'];
  checks: VerificationResult['checks'];
  evidence: EvidenceRecord;
  application: ApplicationFields; // the values compared against: the form's in "given" mode, the model's read in "lookup" mode
  latencyMs: number;
  confidence: number | null; // mean token probability from logprobs, for the operating-point work later
  tokens: number; // total tokens for this verification (usage meter)
}

export interface VerifyImageOptions {
  // lookup mode simulates the COLA/registry lookup: rather than a supplied application, the model reads the
  // label and those values become what we check against. field reads then self-match, so the signal comes
  // from the warning/format/mandatory-presence checks. beverage_type is inferred from the class/type read.
  lookup?: boolean;
}

function applicationFromEvidence(ev: EvidenceRecord): ApplicationFields {
  const v = (f: FieldEvidence) => (f.value ?? '').trim();
  const classType = v(ev.class_type);
  return {
    beverage_type: classType ? inferBeverage(classType) : 'other',
    brand_name: v(ev.brand_name),
    class_type: classType,
    alcohol_content: v(ev.alcohol_content),
    net_contents: v(ev.net_contents),
    producer_name: v(ev.producer_name),
    producer_address: v(ev.producer_address),
    country_of_origin: v(ev.country_of_origin),
  };
}

export async function verifyImage(
  image: Buffer,
  app: ApplicationFields,
  mime = 'image/jpeg',
  opts: VerifyImageOptions = {},
): Promise<VerifyImageResult> {
  const extracted = await extractLabelEvidence(image, mime);
  const application = opts.lookup ? applicationFromEvidence(extracted.evidence) : app;
  const result = verify(application, extracted.evidence);
  return {
    decision: result.decision,
    checks: result.checks,
    evidence: extracted.evidence,
    application,
    latencyMs: extracted.latencyMs,
    confidence: extracted.confidence,
    tokens: extracted.tokens,
  };
}
