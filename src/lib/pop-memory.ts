/**
 * Per-video popunder memory (pure, no DOM) so each recently opened video keeps its own count.
 * Before this, only the last video was remembered, so A -> B -> A gave A a fresh count.
 * List order is least-recent first; an entry expires POP_MEMORY_TTL_MS after its last pop, and
 * at most POP_MEMORY_MAX videos are kept (the least recent one is dropped first).
 */
export const POP_MEMORY_MAX = 50;
export const POP_MEMORY_TTL_MS = 24 * 60 * 60 * 1000;

export type PopEntry = { id: string; n: number; at: number };

function valid(e: unknown): e is PopEntry {
  const v = e as PopEntry;
  return Boolean(v) && typeof v.id === "string" && v.id !== "" && Number.isFinite(v.n) && v.n >= 0 && Number.isFinite(v.at);
}

/** Drops expired entries and keeps only the POP_MEMORY_MAX most recent ones. */
export function prunePopMemory(list: readonly PopEntry[], now: number): PopEntry[] {
  return list.filter((e) => now - e.at < POP_MEMORY_TTL_MS).slice(-POP_MEMORY_MAX);
}

/** Reads a stored list; anything malformed yields an empty memory. */
export function parsePopMemory(raw: string | null, now: number): PopEntry[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? prunePopMemory(v.filter(valid), now) : [];
  } catch {
    return [];
  }
}

/** The live entry for a video, or null when it never popped or its entry expired. */
export function popEntry(list: readonly PopEntry[], id: string, now: number): PopEntry | null {
  const e = list.find((x) => x.id === id);
  return e && now - e.at < POP_MEMORY_TTL_MS ? e : null;
}

/** Returns a new list with one more opened popunder for `id`, moved to the most-recent end. */
export function recordPop(list: readonly PopEntry[], id: string, now: number): PopEntry[] {
  const prev = popEntry(list, id, now);
  const rest = list.filter((x) => x.id !== id);
  return prunePopMemory([...rest, { id, n: (prev?.n ?? 0) + 1, at: now }], now);
}
