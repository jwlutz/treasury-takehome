import { describe, it, expect } from 'vitest';
import { parseCsv, parseManifestCsv } from './csv';

describe('csv parsing', () => {
  it('keeps commas inside quoted fields (addresses)', () => {
    const rows = parseCsv('a,b,c\n1,"Frankfort, KY",3');
    expect(rows[1]).toEqual(['1', 'Frankfort, KY', '3']);
  });

  it('handles escaped quotes and crlf', () => {
    const rows = parseCsv('name\r\n"the ""good"" stuff"\r\n');
    expect(rows[1][0]).toBe('the "good" stuff');
  });

  it('maps a manifest row to application fields', () => {
    const csv =
      'filename,beverage_type,brand_name,class_type,alcohol_content,net_contents,producer_name,producer_address,country_of_origin\n' +
      'a.jpg,distilled_spirits,OLD TOM,Bourbon,45% Alc./Vol.,750 mL,Old Tom LLC,"Frankfort, KY",United States';
    const [row] = parseManifestCsv(csv);
    expect(row.filename).toBe('a.jpg');
    expect(row.application.brand_name).toBe('OLD TOM');
    expect(row.application.producer_address).toBe('Frankfort, KY');
    expect(row.application.beverage_type).toBe('distilled_spirits');
  });

  it('infers beverage type when the column is missing', () => {
    const csv = 'filename,brand_name,class_type\nx.jpg,CHATEAU,Cabernet Sauvignon';
    expect(parseManifestCsv(csv)[0].application.beverage_type).toBe('wine');
  });

  it('throws without a filename column', () => {
    expect(() => parseManifestCsv('brand_name\nfoo')).toThrow(/filename/);
  });
});
