/** Regex istilah minor (tanpa dependency; dipakai juga oleh plugin build). */
export const MINOR_RE_SOURCE =
  "(?<![A-Za-z0-9])(abg|tocil|teen|teens|underage|bocil|anak|smp|sma|smk|loli|lolita|shota|remaja|bocah|pelajar|sekolah|seragam[\\s_]+sekolah|perawan[\\s_]+kecil|gadis[\\s_]+kecil|dedek|adek|adik|under[\\s_]*-?[\\s_]*age|di[\\s_]*bawah[\\s_]*umur)(?![A-Za-z0-9])";
export const MINOR_RE_NO_TOCIL_SOURCE = MINOR_RE_SOURCE.replace("tocil|", "");

/** True bila judul/tag kena istilah minor sungguhan (bukan cuma 'tocil'). */
export function isRealMinor(item: { title?: unknown; tags?: unknown } | null | undefined): boolean {
  return isRealMinorV2(item);
}

/** Matcher lama (dipakai hanya untuk perbandingan). */
export function isRealMinorLegacy(item: { title?: unknown; tags?: unknown } | null | undefined): boolean {
  if (!item) return false;
  const tags = Array.isArray(item.tags) ? item.tags.join(" ") : String(item.tags ?? "");
  return new RegExp(MINOR_RE_NO_TOCIL_SOURCE, "i").test(`${String(item.title ?? "")} ${tags}`);
}

// ---- Matcher v2 (kurangi false positive) ----
const B = "(?<![A-Za-z0-9])";
const E = "(?![A-Za-z0-9])";
const S = "[\\s_\\-]*";
const AGE = `(?:1[0-7]${S}(?:yo|y\\.?o\\.?|th|thn|tahun|years?${S}old)|(?:umur|usia)${S}1[0-7])`;
/** Selalu flag. */
export const STRONG_SOURCE = `${B}(?:sma|smp|smk|sd|sekolah|murid|murit|anak${S}perawan|pelajar|siswi|siswa|osis|bocil|loli|lolita|shota|remaja|teen|teens|abg|under${S}age|di${S}bawah${S}umur|${AGE})${E}`;
/** Konteks sekolah/umur (untuk mengaktifkan kata generik). */
export const CONTEXT_SOURCE = `${B}(?:sekolah|seragam${S}sekolah|umur|usia)${E}`;
/** Kata generik/ambigu: hanya flag bila bersama STRONG/CONTEXT. */
export const WEAK_SOURCE = `${B}(?:anak|adik|adek|dedek|ade|kecil|muda|imut|bocah|perawan${S}kecil|gadis${S}kecil)${E}`;
export const TOCIL_SOURCE = `${B}tocil${E}`;

function hay(item: { title?: unknown; tags?: unknown }): string {
  const tags = Array.isArray(item.tags) ? item.tags.join(" ") : String(item.tags ?? "");
  // Buang penanda kualitas di akhir (mis. "_SD", "(SD)") supaya tidak terbaca 'sd' (sekolah dasar).
  const title = String(item.title ?? "").replace(/[\s_\-(\[]+(?:sd|hd|fhd)[)\]]?\s*$/i, "");
  return `${title} ${tags}`;
}

/** Kombinasi dua kata generik yang jelas mengarah ke anak (mis. 'adek kecil'). */
const SIBLING_SMALL = [`${B}(?:adik|adek|dedek|ade)${E}`, `${B}(?:kecil|bocah|imut)${E}`];

/** v2: istilah minor sungguhan (tanpa 'tocil'). */
export function isRealMinorV2(item: { title?: unknown; tags?: unknown } | null | undefined): boolean {
  if (!item) return false;
  const h = hay(item);
  if (new RegExp(STRONG_SOURCE, "i").test(h)) return true;
  if (SIBLING_SMALL.every((r) => new RegExp(r, "i").test(h))) return true;
  if (new RegExp(SIBLING_SMALL[0]!, "i").test(h) && new RegExp(TOCIL_SOURCE, "i").test(h)) return true;
  return new RegExp(WEAK_SOURCE, "i").test(h) && new RegExp(CONTEXT_SOURCE, "i").test(h);
}

/** Istilah yang cocok (untuk panel pemilik). Kata generik hanya ditampilkan bila ikut memicu. */
export function matchedTermsV2(item: { title?: unknown; tags?: unknown } | null | undefined): string[] {
  if (!item) return [];
  const h = hay(item);
  const out = new Set<string>();
  const add = (src: string) => {
    for (const m of h.matchAll(new RegExp(src, "gi"))) out.add(m[0].toLowerCase().replace(/[\s_\-]+/g, " "));
  };
  add(TOCIL_SOURCE);
  add(STRONG_SOURCE);
  const ctx = new RegExp(CONTEXT_SOURCE, "i").test(h);
  if (ctx || isRealMinorV2(item)) {
    add(WEAK_SOURCE);
    add(CONTEXT_SOURCE);
  }
  return [...out];
}
