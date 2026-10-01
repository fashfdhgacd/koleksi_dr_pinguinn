import { resolveVideoSeoDescription, videoSeoDescription } from "@/lib/seo";

/** Teks di bawah judul halaman tonton. Jangan kosong, jangan ulang judul. */
export function watchDescription(item: {
  title: string;
  description?: string | null;
  category?: string | null;
  creator?: string | null;
  source?: string | null;
}): string {
  const title = (item.title || "").trim();
  const raw = (item.description || "").trim();
  if (
    raw &&
    raw.length >= 60 &&
    raw.toLowerCase() !== title.toLowerCase() &&
    !/^nonton\s+/i.test(raw) &&
    !/streaming amatir, jilbab/i.test(raw) &&
    !(title.length > 8 && raw.toLowerCase().startsWith(title.toLowerCase()) && raw.length < title.length + 40)
  ) {
    return raw.length > 220 ? `${raw.slice(0, 217).trimEnd()}…` : raw;
  }
  // Sedikit lebih panjang di badan halaman daripada meta
  const meta = resolveVideoSeoDescription(item);
  if (meta.length >= 100) return meta;
  return videoSeoDescription(title, item.category, { creator: item.creator, source: item.source });
}
