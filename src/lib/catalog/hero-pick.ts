/**
 * Home hero: ONE video at a time, rotating through a list of up to 5 in WIB time slots.
 * - Slot length 24 h / 5 = 288 min; slot = floor(minutes since 00:00 WIB / 288), 0..4 -> list 1..5.
 *   A shorter list cycles (slot % length).
 * - List: the owner's manual picks from /pemilik (KV ANALYTICS_KV "owner:hero:v1", written only
 *   when the owner saves), else the top 5 most-watched videos over the rolling last 24 h, the same
 *   query as the /pemilik "Video terpopuler" list (analytics-d1 d1TopWatchRows24h), keeping only
 *   catalog videos with real thumbnail art.
 * - Computed once per isolate and reused until the slot ends or 10 min pass (whichever first),
 *   so a visit costs no KV/D1 read. Nothing is written per visit.
 */
import type { VideoCard } from "./types";

export const HERO_SLOTS = 5;
export const HERO_SLOT_MIN = (24 * 60) / HERO_SLOTS; // 288
export const HERO_MAX_PICKS = 5;
const KEY = "owner:hero:v1";
const ID_RE = /^[A-Za-z0-9_-]{3,64}$/;
const CACHE_MAX_MS = 10 * 60_000;
const WIB_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;

// Server-only modules are imported lazily so this file stays safe in the client graph.
async function kv() {
  if (!import.meta.env.SSR) return null;
  const { resolveAnalyticsKV } = await import("@/lib/analytics-kv");
  return resolveAnalyticsKV();
}

export type HeroPicks = { ids: string[]; at: number };
export type HeroSource = "manual" | "top24h" | "none";
export type HeroState = {
  source: HeroSource;
  list: VideoCard[];
  slot: number;
  current: VideoCard | null;
  slotEndsAt: number;
};

export function heroSlot(now = Date.now()): { slot: number; endsAt: number } {
  const wib = now + WIB_MS;
  const dayStart = Math.floor(wib / DAY_MS) * DAY_MS;
  const minutes = Math.floor((wib - dayStart) / 60_000);
  const slot = Math.min(HERO_SLOTS - 1, Math.floor(minutes / HERO_SLOT_MIN));
  return { slot, endsAt: dayStart + (slot + 1) * HERO_SLOT_MIN * 60_000 - WIB_MS };
}

function cleanIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const id = typeof v === "string" ? v.trim() : "";
    if (ID_RE.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= HERO_MAX_PICKS) break;
  }
  return out;
}

export async function readHeroPicks(): Promise<HeroPicks> {
  const r = await kv();
  if (!r) return { ids: [], at: 0 };
  try {
    const raw = await r.kv.get(KEY);
    if (!raw) return { ids: [], at: 0 };
    const parsed = JSON.parse(raw) as { ids?: unknown; at?: unknown };
    return { ids: cleanIds(parsed.ids), at: Number(parsed.at) || 0 };
  } catch {
    return { ids: [], at: 0 };
  }
}

/** Owner save only (POST /api/owner-hero). An empty list clears the manual picks. */
export async function writeHeroPicks(ids: unknown): Promise<HeroPicks> {
  const r = await kv();
  if (!r) throw new Error("kv_unavailable");
  const picks = { ids: cleanIds(ids), at: Date.now() };
  await r.kv.put(KEY, JSON.stringify(picks));
  memo = null;
  return picks;
}

/** Known real art only (same rule as the old featured list). */
export function isRealHeroThumb(url: string | null | undefined): boolean {
  const u = (url || "").trim();
  if (!u || /brand-poster/i.test(u)) return false;
  if (/\/api\/(embed-thumb|tape-thumb|puterin-thumb|img-proxy)\?/i.test(u)) return false;
  if (/cdn\.videy\.co\/|videy\.co\//i.test(u)) return false;
  if (/\.(mp4|mov|webm)(\?|$)/i.test(u)) return false;
  return /^https?:\/\//i.test(u);
}

async function cardsFor(ids: string[], needArt: boolean): Promise<VideoCard[]> {
  if (!ids.length) return [];
  const [{ toCard }, { loadItems }] = await Promise.all([
    import("./local-shared"),
    import("./local-cache"),
  ]);
  const bag = await loadItems();
  const out: VideoCard[] = [];
  for (const id of ids) {
    const item = bag.byId.get(id);
    if (!item) continue;
    try {
      const card = toCard(item, bag.posters, bag.videyNo);
      if (needArt && !isRealHeroThumb(card.thumbnail)) continue;
      out.push(card);
    } catch {
      /* skip */
    }
  }
  return out;
}

async function top24hIds(now: number): Promise<string[]> {
  if (!import.meta.env.SSR) return [];
  try {
    const [{ readyD1, d1TopWatchRows24h }, { toTopVideos }] = await Promise.all([
      import("@/lib/analytics-d1"),
      import("@/lib/owner-top-videos"),
    ]);
    const db = await readyD1();
    if (!db) return [];
    const rows = await d1TopWatchRows24h(db, now);
    return toTopVideos(rows).map((v) => v.id);
  } catch {
    return [];
  }
}

/** The ranked hero list (manual picks or top 24 h), max 5. */
export async function heroList(now = Date.now()): Promise<{ source: HeroSource; list: VideoCard[] }> {
  const picks = await readHeroPicks();
  if (picks.ids.length) {
    const list = await cardsFor(picks.ids, true);
    if (list.length) return { source: "manual", list: list.slice(0, HERO_MAX_PICKS) };
  }
  const ids = await top24hIds(now);
  const list = (await cardsFor(ids, true)).slice(0, HERO_MAX_PICKS);
  return { source: list.length ? "top24h" : "none", list };
}

let memo: { state: HeroState; until: number } | null = null;

/** Current hero state; cached per isolate until the slot ends or 10 min, whichever first. */
export async function heroState(now = Date.now()): Promise<HeroState> {
  if (memo && now < memo.until) return memo.state;
  const { slot, endsAt } = heroSlot(now);
  const { source, list } = await heroList(now);
  const current = list.length ? list[slot % list.length] : null;
  const state: HeroState = { source, list, slot, current, slotEndsAt: endsAt };
  memo = { state, until: Math.min(endsAt, now + CACHE_MAX_MS) };
  return state;
}
