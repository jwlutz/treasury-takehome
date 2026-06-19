// minimal quote-aware csv. the manifest has commas inside quoted fields (addresses like
// "Frankfort, KY"), so a naive split on comma is wrong. handles "" escapes and crlf.
import type { ApplicationFields, BeverageType } from './policy/types';
import { inferBeverage } from './policy';

export function parseCsv(text: string): string[][] {
  const s = text.replace(/\r\n?/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // drop fully blank lines
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export interface BatchManifestRow {
  filename: string;
  application: ApplicationFields;
}

const BEVERAGES: BeverageType[] = ['distilled_spirits', 'wine', 'malt_beverage'];

// map a manifest csv (header row + one row per label) to filename -> application values.
// beverage_type column is optional; if absent or unknown we infer it from class/type.
export function parseManifestCsv(text: string): BatchManifestRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const at = (name: string) => header.indexOf(name);
  if (at('filename') < 0) throw new Error('csv needs a "filename" column');
  const get = (r: string[], name: string) => {
    const i = at(name);
    return i >= 0 ? (r[i] ?? '').trim() : '';
  };

  return rows
    .slice(1)
    .map((r) => {
      const class_type = get(r, 'class_type');
      const bev = get(r, 'beverage_type').toLowerCase().replace(/[\s-]+/g, '_');
      const beverage_type = (BEVERAGES as string[]).includes(bev) ? (bev as BeverageType) : inferBeverage(class_type);
      return {
        filename: get(r, 'filename'),
        application: {
          beverage_type,
          brand_name: get(r, 'brand_name'),
          class_type,
          alcohol_content: get(r, 'alcohol_content'),
          net_contents: get(r, 'net_contents'),
          producer_name: get(r, 'producer_name'),
          producer_address: get(r, 'producer_address'),
          country_of_origin: get(r, 'country_of_origin'),
        },
      };
    })
    .filter((r) => r.filename);
}
