/** Regex istilah minor (tanpa dependency; dipakai juga oleh plugin build). */
export const MINOR_RE_SOURCE =
  "(?<![A-Za-z0-9])(abg|tocil|teen|teens|underage|bocil|anak|smp|sma|smk|loli|lolita|shota|remaja|bocah|pelajar|sekolah|seragam[\\s_]+sekolah|perawan[\\s_]+kecil|gadis[\\s_]+kecil|dedek|adek|adik|under[\\s_]*-?[\\s_]*age|di[\\s_]*bawah[\\s_]*umur)(?![A-Za-z0-9])";
export const MINOR_RE_NO_TOCIL_SOURCE = MINOR_RE_SOURCE.replace("tocil|", "");

/** True bila judul/tag kena istilah minor sungguhan (bukan cuma 'tocil'). */
export function isRealMinor(item: { title?: unknown; tags?: unknown } | null | undefined): boolean {
  if (!item) return false;
  const tags = Array.isArray(item.tags) ? item.tags.join(" ") : String(item.tags ?? "");
  return new RegExp(MINOR_RE_NO_TOCIL_SOURCE, "i").test(`${String(item.title ?? "")} ${tags}`);
}
