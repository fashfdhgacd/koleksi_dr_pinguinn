/**
 * Owner analytics — online counter uses hybrid presence:
 *   1) in-memory Map (warm isolate)
 *   2) Cloudflare KV (shared across isolates) when bound
 *   3) Postgres sessions table when DATABASE_URL works
 * Postgres remains source of truth for historical pageviews.
 */
export type { DeviceKind, PageHit, OwnerStats } from "@/lib/owner-analytics-shared";
export { classifyDevice } from "@/lib/owner-analytics-shared";
export {
  analyticsHealth,
  countOnline,
  recordHit,
  touchOnline,
} from "@/lib/owner-analytics-presence";
export {
  getOwnerStats,
  maybeTelegramAlert,
  pruneAnalytics,
} from "@/lib/owner-analytics-stats";
