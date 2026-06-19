// the engine. compare application vs extracted fields -> per-field checks -> one decision.

import type { ApplicationFields, Decision, Extraction, FieldCheck, VerificationResult } from './types';
import { normalizeText, normalizeProducer, similarity } from './normalize';
import { checkWarningContent, checkWarningFormat } from './warning';

const ok = (field: string): FieldCheck => ({ field, status: 'pass', severity: 'ok', message: '' });
const note = (field: string, message: string): FieldCheck => ({ field, status: 'pass_with_note', severity: 'note', message });
const warn = (field: string, message: string): FieldCheck => ({ field, status: 'fail', severity: 'warning', message });
const err = (field: string, message: string): FieldCheck => ({ field, status: 'fail', severity: 'error', message });

const DOMESTIC = new Set([
  'united states',
  'united states of america',
  'usa',
  'us',
  'u.s.',
  'u.s.a.',
  'america',
]);

// brand above this similarity = "probably the same, let a human glance" instead of hard reject. tune on the set.
const BRAND_REVIEW_THRESHOLD = 0.7;

function parsePct(s: string): number | null {
  const m = (s ?? '').match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

function parseProof(s: string): number | null {
  const m = (s ?? '').match(/(\d+(?:\.\d+)?)\s*proof/i);
  return m ? parseFloat(m[1]) : null;
}

export function checkBrand(app: string, obs: string): FieldCheck {
  const field = 'brand_name';
  if (!(obs ?? '').trim()) return err(field, 'Brand name is missing from the label.');
  if (app === obs) return ok(field);
  if (normalizeText(app) === normalizeText(obs)) return note(field, 'Brand differs by capitalization or punctuation only.');
  if (similarity(app, obs) >= BRAND_REVIEW_THRESHOLD) {
    return warn(field, 'Brand differs by spelling, not just case or punctuation.');
  }
  return err(field, `Brand name does not match: application "${app}", label "${obs}".`);
}

export function checkClassType(app: string, obs: string): FieldCheck {
  const field = 'class_type';
  if (!(obs ?? '').trim()) return err(field, 'Class/type designation is missing from the label.');
  if (normalizeText(app) === normalizeText(obs)) return ok(field);
  return err(field, `Application class/type is "${app}" but label says "${obs}".`);
}

export function checkAlcohol(app: string, obs: string): FieldCheck {
  const field = 'alcohol_content';
  const o = (obs ?? '').trim();
  if (!o) return err(field, 'Alcohol content is missing from the label.');
  if (!o.includes('%')) return err(field, 'Label omits the percent symbol on the alcohol content.');

  const a = parsePct(app);
  const b = parsePct(obs);
  if (a == null || b == null) {
    return normalizeText(app) === normalizeText(obs) ? ok(field) : err(field, 'Alcohol content does not match the application.');
  }
  if (a !== b) return err(field, `Application says ${a}% but label says ${b}%.`);

  // cross-check: proof should = 2x abv
  const op = parseProof(obs);
  if (op != null && Math.abs(op - 2 * b) > 0.1) {
    return err(field, `Stated proof (${op}) is not twice the ABV (${b}%).`);
  }
  return ok(field);
}

export function checkNetContents(app: string, obs: string): FieldCheck {
  const field = 'net_contents';
  if (!(obs ?? '').trim()) return err(field, 'Net contents are omitted from the label.');
  const na = normalizeText(app).replace(/\s+/g, '');
  const nb = normalizeText(obs).replace(/\s+/g, '');
  if (na === nb) return ok(field);
  return err(field, `Application says "${app}" but label says "${obs}".`);
}

// soft fields (producer name/address). a mismatch is a judgment call -> review, not reject.
function checkSoft(field: string, app: string, obs: string, normFn: (s: string) => string = normalizeText): FieldCheck {
  if (!(obs ?? '').trim()) return warn(field, `${field.replace(/_/g, ' ')} is missing from the label.`);
  if (app === obs) return ok(field);
  if (normFn(app) === normFn(obs)) return note(field, 'Matches after normalizing formatting.');
  return warn(field, 'Value differs between application and label.');
}

export function checkCountry(app: string, obs: string): FieldCheck {
  const field = 'country_of_origin';
  // country of origin only required for imports
  if (DOMESTIC.has(normalizeText(app))) return ok(field);
  if (!(obs ?? '').trim()) return err(field, `Imported product, but the label omits the country of origin (${app}).`);
  if (normalizeText(app) === normalizeText(obs)) return ok(field);
  return err(field, `Country of origin mismatch: application "${app}", label "${obs}".`);
}

export function checkImageQuality(legible: boolean, qualityNote?: string): FieldCheck {
  const field = 'image_quality';
  if (!legible) return warn(field, qualityNote || 'Image quality may impair reliable reading; route to human review.');
  return ok(field);
}

function rollup(checks: FieldCheck[]): Decision {
  // illegible image -> the reads are unreliable, so never auto-reject/clear on them. send to a human.
  if (checks.some((c) => c.field === 'image_quality' && c.severity === 'warning')) return 'needs_review';
  if (checks.some((c) => c.severity === 'error')) return 'reject';
  if (checks.some((c) => c.severity === 'warning')) return 'needs_review';
  return 'approve';
}

export function verify(app: ApplicationFields, extraction: Extraction): VerificationResult {
  const f = extraction.fields;
  const checks: FieldCheck[] = [
    checkBrand(app.brand_name, f.brand_name),
    checkClassType(app.class_type, f.class_type),
    checkAlcohol(app.alcohol_content, f.alcohol_content),
    checkNetContents(app.net_contents, f.net_contents),
    checkSoft('producer_name', app.producer_name, f.producer_name, normalizeProducer),
    checkSoft('producer_address', app.producer_address, f.producer_address),
    checkCountry(app.country_of_origin, f.country_of_origin),
    checkWarningContent(f.government_warning_text, f.extra_statement),
    checkWarningFormat(f.government_warning_text, f.government_warning_header_bold),
    checkImageQuality(extraction.legible, extraction.qualityNote),
  ];
  return { decision: rollup(checks), checks };
}
