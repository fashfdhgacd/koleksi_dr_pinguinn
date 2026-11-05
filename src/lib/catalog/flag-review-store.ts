/**
 * Owner decisions for the /pemilik flag review queue (ANALYTICS_KV, key owner:flag-review:v1).
 * Approve = keep public. Reject is not stored here: it uses the catalog blocklist.
 * Written only from the owner action. Reads happen with the other moderation lists.
 */
import { resolveAnalyticsKV } from "@/lib/analytics-kv";
import { BLOCK_ID_RE } from "@/lib/catalog/catalog-block.js";

export type FlagReviewState = { approved: Record<string, { at: number }> };

const KEY = "owner:flag-review:v1";
const JOURNAL_MS = 120_000;
const journal = new Map<string, number>();

function clean(raw: unknown): FlagReviewState {
  const approved: FlagReviewState["approved"] = {};
  const src = (raw as { approved?: unknown })?.approved;
  if (src && typeof src === "object" && !Array.isArray(src)) {
    for (const [id, v] of Object.entries(src as Record<string, unknown>)) {
      if (!BLOCK_ID_RE.test(id)) continue;
      approved[id] = { at: Number((v as { at?: unknown })?.at) || 0 };
    }
  }
  return { approved };
}

function withJournal(state: FlagReviewState): FlagReviewState {
  const now = Date.now();
  for (const [id, at] of journal) {
    if (now - at > JOURNAL_MS) {
      journal.delete(id);
      continue;
    }
    if (!state.approved[id]) state.approved[id] = { at };
  }
  return state;
}

export async function readFlagReviewState(): Promise<FlagReviewState> {
  const r = await resolveAnalyticsKV();
  if (!r) throw new Error("kv_unavailable");
  const raw = await r.kv.get(KEY);
  if (!raw) return withJournal({ approved: {} });
  try {
    return withJournal(clean(JSON.parse(raw)));
  } catch {
    return withJournal({ approved: {} });
  }
}

/** Owner chose "Biarkan tayang" for one id. */
export async function approveFlagReview(id: string): Promise<FlagReviewState> {
  if (!BLOCK_ID_RE.test(id)) throw new Error("bad_id");
  const r = await resolveAnalyticsKV();
  if (!r) throw new Error("kv_unavailable");
  const state = await readFlagReviewState();
  const at = Date.now();
  state.approved[id] = { at };
  await r.kv.put(KEY, JSON.stringify(clean(state)));
  journal.set(id, at);
  return state;
}
