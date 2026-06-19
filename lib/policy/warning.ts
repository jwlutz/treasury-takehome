// govt warning checks. 27 CFR 16.21 / 16.22.
// content + format are separate checks (matches the dataset).

import type { FieldCheck } from './types';
import { foldCase } from './normalize';

export const CANONICAL_WARNING =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.';

const HEADER = 'GOVERNMENT WARNING';

const ok = (field: string): FieldCheck => ({ field, status: 'pass', severity: 'ok', message: '' });
const err = (field: string, message: string): FieldCheck => ({ field, status: 'fail', severity: 'error', message });

/**
 * content check: present? header in caps? text verbatim? no extra foreign warning?
 * the remainder's case can vary (only the header must be caps), but wording + punctuation must match.
 */
export function checkWarningContent(text: string, extra: string): FieldCheck {
  const field = 'government_warning';
  const t = (text ?? '').trim();
  if (!t) return err(field, 'Required health warning statement is absent.');

  // header has to be exactly "GOVERNMENT WARNING" in caps (ALBV-005)
  const header = (t.split(':')[0] ?? '').trim();
  if (header.toLowerCase() === HEADER.toLowerCase() && header !== HEADER) {
    return err(field, `Header reads "${header}" instead of "${HEADER}".`);
  }

  // verbatim text. case-insensitive but punctuation/words exact (006 punct, 018 all-caps ok, 019 paraphrase)
  if (foldCase(t) !== foldCase(CANONICAL_WARNING)) {
    return err(field, 'Warning text does not match the required statement verbatim.');
  }

  // an extra alcohol health warning = reject. benign stuff like CONTAINS SULFITES is fine (016 vs 017)
  if (isForeignHealthWarning(extra)) {
    return err(field, 'Label includes an additional alcohol health warning beyond the required U.S. statement.');
  }

  return ok(field);
}

/** format check: header has to be bold when the warning's present (ALBV-007) */
export function checkWarningFormat(text: string, headerBold: boolean): FieldCheck {
  const field = 'government_warning_format';
  if (!(text ?? '').trim()) return ok(field); // absence is the content check's job
  if (!headerBold) return err(field, 'The GOVERNMENT WARNING header is not bold.');
  return ok(field);
}

export function isForeignHealthWarning(extra: string): boolean {
  const s = (extra ?? '').toLowerCase().trim();
  if (!s) return false;
  const keywords = [
    'harmful',
    'health',
    'consumption',
    'excessive',
    'pregnan',
    'intoxicat',
    'drink responsibly',
    'alcohol is',
  ];
  return keywords.some((k) => s.includes(k));
}
