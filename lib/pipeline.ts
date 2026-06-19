// the verification pipeline the api route calls: one image + the application -> a decision.
// extraction (the model) and image quality (deterministic, sharp) run in parallel; verify() decides.
// kept separate from the route so batch can reuse it later.
import { verify } from './policy';
import type { ApplicationFields, EvidenceRecord, ImageQuality, VerificationResult } from './policy/types';
import { extractLabelEvidence } from './extract/extract';
import { assessImageQuality } from './quality/imageQuality';

export interface VerifyImageResult {
  decision: VerificationResult['decision'];
  checks: VerificationResult['checks'];
  evidence: EvidenceRecord;
  quality: ImageQuality;
  latencyMs: number;
  confidence: number | null; // mean token probability from logprobs, for the operating-point work later
}

export async function verifyImage(image: Buffer, app: ApplicationFields, mime = 'image/jpeg'): Promise<VerifyImageResult> {
  const [extracted, quality] = await Promise.all([
    extractLabelEvidence(image, mime),
    assessImageQuality(image),
  ]);
  const result = verify(app, extracted.evidence, quality);
  return {
    decision: result.decision,
    checks: result.checks,
    evidence: extracted.evidence,
    quality: { ok: quality.ok, reasons: quality.reasons },
    latencyMs: extracted.latencyMs,
    confidence: extracted.confidence,
  };
}
