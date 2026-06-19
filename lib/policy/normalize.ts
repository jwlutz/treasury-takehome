// string normalize + similarity for the field checks

/** lowercase, collapse whitespace, fix unicode quotes. keeps punctuation. */
export function normalizeText(s: string): string {
  return (s ?? '')
    .normalize('NFKC')
    .replace(/[‘’ʼ´]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** same, but drops punctuation too. for fuzzy brand similarity. */
export function normalizeLoose(s: string): string {
  return normalizeText(s)
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** strip producer lead-ins so "produced/bottled by X" matches "X" */
export function normalizeProducer(s: string): string {
  return normalizeText(s)
    .replace(/^(?:produced|distilled|bottled|brewed|made|manufactured|vinted|blended|imported|crafted|packaged)[a-z/&,\s]*?\bby\b\s*/, '')
    .trim();
}

/** case-insensitive but keeps punctuation + words (only collapses whitespace). the warning uses this. */
export function foldCase(s: string): string {
  return (s ?? '')
    .normalize('NFKC')
    .replace(/[‘’ʼ´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** 1 = identical, 0 = nothing in common (after loose normalize) */
export function similarity(a: string, b: string): number {
  const x = normalizeLoose(a);
  const y = normalizeLoose(b);
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}
