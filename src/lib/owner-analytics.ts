/**
 * Owner analytics — online counter uses hybrid presence:
 *   1) in-memory Map (warm isolate)
 *   2) Cloudflare KV (shared across isolates) when bound
 *   3) Postgres sessions table when DATABASE_URL works
 * Postgres remains source of truth for historical pageviews.
 */

import { dbSource, getSql } from "@/lib/db";
import { resolveAnalyticsKV } from "@/lib/analytics-kv";
