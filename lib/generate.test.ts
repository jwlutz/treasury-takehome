import { describe, it, expect } from 'vitest';
import { generate, renderLabelSvg } from './generate';
import { CANONICAL_WARNING } from './policy/warning';

const abvOf = (s: string) => parseInt((s.match(/(\d+)\s*%?/) ?? [])[1] ?? '0', 10);

describe('label generation', () => {
  it('compliant: application matches the art, warning intact', () => {
    const g = generate('compliant');
    expect(g.expected).toBe('approve');
    expect(g.application.brand_name).toBe(g.art.brand);
    expect(abvOf(g.application.alcohol_content)).toBe(parseInt(g.art.alcohol, 10));
    expect(g.art.warning).toBe(CANONICAL_WARNING);
    expect(g.art.warningHeaderCaps).toBe(true);
  });

  it('abv break: application abv differs from the label', () => {
    const g = generate('noncompliant', 'abv');
    expect(g.expected).toBe('reject');
    expect(abvOf(g.application.alcohol_content)).not.toBe(parseInt(g.art.alcohol, 10));
  });

  it('brand break: application brand differs from the label', () => {
    const g = generate('noncompliant', 'brand');
    expect(g.application.brand_name).not.toBe(g.art.brand);
  });

  it('net break: application net contents differ from the label', () => {
    const g = generate('noncompliant', 'net');
    expect(g.application.net_contents).not.toBe(g.art.netContents);
  });

  it('warning caps break: header drawn in title case, body intact', () => {
    const g = generate('noncompliant', 'warning_caps');
    expect(g.art.warningHeaderCaps).toBe(false);
    expect(g.art.warning).toBe(CANONICAL_WARNING);
  });

  it('warning missing break: no warning on the label', () => {
    expect(generate('noncompliant', 'warning_missing').art.warning).toBeNull();
  });

  it('warning text break: altered but present', () => {
    const g = generate('noncompliant', 'warning_text');
    expect(g.art.warning).not.toBe(CANONICAL_WARNING);
    expect(g.art.warning).not.toBeNull();
  });

  it('svg shows the brand and the warning header', () => {
    const g = generate('compliant');
    const svg = renderLabelSvg(g.art);
    expect(svg).toContain(g.art.brand);
    expect(svg).toContain('GOVERNMENT WARNING:');
  });

  it('svg omits the warning when it is missing', () => {
    const svg = renderLabelSvg(generate('noncompliant', 'warning_missing').art);
    expect(svg).not.toContain('WARNING');
  });
});
