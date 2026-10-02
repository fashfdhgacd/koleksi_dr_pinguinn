/**
 * Owner analytics — online counter uses hybrid presence:
 *   1) in-memory Map (warm isolate)
 *   2) Cloudflare KV (shared across isolates) when bound
 *   3) Postgres sessions table when DATABASE_URL works
 * Postgres remains source of truth for historical pageviews.
 */

import { dbSource, getSql } from "@/lib/db";
import { resolveAnalyticsKV } from "@/lib/analytics-kv";

export type DeviceKind = "mobile" | "desktop" | "tablet" | "bot" | "other";

export type PageHit = {
  path: string;
  ref: string;
  device: DeviceKind;
  host: string;
  ts: number;
};

export type OwnerStats = {
  online: number;
  count: number;
  peakToday: number;
  peakDay: string;
  views24h: number;
  viewsToday: number;
  uniqueToday: number;
  views7d: number;
  views30d: number;
  hourly: { hour: string; views: number }[];
  topPaths: { path: string; views: number }[];
  topRefs: { ref: string; views: number }[];
  devices: { device: DeviceKind; views: number }[];
  hosts: { host: string; views: number }[];
  storage: "postgres" | "pglite" | "kv" | "kv-rest" | "memory" | "error";
  persistOk: boolean;
  database: "connected" | "error";
  analytics: "operational" | "unavailable";
  updatedAt: string;
  presence?: "memory" | "kv" | "postgres" | "hybrid";
  hint?: string;
};

/** Active window — UI says ±2 menit; client heartbeat 90s; KV TTL ≥ window + margin. */
const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const ONLINE_KV_PREFIX = "online:";
const ONLINE_KV_TTL_SEC = 180; // 3 min TTL (≥ 2 min window + margin)
const DAYSTATS_KV_PREFIX = "daystats:";
const UV_KV_PREFIX = "uv:";
const DAYSTATS_TTL_SEC = 172800; // 48h — keep today+yesterday

// REEXPORT_STUB - will be replaced
export async function touchOnline(id: string): Promise<number> { return 0; }
export async function recordHit(_input: unknown): Promise<void> {}
export async function getOwnerStats(): Promise<OwnerStats> {
  return {
    online: 0, count: 0, peakToday: 0, peakDay: "", views24h: 0, viewsToday: 0,
    uniqueToday: 0, views7d: 0, views30d: 0, hourly: [], topPaths: [], topRefs: [],
    devices: [], hosts: [], storage: "memory", persistOk: false, database: "error",
    analytics: "unavailable", updatedAt: new Date().toISOString(),
  };
}
export function classifyDevice(ua: string): DeviceKind {
  const u = ua.toLowerCase();
  if (/bot|crawl|spider/i.test(u)) return "bot";
  if (/mobi|android|iphone/i.test(u)) return "mobile";
  if (/ipad|tablet/i.test(u)) return "tablet";
  if (/windows|macintosh|linux/i.test(u)) return "desktop";
  return "other";
}
export async function countOnline(): Promise<number> { return 0; }
export async function analyticsHealth() {
  return { database: "error" as const, analytics: "unavailable" as const, storage: "error" as const, timestamp: new Date().toISOString() };
}
export async function pruneAnalytics(): Promise<void> {}
export async function maybeTelegramAlert(): Promise<void> {}
export async function getKV() { return null; }
