import type { RawItem } from "./local-shared";

/**
 * AI+ page 1 ordering (SEO): /kategori/ai-plus ranks for "bokep AI" / "bokep AI indo" searches, but
 * its newest window was filled with Chinese AI dramas ("AI drama China …" and titles in Chinese
 * characters), which do not match what those visitors search for.
 *
 * Ordering only, nothing is hidden: inside the newest WINDOW items, every other item keeps its
 * newest-first order and moves ahead of the Chinese-drama items, which follow in their own order.
 * Items past the window keep their exact position, so pages 3+ are unchanged and the pool is a
 * permutation (no duplicates or gaps across pages).
 */
export const AI_PLUS_FRONT_WINDOW = 72;

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CHINA_DRAMA_RE = /\b(?:drama\s+(?:china|cina|tiongkok|mandarin)|china\s+drama|chinese\s+drama|c-?drama)\b/i;

/** True for Chinese-language / "AI drama China" titles. */
export function isChineseDramaTitle(title: unknown): boolean {
  const t = typeof title === "string" ? title : "";
  if (!t) return false;
  return CJK_RE.test(t) || CHINA_DRAMA_RE.test(t);
}

/** One reordered pool per pool array (pools are rebuilt only with the catalog build). */
const memo = new WeakMap<RawItem[], RawItem[]>();

export function aiPlusFrontOrder(pool: RawItem[], window = AI_PLUS_FRONT_WINDOW): RawItem[] {
  const hit = memo.get(pool);
  if (hit) return hit;
  const head = pool.slice(0, window);
  const front: RawItem[] = [];
  const back: RawItem[] = [];
  for (const it of head) (isChineseDramaTitle(it?.title) ? back : front).push(it);
  const out = back.length && front.length ? [...front, ...back, ...pool.slice(window)] : pool;
  memo.set(pool, out);
  return out;
}
