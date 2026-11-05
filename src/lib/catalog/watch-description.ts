import { curatedDescription } from "@/lib/catalog/video-descriptions";
import { cleanDisplayTitle, cleanRawDescription, videoBodyDescription, type SeoVideoInput } from "@/lib/seo";

/** Teks di bawah judul halaman tonton. Jangan kosong, jangan ulang judul, tanpa catatan internal. */
export function watchDescription(item: SeoVideoInput & { id?: string }): string {
  const curated = curatedDescription(item.id);
  if (curated) return curated;
  const raw = cleanRawDescription(item);
  if (raw) return raw.length > 220 ? `${raw.slice(0, 217).trimEnd()}…` : raw;
  return videoBodyDescription(item);
}

/** Versi lebih panjang untuk body (target ~180–280 kata). */
export function longWatchDescription(item: SeoVideoInput & { id?: string }): string {
  const base = watchDescription(item);
  if (base.length > 280) return base;
  const title = cleanDisplayTitle(item.title);
  const cat = String(item.category || "").trim() || "video";
  const extra = ` Video ini berjudul “${title}” dan masuk kategori ${cat}. Streaming langsung tersedia tanpa daftar akun. Konten dewasa 18+ saja. Jika kamu suka kategori ini, cek juga video lain yang serupa di halaman kategori.`;
  return (base + extra).replace(/\s+/g, " ").trim();
}
