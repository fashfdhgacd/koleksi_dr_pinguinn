import { videoSeoDescription } from "@/lib/seo";

/** Teks di bawah judul halaman tonton. Jangan kosong, jangan ulang judul. */
export function watchDescription(item: {
  title: string;
  description?: string | null;
  category?: string | null;
  creator?: string | null;
}): string {
  const title = (item.title || "").trim();
  const raw = (item.description || "").trim();
  if (
    raw &&
    raw.toLowerCase() !== title.toLowerCase() &&
    !/^nonton\s+/i.test(raw) &&
    !/streaming amatir, jilbab/i.test(raw) &&
    raw.length >= 12
  ) {
    return raw.length > 220 ? `${raw.slice(0, 217).trimEnd()}…` : raw;
  }
  return videoSeoDescription(title, item.category, { creator: item.creator });
}
