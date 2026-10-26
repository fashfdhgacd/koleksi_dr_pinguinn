import { curatedDescription } from "@/lib/catalog/video-descriptions";
import { cleanRawDescription, videoBodyDescription, type SeoVideoInput } from "@/lib/seo";

/** Teks di bawah judul halaman tonton. Jangan kosong, jangan ulang judul, tanpa catatan internal. */
export function watchDescription(item: SeoVideoInput & { id?: string }): string {
  const curated = curatedDescription(item.id);
  if (curated) return curated;
  const raw = cleanRawDescription(item);
  if (raw) return raw.length > 220 ? `${raw.slice(0, 217).trimEnd()}…` : raw;
  return videoBodyDescription(item);
}
