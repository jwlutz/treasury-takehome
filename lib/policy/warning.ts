// govt warning checks. 27 CFR 16.21 / 16.22. driven by the warning evidence object.
// content + format are separate checks (matches the dataset).

import type { FieldCheck, FieldEvidence, WarningEvidence } from './types';
import { foldCase } from './normalize';

export const CANONICAL_WARNING =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.';

const ok = (field: string): FieldCheck => ({ field, status: 'pass', severity: 'ok', message: '' });
const warn = (field: string, message: string): FieldCheck => ({ field, status: 'fail', severity: 'warning', message });
const err = (field: string, message: string): FieldCheck => ({ field, status: 'fail', severity: 'error', message });

export function checkWarning(w: WarningEvidence, extra: FieldEvidence): [FieldCheck, FieldCheck] {
  return [content(w, extra), format(w)];
}

/**
 * content: the warning is the one item that must be visible ON the label, so its absence is a
 * hard reject. otherwise: header must be caps, body verbatim, no extra foreign health warning.
 */
function content(w: WarningEvidence, extra: FieldEvidence): FieldCheck {
  const field = 'government_warning';
  const t = (w.text ?? '').trim();
  if (!w.visible || !t) return err(field, 'required health warning is not visible on the label');
  if (!w.legible) return warn(field, 'warning is visible but not clearly legible');

  // header casing (the body fold-compare can't catch it, since it lowercases everything)
  const caps = w.header_all_caps ?? (w.header_text ? w.header_text === w.header_text.toUpperCase() && /[A-Z]/.test(w.header_text) : null);
  if (caps === false) return err(field, `header "${w.header_text ?? ''}" is not in all caps`);

  // verbatim text (case-insensitive but punctuation/word exact)
  if (foldCase(t) !== foldCase(CANONICAL_WARNING)) {
    return err(field, 'warning text does not match the required statement verbatim');
  }

  if (isForeignHealthWarning(extra.value ?? '')) {
    return err(field, 'an additional alcohol health warning beyond the required U.S. statement is present');
  }
  return ok(field);
}

/** format: header bold, separate/apart from other text, adequate contrast. */
function format(w: WarningEvidence): FieldCheck {
  const field = 'government_warning_format';
  if (!w.visible || !(w.text ?? '').trim()) return ok(field); // absence handled by content
  if (w.header_bold === false) return err(field, 'the GOVERNMENT WARNING header is not bold');
  if (w.separate_from_other_text === false) return err(field, 'the warning is not separate/apart from other text');
  if (w.contrast_issue === true) return warn(field, 'warning contrast may be too low; needs a human look');
  return ok(field);
}

export function isForeignHealthWarning(extra: string): boolean {
  const s = (extra ?? '').toLowerCase().trim();
  if (!s) return false;
  const keywords = ['harmful', 'health', 'consumption', 'excessive', 'pregnan', 'intoxicat', 'drink responsibly', 'alcohol is'];
  return keywords.some((k) => s.includes(k));
}
