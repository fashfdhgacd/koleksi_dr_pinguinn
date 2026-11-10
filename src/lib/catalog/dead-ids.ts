import deadSources from "./dead-sources.json";

/**
 * ID video yang confirmed "gone" oleh dead-video check (scripts/dead-sources.py — dua run
 * berjarak >=6 jam sama-sama bilang dihapus). "suspect" sengaja tidak termasuk: bisa false
 * positive. Video gone tetap punya halaman /watch (pesan "Dihapus oleh sumber") tapi keluar dari
 * grid, featured, pencarian, ranking, sitemap, dan RSS — tidak buang crawl budget untuk video mati.
 */
const GONE = new Set<string>(
  Object.keys(((deadSources as { gone?: Record<string, unknown> }).gone || {}) as Record<string, unknown>),
);

export function isGoneVideo(id: string | null | undefined): boolean {
  return Boolean(id && GONE.has(id));
}
