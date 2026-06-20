// govt warning checks. 27 CFR 16.21 / 16.22. driven by the warning evidence object.
// content + format are separate checks (matches the dataset).

import type { FieldCheck, FieldEvidence, WarningEvidence } from './types';
import { foldCase } from './normalize';

export const CANONICAL_WARNING =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.';

// the statement minus the header, so the body compare works whether or not the model
// repeated "GOVERNMENT WARNING:" inside `text` (it often splits it into header_text).
const CANONICAL_BODY = CANONICAL_WARNING.replace(/^GOVERNMENT WARNING:\s*/, '');

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
  // two kinds of blank: truly absent -> reject; present but unreadable -> human review (not a reject).
  // if the text was read at all (even off a glared photo), we judge it; legibility alone no longer
  // pulls a readable, verbatim warning into the review queue.
  if (!w.visible) return err(field, 'required health warning is not on the label');
  if (!t) return warn(field, 'warning is present but could not be read; needs a human look');

  // header casing (the body fold-compare can't catch it, since it lowercases everything)
  const caps = w.header_all_caps ?? (w.header_text ? w.header_text === w.header_text.toUpperCase() && /[A-Z]/.test(w.header_text) : null);
  if (caps === false) return err(field, `header "${w.header_text ?? ''}" is not in all caps`);

  // verbatim body (case-insensitive, punctuation/word exact); strip a leading header first
  const body = t.replace(/^\s*government\s+warning\s*:?\s*/i, '');
  if (foldCase(body) !== foldCase(CANONICAL_BODY)) {
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
  // contrast is an image-quality observation, not a compliance defect. if the warning was readable
  // (we have its text), low contrast isn't pointed out; an unreadable warning is handled in content().
  return ok(field);
}

export function isForeignHealthWarning(extra: string): boolean {
  const s = (extra ?? '').toLowerCase().trim();
  if (!s) return false;
  const keywords = ['harmful', 'health', 'consumption', 'excessive', 'pregnan', 'intoxicat', 'drink responsibly', 'alcohol is'];
  return keywords.some((k) => s.includes(k));
}
