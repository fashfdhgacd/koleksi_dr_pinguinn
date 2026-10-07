/** Shared search normalization + ranking (SSR and API use the same code path). */

const STOPWORDS = new Set([
  "bokep", "video", "vidio", "nonton", "streaming", "film", "terbaru", "full", "hd",
  "koleksi", "dr", "pinguin", "msb", "yang", "dan", "di", "ke", "dari", "sama", "the", "a", "an", "of",
]);

export function normalizeSearchText(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/_+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type SearchQuery = { phrase: string; tokens: string[] };

export function parseSearchQuery(q: string): SearchQuery {
  const phrase = normalizeSearchText(q);
  const all = phrase ? phrase.split(" ") : [];
  const content = all.filter((t) => !STOPWORDS.has(t));
  return { phrase, tokens: Array.from(new Set(content.length ? content : all)) };
}

/** 0 = no match. Exact phrase > all tokens > number of matched tokens. */
export function scoreSearch(hayNorm: string, sq: SearchQuery): number {
  if (!sq.tokens.length) return 0;
  const words = ` ${hayNorm} `;
  let hit = 0;
  let whole = 0;
  for (const t of sq.tokens) {
    if (hayNorm.includes(t)) {
      hit++;
      if (words.includes(` ${t} `)) whole++;
    }
  }
  const need = Math.max(1, Math.ceil(sq.tokens.length / 2));
  if (hit < need) return 0;
  let score = hit * 10 + whole * 2;
  if (hit === sq.tokens.length) score += 500;
  if (sq.phrase && words.includes(` ${sq.phrase} `)) score += 1000;
  else if (sq.phrase && hayNorm.includes(sq.phrase)) score += 800;
  return score;
}
