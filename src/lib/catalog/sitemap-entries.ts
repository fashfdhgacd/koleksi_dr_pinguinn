import { loadItems } from "./local";

export type SitemapWatchEntry = {
  id: string;
  lastmod?: string;
  title?: string;
  category?: string;
  embed?: string;
  thumbnail?: string;
  duration?: number;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isVideyItem(item: { embed?: unknown; source?: unknown; direct?: unknown }): boolean {
  return /videy/i.test(`${item.embed || ""} ${item.source || ""} ${item.direct || ""}`);
}

function toSitemapLastmod(raw: unknown): string | undefined {
  if (raw == null || raw === "") return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return undefined;
}

/**
 * Semua ID katalog yang bisa di /watch/{id} (non-Videy), untuk sitemap URL-only.
 * Tidak memfilter silo (JAV/AI+/Indo) — GSC butuh daftar URL lengkap.
 */
export async function listSitemapWatchEntries(): Promise<SitemapWatchEntry[]> {
  const { items } = await loadItems();
  const seen = new Set<string>();
  const out: SitemapWatchEntry[] = [];
  for (const it of items) {
    if (!it?.id || seen.has(it.id) || isVideyItem(it)) continue;
    seen.add(it.id);
    const lastmod = toSitemapLastmod(it.createdAt ?? it.date);
    const entry: SitemapWatchEntry = { id: it.id };
    if (lastmod) entry.lastmod = lastmod;
    const title = str(it.title);
    if (title) entry.title = title;
    const category = str(it.category);
    if (category) entry.category = category;
    const embed = str(it.embed);
    if (/^https:\/\//i.test(embed)) entry.embed = embed;
    const thumb = str(it.poster) || str(it.thumbnail);
    if (thumb) entry.thumbnail = thumb;
    if (typeof it.duration === "number" && Number.isFinite(it.duration) && it.duration > 0) {
      entry.duration = Math.round(it.duration);
    }
    out.push(entry);
  }
  out.sort((a, b) => {
    const da = a.lastmod || "";
    const db = b.lastmod || "";
    if (da !== db) return db.localeCompare(da);
    return a.id.localeCompare(b.id);
  });
  return out;
}
