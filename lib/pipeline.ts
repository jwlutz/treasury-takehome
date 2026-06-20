// the verification pipeline the api route calls: one image + the application -> a decision.
// the model extracts; verify() decides on the reads. image quality is intentionally NOT part of the
// path: a usable photo isn't a problem unless it costs a read, which already shows up as an empty
// field that routes to review. (the deterministic blur/contrast helper in lib/quality is kept as a
// dev/calibration utility only; it's deliberately not imported here so the serverless function stays
// lean and free of the native sharp binary.)
import { verify } from './policy';
import type { ApplicationFields, EvidenceRecord, VerificationResult } from './policy/types';
import { extractLabelEvidence } from './extract/extract';

export interface VerifyImageResult {
  decision: VerificationResult['decision'];
  checks: VerificationResult['checks'];
  evidence: EvidenceRecord;
  latencyMs: number;
  confidence: number | null; // mean token probability from logprobs, for the operating-point work later
  tokens: number; // total tokens for this verification (usage meter)
}

export async function verifyImage(image: Buffer, app: ApplicationFields, mime = 'image/jpeg'): Promise<VerifyImageResult> {
  const extracted = await extractLabelEvidence(image, mime);
  const result = verify(app, extracted.evidence);
  return {
    decision: result.decision,
    checks: result.checks,
    evidence: extracted.evidence,
    latencyMs: extracted.latencyMs,
    confidence: extracted.confidence,
    tokens: extracted.tokens,
  };
}
