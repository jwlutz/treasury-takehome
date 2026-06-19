// types. the model produces an EvidenceRecord (facts visible in one image, no compliance judgment).
// the code compares that record against the application + beverage rules and decides.

export type Severity = 'ok' | 'note' | 'warning' | 'error';

// matches the dataset's check status names
export type CheckStatus = 'pass' | 'pass_with_note' | 'fail';

export type Decision = 'approve' | 'needs_review' | 'reject';

export type BeverageType = 'distilled_spirits' | 'wine' | 'malt_beverage';

/** the submitted application / COLA values. what we check the label against. */
export interface ApplicationFields {
  beverage_type: BeverageType;
  brand_name: string;
  class_type: string;
  alcohol_content: string;
  net_contents: string;
  producer_name: string;
  producer_address: string;
  country_of_origin: string;
}

/** evidence for one field, from the image only. visible=in this photo, legible=readable. */
export interface FieldEvidence {
  value: string | null; // structurally normalized (caption stripped), null if not confidently readable
  visible: boolean; // present in THIS image
  legible: boolean; // visible AND reliably readable
  evidence_text: string | null; // the exact surrounding printed phrase
  location_note: string; // front label / back / neck / partly cropped / etc.
}

/** the government warning carries extra visual-compliance signals (27 CFR 16). */
export interface WarningEvidence {
  text: string | null;
  visible: boolean;
  legible: boolean;
  header_text: string | null; // the header exactly as printed
  header_all_caps: boolean | null;
  header_bold: boolean | null;
  separate_from_other_text: boolean | null;
  contrast_issue: boolean;
}

/** one model call -> this. evidence only, never a verdict. */
export interface EvidenceRecord {
  brand_name: FieldEvidence;
  class_type: FieldEvidence;
  alcohol_content: FieldEvidence;
  net_contents: FieldEvidence;
  producer_name: FieldEvidence;
  producer_address: FieldEvidence;
  country_of_origin: FieldEvidence;
  government_warning: WarningEvidence;
  extra_statement: FieldEvidence;
}

/** deterministic image-quality gate result (lib/quality). */
export interface ImageQuality {
  ok: boolean;
  reasons: string[];
}

export interface FieldCheck {
  field: string;
  status: CheckStatus;
  severity: Severity;
  message: string;
}

export interface VerificationResult {
  decision: Decision;
  checks: FieldCheck[];
}
