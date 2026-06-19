// the engine. application + evidence record + beverage rules -> per-field checks -> one decision.
// the model only perceives (the evidence record); this code makes every call, deterministically.

import type {
  ApplicationFields,
  BeverageType,
  Decision,
  EvidenceRecord,
  FieldCheck,
  FieldEvidence,
  ImageQuality,
  VerificationResult,
} from './types';
import { normalizeText, normalizeProducer, similarity } from './normalize';
import { checkWarning } from './warning';

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

// abv is mandatory for spirits; for wine/malt it can be optional depending on type/context.
const abvRequired = (bt: BeverageType) => bt === 'distilled_spirits';

function parsePct(s: string): number | null {
  const m = (s ?? '').match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}
function parseProof(s: string): number | null {
  const m = (s ?? '').match(/(\d+(?:\.\d+)?)\s*proof/i);
  return m ? parseFloat(m[1]) : null;
}

// legibility + absence handling shared by every data field. returns a check to short-circuit,
// or null when there is a value and the caller should compare it.
// review is only for what the model genuinely could not read: a confident value (even off a
// glared or imperfect photo) means it could still make the distinction, so we compare it rather
// than punting to a human. only a missing value routes a required field to review. absence is
// field-aware: the warning is a hard reject when truly absent (warning.ts); every other field
// "not visible in this photo" -> review (may be on another panel / embossed). the deterministic
// blur/contrast gate (lib/quality) is the separate safety net for genuinely unreadable images.
function gate(field: string, ev: FieldEvidence, required: boolean): FieldCheck | null {
  if (ev.value && ev.value.trim()) return null; // got a value -> compare it, glare or not
  if (!required) return ok(field);
  if (ev.visible) return warn(field, 'present but not legible in this image; needs a human look');
  return warn(field, 'not visible in this image (may be on another panel or embossed)');
}

export function checkBrand(app: string, ev: FieldEvidence): FieldCheck {
  const g = gate('brand_name', ev, true);
  if (g) return g;
  const o = ev.value!;
  if (app === o) return ok('brand_name');
  if (normalizeText(app) === normalizeText(o)) return note('brand_name', 'differs by capitalization or punctuation only');
  if (similarity(app, o) >= BRAND_REVIEW_THRESHOLD) return warn('brand_name', 'differs by spelling, not just case or punctuation');
  return err('brand_name', `brand does not match: application "${app}", label "${o}"`);
}

export function checkClassType(app: string, ev: FieldEvidence): FieldCheck {
  const g = gate('class_type', ev, true);
  if (g) return g;
  const o = ev.value!;
  return normalizeText(app) === normalizeText(o) ? ok('class_type') : err('class_type', `application class/type is "${app}" but label says "${o}"`);
}

export function checkAlcohol(app: string, ev: FieldEvidence, required: boolean): FieldCheck {
  const g = gate('alcohol_content', ev, required);
  if (g) return g;
  const o = ev.value!.trim();
  if (!o.includes('%')) return err('alcohol_content', 'label omits the percent symbol on the alcohol content');
  const a = parsePct(app);
  const b = parsePct(o);
  if (a == null || b == null) {
    return normalizeText(app) === normalizeText(o) ? ok('alcohol_content') : err('alcohol_content', 'alcohol content does not match the application');
  }
  if (a !== b) return err('alcohol_content', `application says ${a}% but label says ${b}%`);
  const op = parseProof(o);
  if (op != null && Math.abs(op - 2 * b) > 0.1) return err('alcohol_content', `stated proof (${op}) is not twice the ABV (${b}%)`);
  return ok('alcohol_content');
}

export function checkNetContents(app: string, ev: FieldEvidence): FieldCheck {
  const g = gate('net_contents', ev, true);
  if (g) return g;
  const o = ev.value!;
  const na = normalizeText(app).replace(/\s+/g, '');
  const nb = normalizeText(o).replace(/\s+/g, '');
  return na === nb ? ok('net_contents') : err('net_contents', `application says "${app}" but label says "${o}"`);
}

// soft fields (producer name/address). a mismatch is a judgment call -> review, not reject.
function checkSoft(field: string, app: string, ev: FieldEvidence, normFn: (s: string) => string): FieldCheck {
  const g = gate(field, ev, true);
  if (g) return g;
  const o = ev.value!;
  if (app === o) return ok(field);
  if (normFn(app) === normFn(o)) return note(field, 'matches after normalizing formatting');
  return warn(field, 'value differs between application and label');
}

export function checkCountry(app: string, ev: FieldEvidence, isImport: boolean): FieldCheck {
  const g = gate('country_of_origin', ev, isImport);
  if (g) return g;
  if (!isImport) return ok('country_of_origin'); // domestic: optional on the label
  const o = ev.value!;
  return normalizeText(app) === normalizeText(o) ? ok('country_of_origin') : err('country_of_origin', `country of origin mismatch: application "${app}", label "${o}"`);
}

function imageQualityCheck(iq?: ImageQuality): FieldCheck {
  if (iq && !iq.ok) return warn('image_quality', iq.reasons.join('; ') || 'image quality may impair reliable reading');
  return ok('image_quality');
}

function rollup(checks: FieldCheck[], gateFailed: boolean): Decision {
  // an untrustworthy image -> never auto-reject/clear on its reads. send to a human.
  if (gateFailed) return 'needs_review';
  if (checks.some((c) => c.severity === 'error')) return 'reject';
  if (checks.some((c) => c.severity === 'warning')) return 'needs_review';
  return 'approve';
}

export function verify(app: ApplicationFields, ev: EvidenceRecord, imageQuality?: ImageQuality): VerificationResult {
  const isImport = !DOMESTIC.has(normalizeText(app.country_of_origin));
  const [warnContent, warnFormat] = checkWarning(ev.government_warning, ev.extra_statement);
  const checks: FieldCheck[] = [
    checkBrand(app.brand_name, ev.brand_name),
    checkClassType(app.class_type, ev.class_type),
    checkAlcohol(app.alcohol_content, ev.alcohol_content, abvRequired(app.beverage_type)),
    checkNetContents(app.net_contents, ev.net_contents),
    checkSoft('producer_name', app.producer_name, ev.producer_name, normalizeProducer),
    checkSoft('producer_address', app.producer_address, ev.producer_address, normalizeText),
    checkCountry(app.country_of_origin, ev.country_of_origin, isImport),
    warnContent,
    warnFormat,
    imageQualityCheck(imageQuality),
  ];
  return { decision: rollup(checks, imageQuality ? !imageQuality.ok : false), checks };
}
