/**
 * STUB — fitur review / filter istilah minor DINONAKTIFKAN.
 * Semua fungsi selalu return "bukan minor" supaya tidak ada video yang disembunyikan.
 */

export const TOCIL_SOURCE = "(?!x)x"; // never matches

/** Selalu false — tidak ada video yang dianggap minor. */
export function isRealMinor(_item?: { title?: unknown; tags?: unknown; category?: unknown }): boolean {
  return false;
}

/** Selalu array kosong — tidak ada istilah yang match. */
export function matchedTermsV2(_item?: { title?: unknown; tags?: unknown }): string[] {
  return [];
}

export function matchedTerms(_item?: { title?: unknown; tags?: unknown }): string[] {
  return [];
}
