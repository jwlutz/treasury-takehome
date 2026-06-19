// types. model EXTRACTS (fills these), code DECIDES from them. nothing here trusts the model's judgment.

export type Severity = 'ok' | 'note' | 'warning' | 'error';

// matches the dataset's check status names
export type CheckStatus = 'pass' | 'pass_with_note' | 'fail';

export type Decision = 'approve' | 'needs_review' | 'reject';

/** the submitted application / COLA values. what we check the label against. */
export interface ApplicationFields {
  brand_name: string;
  class_type: string;
  alcohol_content: string;
  net_contents: string;
  producer_name: string;
  producer_address: string;
  country_of_origin: string;
}

/** what the model says it read off the label */
export interface LabelFields {
  brand_name: string;
  class_type: string;
  alcohol_content: string;
  net_contents: string;
  producer_name: string;
  producer_address: string;
  country_of_origin: string;
  government_warning_text: string;
  government_warning_header_bold: boolean;
  extra_statement: string;
}

/** extraction output = the fields + an image-quality signal */
export interface Extraction {
  fields: LabelFields;
  /** false on glare/skew/blur -> route to review */
  legible: boolean;
  qualityNote?: string;
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
