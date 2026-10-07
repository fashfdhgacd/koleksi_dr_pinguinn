import type { VideoCard } from "./types";

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = str(x);
      if (s) return s;
    }
  }
  return "";
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Repair a card from API/LocalStorage so UI string calls can never throw. Never drops a card that has an id. */
export function sanitizeCard(raw: unknown): VideoCard | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const id = str(c.id).trim();
  if (!id) return null;
  return {
    ...(c as object),
    id,
    title: str(c.title).trim() || "Video",
    thumbnail: str(c.thumbnail),
    description: str(c.description),
    category: str(c.category),
    duration: numOrNull(c.duration),
    durationLabel: str(c.durationLabel),
    quality: str(c.quality),
    year: c.year == null ? null : str(c.year) || null,
    creator: c.creator == null ? null : str(c.creator) || null,
    views: numOrNull(c.views),
  } as VideoCard;
}

export function sanitizeCards(list: unknown): VideoCard[] {
  if (!Array.isArray(list)) return [];
  const out: VideoCard[] = [];
  for (const x of list) {
    const c = sanitizeCard(x);
    if (c) out.push(c);
  }
  return out;
}

/** Walk a catalog response and repair every card list / detail item in place. */
export function sanitizeResponse<T>(body: T): T {
  if (!body || typeof body !== "object") return body;
  const b = body as Record<string, unknown>;
  for (const k of ["items", "featured", "related"]) if (Array.isArray(b[k])) b[k] = sanitizeCards(b[k]);
  if (b.latest && typeof b.latest === "object") {
    const l = b.latest as Record<string, unknown>;
    if (Array.isArray(l.items)) l.items = sanitizeCards(l.items);
  }
  if (b.item && typeof b.item === "object") {
    const fixed = sanitizeCard(b.item);
    if (fixed) b.item = { ...(b.item as object), ...fixed };
  }
  return body;
}
