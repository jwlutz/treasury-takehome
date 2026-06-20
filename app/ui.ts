// shared presentation bits for the single-label page and the batch dashboard.
// pure data + helpers, safe to import into client components.
import type { Decision, FieldCheck } from '../lib/policy/types';

export const DECISION: Record<Decision, { label: string; tone: string; mark: string; blurb: string }> = {
  approve: { label: 'Approve', tone: 'tone-approve', mark: '✓', blurb: 'the label matches the application.' },
  needs_review: { label: 'Needs review', tone: 'tone-review', mark: '⚠', blurb: 'something needs a human look before a call.' },
  reject: { label: 'Reject', tone: 'tone-reject', mark: '✕', blurb: 'a compliance problem was found on the label.' },
};

// plain-words name for each check key
export const CHECK_LABELS: Record<string, string> = {
  brand_name: 'Brand name',
  class_type: 'Class / type',
  alcohol_content: 'Alcohol content',
  net_contents: 'Net contents',
  producer_name: 'Producer / bottler name',
  producer_address: 'Producer / bottler address',
  country_of_origin: 'Country of origin',
  government_warning: 'Government warning',
  government_warning_format: 'Warning format',
};

export const SEV_MARK: Record<string, string> = { error: '✕', warning: '⚠', note: '✓', ok: '✓' };

export const checkLabel = (field: string) => CHECK_LABELS[field] ?? field;

// the headline reason for a row: the most severe failing check, if any
export const topReason = (checks: FieldCheck[]): FieldCheck | null =>
  checks.find((c) => c.severity === 'error') ?? checks.find((c) => c.severity === 'warning') ?? null;
