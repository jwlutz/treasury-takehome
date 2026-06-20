import { describe, it, expect } from 'vitest';
import { verify, CANONICAL_WARNING } from './index';
import type { ApplicationFields, EvidenceRecord, FieldEvidence, VerificationResult, WarningEvidence } from './types';

// clean baseline = ALBV-001 (the OLD TOM bourbon from the brief)
const APP: ApplicationFields = {
  beverage_type: 'distilled_spirits',
  brand_name: 'OLD TOM DISTILLERY',
  class_type: 'Kentucky Straight Bourbon Whiskey',
  alcohol_content: '45% Alc./Vol. (90 Proof)',
  net_contents: '750 mL',
  producer_name: 'Old Tom Distillery LLC',
  producer_address: 'Frankfort, KY',
  country_of_origin: 'United States',
};

// field evidence helper: present + legible by default, value drives visible
const fe = (value: string | null, over: Partial<FieldEvidence> = {}): FieldEvidence => ({
  value,
  visible: value != null,
  legible: true,
  evidence_text: value,
  location_note: 'front label',
  ...over,
});

const warningEv = (over: Partial<WarningEvidence> = {}): WarningEvidence => ({
  text: CANONICAL_WARNING,
  visible: true,
  legible: true,
  header_text: 'GOVERNMENT WARNING',
  header_all_caps: true,
  header_bold: true,
  separate_from_other_text: true,
  contrast_issue: false,
  ...over,
});

const ev = (over: Partial<EvidenceRecord> = {}): EvidenceRecord => ({
  brand_name: fe(APP.brand_name),
  class_type: fe(APP.class_type),
  alcohol_content: fe(APP.alcohol_content),
  net_contents: fe(APP.net_contents),
  producer_name: fe(APP.producer_name),
  producer_address: fe(APP.producer_address),
  country_of_origin: fe(APP.country_of_origin),
  government_warning: warningEv(),
  extra_statement: fe(null),
  ...over,
});

const appWith = (o: Partial<ApplicationFields> = {}): ApplicationFields => ({ ...APP, ...o });
const statusOf = (r: VerificationResult, field: string) => r.checks.find((c) => c.field === field)?.status;

