/** State review pemilik (KV ANALYTICS_KV, key tunggal). Hanya dipakai lewat endpoint owner-auth. */
import { resolveAnalyticsKV } from "@/lib/analytics-kv";
import { newerDecisions, type DecisionMap } from "@/lib/owner-decisions.js";

export type PublishState = "off" | "on";
export type ReviewState = {
  checked: Record<string, number>;
  publish: Record<string, PublishState>;
  firstSeen: Record<string, number>;
  seeded?: boolean;
  /** REVIEW_PENDING approvals: the owner's proof note that every performer was 18+ at production. */
  proof?: Record<string, { note: string; at: number }>;
  /** Owner decisions in "Perlu dicek" (owner-decisions.js): "show" = approved for good, "keep" = held. */
  decisions?: DecisionMap;
};

const KEY = "owner:review-state:v1";
const TTL_MS = 30_000;
let mem: { at: number; state: ReviewState } | null = null;
/** Decisions this isolate wrote: merged over an edge-cached (stale) read so none is lost. */
let lastDecisions: DecisionMap | null = null;

function empty(): ReviewState {
  return { checked: {}, publish: {}, firstSeen: {} };
}

export async function readReviewState(fresh = false): Promise<ReviewState> {
  if (!fresh && mem && Date.now() - mem.at < TTL_MS) return mem.state;
  let state = empty();
  try {
    const r = await resolveAnalyticsKV();
    const raw = r ? await r.kv.get(KEY) : null;
    if (raw) state = { ...empty(), ...(JSON.parse(raw) as ReviewState) };
    if (lastDecisions) state.decisions = newerDecisions(state.decisions, lastDecisions);
  } catch {
    if (mem) return mem.state;
  }
  mem = { at: Date.now(), state };
  return state;
}

export async function writeReviewState(state: ReviewState): Promise<boolean> {
  const r = await resolveAnalyticsKV();
  if (!r) return false;
  await r.kv.put(KEY, JSON.stringify(state));
  if (state.decisions) lastDecisions = state.decisions;
  mem = { at: Date.now(), state };
  return true;
}

/** Set id yang dipaksa 'Tidak publish' (dipakai filter publik). */
export async function unpublishedIds(): Promise<Set<string>> {
  const s = await readReviewState();
  return new Set(Object.keys(s.publish).filter((k) => s.publish[k] === "off"));
}
