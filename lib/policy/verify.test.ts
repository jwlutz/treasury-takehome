import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verify, CANONICAL_WARNING } from './index';
import type { ApplicationFields, Extraction, LabelFields, VerificationResult } from './types';

// clean baseline = ALBV-001 (the OLD TOM bourbon from the brief)
const APP: ApplicationFields = {
  brand_name: 'OLD TOM DISTILLERY',
  class_type: 'Kentucky Straight Bourbon Whiskey',
  alcohol_content: '45% Alc./Vol. (90 Proof)',
  net_contents: '750 mL',
  producer_name: 'Old Tom Distillery LLC',
  producer_address: 'Frankfort, KY',
  country_of_origin: 'United States',
};

const LABEL: LabelFields = {
  ...APP,
  government_warning_text: CANONICAL_WARNING,
  government_warning_header_bold: true,
  extra_statement: '',
};

const ex = (fields: Partial<LabelFields> = {}, legible = true): Extraction => ({
  fields: { ...LABEL, ...fields },
  legible,
});
const appWith = (o: Partial<ApplicationFields> = {}): ApplicationFields => ({ ...APP, ...o });
const statusOf = (r: VerificationResult, field: string) => r.checks.find((c) => c.field === field)?.status;

describe('decision engine rules', () => {
  it('clean label approves (ALBV-001)', () => {
    expect(verify(APP, ex()).decision).toBe('approve');
  });

  it('brand case/punct-only difference -> approve with note (ALBV-002)', () => {
    const r = verify(appWith({ brand_name: "Stone's Throw" }), ex({ brand_name: "STONE'S THROW" }));
    expect(r.decision).toBe('approve');
    expect(statusOf(r, 'brand_name')).toBe('pass_with_note');
  });

  it('brand spelling variant -> needs review (ALBV-021)', () => {
    const r = verify(appWith({ brand_name: 'HARBOR LIGHT' }), ex({ brand_name: 'HARBOUR LIGHT' }));
    expect(r.decision).toBe('needs_review');
    expect(statusOf(r, 'brand_name')).toBe('fail');
  });

  it('abv value mismatch -> reject (ALBV-003)', () => {
    expect(verify(APP, ex({ alcohol_content: '47% Alc./Vol. (94 Proof)' })).decision).toBe('reject');
  });

  it('abv missing percent symbol -> reject (ALBV-014)', () => {
    const r = verify(appWith({ alcohol_content: '5.1% Alc./Vol.' }), ex({ alcohol_content: '5.1 Alcohol by Volume' }));
    expect(r.decision).toBe('reject');
  });

  it('net contents mismatch -> reject (ALBV-008)', () => {
    expect(verify(APP, ex({ net_contents: '700 mL' })).decision).toBe('reject');
  });

  it('net contents missing -> reject (ALBV-023)', () => {
    expect(verify(APP, ex({ net_contents: '' })).decision).toBe('reject');
  });

  it('class/type mismatch -> reject (ALBV-020)', () => {
    expect(verify(appWith({ class_type: 'Gin' }), ex({ class_type: 'Vodka' })).decision).toBe('reject');
  });

  it('imported product missing country -> reject (ALBV-009)', () => {
    expect(verify(appWith({ country_of_origin: 'Mexico' }), ex({ country_of_origin: '' })).decision).toBe('reject');
  });

  it('missing government warning -> reject (ALBV-004)', () => {
    const r = verify(APP, ex({ government_warning_text: '', government_warning_header_bold: false }));
    expect(r.decision).toBe('reject');
    expect(statusOf(r, 'government_warning')).toBe('fail');
  });

  it('warning header not uppercase -> reject (ALBV-005)', () => {
    const bad = CANONICAL_WARNING.replace('GOVERNMENT WARNING', 'Government Warning');
    expect(verify(APP, ex({ government_warning_text: bad })).decision).toBe('reject');
  });

  it('warning punctuation changed -> reject (ALBV-006)', () => {
    const bad = CANONICAL_WARNING.replace('machinery, and', 'machinery and');
    expect(verify(APP, ex({ government_warning_text: bad })).decision).toBe('reject');
  });

  it('warning paraphrased -> reject (ALBV-019)', () => {
    const bad =
      'GOVERNMENT WARNING: (1) Pregnant people should avoid alcoholic beverages because of birth defect risk. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.';
    expect(verify(APP, ex({ government_warning_text: bad })).decision).toBe('reject');
  });

  it('warning header not bold -> reject (ALBV-007)', () => {
    const r = verify(APP, ex({ government_warning_header_bold: false }));
    expect(r.decision).toBe('reject');
    expect(statusOf(r, 'government_warning_format')).toBe('fail');
  });

  it('warning remainder in uppercase is fine -> approve (ALBV-018)', () => {
    expect(verify(APP, ex({ government_warning_text: CANONICAL_WARNING.toUpperCase() })).decision).toBe('approve');
  });

  it('additional foreign health warning -> reject (ALBV-017)', () => {
    expect(
      verify(APP, ex({ extra_statement: 'EXCESSIVE CONSUMPTION OF ALCOHOL IS HARMFUL TO YOUR HEALTH' })).decision,
    ).toBe('reject');
  });

  it('benign allergen statement is fine -> approve (ALBV-016)', () => {
    expect(verify(APP, ex({ extra_statement: 'CONTAINS SULFITES' })).decision).toBe('approve');
  });

  it('producer address mismatch -> needs review (ALBV-012)', () => {
    const r = verify(appWith({ producer_address: 'Cleveland, OH' }), ex({ producer_address: 'Columbus, OH' }));
    expect(r.decision).toBe('needs_review');
    expect(statusOf(r, 'producer_address')).toBe('fail');
  });

  it('glare/skew -> needs review (ALBV-011 / ALBV-024)', () => {
    const r = verify(APP, ex({}, false));
    expect(r.decision).toBe('needs_review');
    expect(statusOf(r, 'image_quality')).toBe('fail');
  });
});

// runs over the labelled dataset when data/ground_truth.jsonl exists. GROUND_TRUTH env var points it elsewhere (e.g. the source set).
const DATA = process.env.GROUND_TRUTH ?? join(process.cwd(), 'data', 'data', 'ground_truth.jsonl');
if (!existsSync(DATA)) {
  describe.skip('regression vs labelled dataset (data/ground_truth.jsonl not present)', () => {
    it('skipped', () => {});
  });
} else {
  describe('regression vs labelled dataset', () => {
    const rows = readFileSync(DATA, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    for (const r of rows) {
      it(`${r.id} -> ${r.expected_decision}`, () => {
        const obs = r.observed_label_fields ?? {};
        const extraction: Extraction = {
          fields: {
            brand_name: obs.brand_name ?? '',
            class_type: obs.class_type ?? '',
            alcohol_content: obs.alcohol_content ?? '',
            net_contents: obs.net_contents ?? '',
            producer_name: obs.producer_name ?? '',
            producer_address: obs.producer_address ?? '',
            country_of_origin: obs.country_of_origin ?? '',
            government_warning_text: obs.government_warning_text ?? '',
            government_warning_header_bold: !!obs.government_warning_header_bold,
            extra_statement: obs.extra_statement ?? '',
          },
          legible: (r.label_artwork?.degradation ?? 'none') === 'none',
        };
        const result = verify(r.application_fields, extraction);
        expect(result.decision).toBe(r.expected_decision);

        const byField = Object.fromEntries(result.checks.map((c) => [c.field, c.status]));
        for (const c of r.checks ?? []) {
          expect(byField[c.field], `${r.id} ${c.field}`).toBe(c.status);
        }
      });
    }
  });
}
