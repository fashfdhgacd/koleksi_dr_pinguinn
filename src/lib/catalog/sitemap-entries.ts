import { loadItems } from "./local";
import { slugOf } from "./local-shared";

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
 * Semua ID katalog yang bisa di /watch/{id} (termasuk Videy), untuk sitemap. Dibangun dari katalog
 * live, jadi upload baru (Videy juga) otomatis masuk; respons sitemap di-cache 1 jam.
 * Tidak memfilter silo (JAV/AI+/Indo) — GSC butuh daftar URL lengkap.
 */
/** Entries per catalog build (the items array changes only on a rebuild); callers only read them. */
const memo = new WeakMap<object, SitemapWatchEntry[]>();

export async function listSitemapWatchEntries(): Promise<SitemapWatchEntry[]> {
  const { items } = await loadItems();
  const hit = memo.get(items);
  if (hit) return hit;
  const seen = new Set<string>();
  const out: SitemapWatchEntry[] = [];
  for (const it of items) {
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    const lastmod = toSitemapLastmod(it.createdAt ?? it.date);
    const entry: SitemapWatchEntry = { id: it.id };
    if (lastmod) entry.lastmod = lastmod;
    const title = str(it.title);
    if (title) entry.title = title;
    // Sama dengan halaman tonton (toCard → slugOf), bukan field mentah.
    const category = slugOf(it) || str(it.category);
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
  memo.set(items, out);
  return out;
}
