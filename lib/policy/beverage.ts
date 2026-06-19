// infer beverage type from the class/type text. the app form has an explicit selector, so this
// is only for seeding: the demo examples and the spike, where we only have class/type on hand.
import type { BeverageType } from './types';

export function inferBeverage(classType: string): BeverageType {
  const s = (classType ?? '').toLowerCase();
  if (/wine|cabernet|chardonnay|merlot|pinot|ros|sauvignon|riesling|zinfandel|port|sherry/.test(s)) return 'wine';
  if (/ale|lager|ipa|stout|porter|pilsner|beer|malt|brown|saison/.test(s)) return 'malt_beverage';
  return 'distilled_spirits';
}
