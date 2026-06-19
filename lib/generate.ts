// generate a synthetic label on the fly (an svg template -> png, NOT diffusion: diffusion garbles
// text and needs outbound). we own both the rendered label and the application values, so the
// expected decision is known. noncompliant = perturb exactly one thing.
import type { ApplicationFields } from './policy/types';
import { CANONICAL_WARNING } from './policy/warning';

export type Scenario = 'compliant' | 'noncompliant' | 'random';

// what gets drawn on the image
export interface LabelArt {
  brand: string;
  classType: string;
  alcohol: string; // "45% ALC/VOL (90 PROOF)"
  netContents: string;
  producer: string;
  address: string;
  country: string;
  warning: string | null; // null = warning omitted from the label
  warningHeaderCaps: boolean; // false = header drawn in title case (a violation)
}

export interface Generated {
  application: ApplicationFields;
  art: LabelArt;
  expected: 'approve' | 'reject';
  note: string;
}

const BRANDS = ['RIVER STONE', 'OLD TOM', 'IRON GATE', 'BLUE HERON', 'CEDAR FALLS', 'SILVER BIRCH'];
const CITIES = ['Louisville, KY', 'Frankfort, KY', 'Bardstown, KY', 'Lynchburg, TN'];

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

function base(): { art: LabelArt; application: ApplicationFields } {
  const brand = pick(BRANDS);
  const abv = 40 + Math.floor(Math.random() * 11); // 40-50
  const proof = abv * 2;
  const city = pick(CITIES);
  const producer = `${brand} DISTILLING CO.`;
  const art: LabelArt = {
    brand,
    classType: 'Kentucky Straight Bourbon Whiskey',
    alcohol: `${abv}% ALC/VOL (${proof} PROOF)`,
    netContents: '750 mL',
    producer,
    address: city,
    country: 'United States',
    warning: CANONICAL_WARNING,
    warningHeaderCaps: true,
  };
  const application: ApplicationFields = {
    beverage_type: 'distilled_spirits',
    brand_name: brand,
    class_type: art.classType,
    alcohol_content: `${abv}% Alc./Vol. (${proof} Proof)`,
    net_contents: '750 mL',
    producer_name: producer,
    producer_address: city,
    country_of_origin: 'United States',
  };
  return { art, application };
}

export type Break = 'abv' | 'brand' | 'net' | 'warning_caps' | 'warning_missing' | 'warning_text';
export const BREAKS: Break[] = ['abv', 'brand', 'net', 'warning_caps', 'warning_missing', 'warning_text'];

// apply one deliberate violation. the label art shows the truth; the application may claim otherwise.
function applyBreak(br: Break, art: LabelArt, application: ApplicationFields): string {
  switch (br) {
    case 'abv': {
      const labelAbv = parseInt(art.alcohol, 10);
      const appAbv = labelAbv >= 48 ? labelAbv - 3 : labelAbv + 3;
      application.alcohol_content = `${appAbv}% Alc./Vol. (${appAbv * 2} Proof)`;
      return `alcohol content: the application says ${appAbv}% but the label shows ${labelAbv}%`;
    }
    case 'brand':
      application.brand_name = `${art.brand.split(' ')[0]} BAY`;
      return `brand: the application says "${application.brand_name}" but the label shows "${art.brand}"`;
    case 'net':
      application.net_contents = '700 mL';
      return 'net contents: the application says 700 mL but the label shows 750 mL';
    case 'warning_caps':
      art.warningHeaderCaps = false;
      return 'the GOVERNMENT WARNING header is not in all capitals';
    case 'warning_missing':
      art.warning = null;
      return 'the required government warning is missing from the label';
    case 'warning_text':
      art.warning = CANONICAL_WARNING.replace('birth defects', 'birth problems');
      return 'the government warning text does not match the required statement';
  }
}

export function generate(scenario: Scenario, forceBreak?: Break): Generated {
  const compliant = scenario === 'compliant' || (scenario === 'random' && Math.random() < 0.5);
  const { art, application } = base();
  if (compliant) {
    return { application, art, expected: 'approve', note: 'compliant label: everything matches the application' };
  }
  const note = applyBreak(forceBreak ?? pick(BREAKS), art, application);
  return { application, art, expected: 'reject', note };
}

// --- svg template ---------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function renderLabelSvg(art: LabelArt): string {
  const W = 760;
  const H = 1000;
  const cx = W / 2;
  const p: string[] = [];
  // no default fill here: callers always pass one, so we never emit a duplicate fill attribute (invalid xml)
  const text = (x: number, y: number, s: string, size: number, opts = '') =>
    `<text x="${x}" y="${y}" font-size="${size}" ${opts}>${esc(s)}</text>`;

  p.push(`<rect width="${W}" height="${H}" fill="#fbfaf7"/>`);
  p.push(`<rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" stroke="#1a1a1a" stroke-width="3"/>`);

  // masthead
  p.push(text(cx, 150, art.brand, 64, 'text-anchor="middle" font-family="Georgia, serif" font-weight="bold" fill="#14110c"'));
  p.push(text(cx, 208, art.classType, 27, 'text-anchor="middle" font-family="Georgia, serif" font-style="italic" fill="#3a342b"'));
  p.push(`<line x1="170" y1="246" x2="${W - 170}" y2="246" stroke="#3a342b" stroke-width="2"/>`);

  // mandatory facts
  p.push(text(cx, 322, art.alcohol, 30, 'text-anchor="middle" font-family="Georgia, serif" fill="#14110c"'));
  p.push(text(cx, 368, art.netContents, 26, 'text-anchor="middle" font-family="Georgia, serif" fill="#14110c"'));
  p.push(text(cx, 452, `DISTILLED & BOTTLED BY`, 19, 'text-anchor="middle" font-family="Arial, sans-serif" fill="#3a342b"'));
  p.push(text(cx, 480, art.producer, 21, 'text-anchor="middle" font-family="Arial, sans-serif" fill="#14110c"'));
  p.push(text(cx, 510, art.address, 19, 'text-anchor="middle" font-family="Arial, sans-serif" fill="#3a342b"'));
  p.push(text(cx, 540, `PRODUCT OF ${art.country.toUpperCase()}`, 17, 'text-anchor="middle" font-family="Arial, sans-serif" fill="#3a342b"'));

  // government warning block
  if (art.warning) {
    const wy = 700;
    const header = art.warningHeaderCaps ? 'GOVERNMENT WARNING:' : 'Government Warning:';
    const body = art.warning.replace(/^GOVERNMENT WARNING:\s*/i, '');
    p.push(text(60, wy, header, 18, 'font-family="Arial, sans-serif" font-weight="bold" fill="#14110c"'));
    wrap(body, 62).forEach((ln, i) =>
      p.push(text(60, wy + 30 + i * 26, ln, 16, 'font-family="Arial, sans-serif" fill="#14110c"')),
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${p.join('')}</svg>`;
}