describe('decision engine rules', () => {
  it('clean label approves (ALBV-001)', () => {
    expect(verify(APP, ev()).decision).toBe('approve');
  });

  it('brand case/punct-only difference -> approve with note (ALBV-002)', () => {
    const r = verify(appWith({ brand_name: "Stone's Throw" }), ev({ brand_name: fe("STONE'S THROW") }));
    expect(r.decision).toBe('approve');
    expect(statusOf(r, 'brand_name')).toBe('pass_with_note');
  });

  it('brand spelling variant -> needs review (ALBV-021)', () => {
    const r = verify(appWith({ brand_name: 'HARBOR LIGHT' }), ev({ brand_name: fe('HARBOUR LIGHT') }));
    expect(r.decision).toBe('needs_review');
    expect(statusOf(r, 'brand_name')).toBe('fail');
  });

  it('abv value mismatch -> reject (ALBV-003)', () => {
    expect(verify(APP, ev({ alcohol_content: fe('47% Alc./Vol. (94 Proof)') })).decision).toBe('reject');
  });

  it('abv missing percent symbol -> reject (ALBV-014)', () => {
    const r = verify(appWith({ alcohol_content: '5.1% Alc./Vol.' }), ev({ alcohol_content: fe('5.1 Alcohol by Volume') }));
    expect(r.decision).toBe('reject');
  });

  it('abv optional for wine: absent -> approve', () => {
    const r = verify(appWith({ beverage_type: 'wine' }), ev({ alcohol_content: fe(null) }));
    expect(r.decision).toBe('approve');
  });

  it('net contents mismatch -> reject (ALBV-008)', () => {
    expect(verify(APP, ev({ net_contents: fe('700 mL') })).decision).toBe('reject');
  });

  it('net contents truly absent -> reject (required element missing, ALBV-023)', () => {
    const r = verify(APP, ev({ net_contents: fe(null) }));
    expect(r.decision).toBe('reject');
    expect(statusOf(r, 'net_contents')).toBe('fail');
  });

  it('class/type mismatch -> reject (ALBV-020)', () => {
    expect(verify(appWith({ class_type: 'Gin' }), ev({ class_type: fe('Vodka') })).decision).toBe('reject');
  });

  it('imported product, country absent -> reject (required for imports, ALBV-009)', () => {
    const r = verify(appWith({ country_of_origin: 'Mexico' }), ev({ country_of_origin: fe(null) }));
    expect(r.decision).toBe('reject');
  });

  it('missing government warning -> reject (must be on the label, ALBV-004)', () => {
    const r = verify(APP, ev({ government_warning: warningEv({ text: null, visible: false }) }));
    expect(r.decision).toBe('reject');
    expect(statusOf(r, 'government_warning')).toBe('fail');
  });

  it('warning header not uppercase -> reject (ALBV-005)', () => {
    const r = verify(APP, ev({ government_warning: warningEv({ header_text: 'Government Warning', header_all_caps: false }) }));
    expect(r.decision).toBe('reject');
  });

  it('warning punctuation changed -> reject (ALBV-006)', () => {
    const bad = CANONICAL_WARNING.replace('machinery, and', 'machinery and');
    expect(verify(APP, ev({ government_warning: warningEv({ text: bad }) })).decision).toBe('reject');
  });

  it('warning paraphrased -> reject (ALBV-019)', () => {
    const bad =
      'GOVERNMENT WARNING: (1) Pregnant people should avoid alcoholic beverages because of birth defect risk. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.';
    expect(verify(APP, ev({ government_warning: warningEv({ text: bad }) })).decision).toBe('reject');
  });

  it('warning header not bold -> reject (ALBV-007)', () => {
    const r = verify(APP, ev({ government_warning: warningEv({ header_bold: false }) }));
    expect(r.decision).toBe('reject');
    expect(statusOf(r, 'government_warning_format')).toBe('fail');
  });

  it('warning remainder in uppercase is fine -> approve (ALBV-018)', () => {
    const r = verify(APP, ev({ government_warning: warningEv({ text: CANONICAL_WARNING.toUpperCase() }) }));
    expect(r.decision).toBe('approve');
  });

  it('additional foreign health warning -> reject (ALBV-017)', () => {
    expect(verify(APP, ev({ extra_statement: fe('EXCESSIVE CONSUMPTION OF ALCOHOL IS HARMFUL TO YOUR HEALTH') })).decision).toBe('reject');
  });

  it('benign allergen statement is fine -> approve (ALBV-016)', () => {
    expect(verify(APP, ev({ extra_statement: fe('CONTAINS SULFITES') })).decision).toBe('approve');
  });

  it('producer address mismatch -> needs review (ALBV-012)', () => {
    const r = verify(appWith({ producer_address: 'Cleveland, OH' }), ev({ producer_address: fe('Columbus, OH') }));
    expect(r.decision).toBe('needs_review');
    expect(statusOf(r, 'producer_address')).toBe('fail');
  });

  it('field present but unreadable (no value) -> needs review', () => {
    const r = verify(APP, ev({ alcohol_content: fe(null, { visible: true, legible: false }) }));
    expect(r.decision).toBe('needs_review');
    expect(statusOf(r, 'alcohol_content')).toBe('fail');
  });

  it('field read off an imperfect photo (value present, legible=false) -> compared, not reviewed', () => {
    // if the model could still make out the value, glare/softness alone must not pull it to a human
    const r = verify(APP, ev({ alcohol_content: fe(APP.alcohol_content, { legible: false }) }));
    expect(r.decision).toBe('approve');
    expect(statusOf(r, 'alcohol_content')).toBe('pass');
  });

  it('warning contrast flag alone -> approve, not pointed out (readable warning)', () => {
    // image quality (incl. low warning contrast) never routes when the text was read fine
    const r = verify(APP, ev({ government_warning: warningEv({ contrast_issue: true }) }));
    expect(r.decision).toBe('approve');
    expect(statusOf(r, 'government_warning_format')).toBe('pass');
  });
});
