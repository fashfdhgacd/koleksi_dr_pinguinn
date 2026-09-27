#!/usr/bin/env node
/**
 * Nitro cloudflare-module writes .output/server/wrangler.json and may omit
 * nodejs_compat — without it, CF rejects the upload (node:fs from pg/pglite).
 * Also keep custom domain routes / observability from being wiped when possible.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const paths = [
  join(root, ".output/server/wrangler.json"),
  join(root, ".wrangler/deploy/config.json"),
];

for (const p of paths) {
  if (!existsSync(p)) {
    console.log("[cf-patch] skip (missing)", p);
    continue;
  }
  let raw = readFileSync(p, "utf8");
  let j;
  try {
    j = JSON.parse(raw);
  } catch {
    console.log("[cf-patch] skip (not json)", p);
    continue;
  }

  // Ensure nodejs_compat
  const flags = new Set([
    ...(Array.isArray(j.compatibility_flags) ? j.compatibility_flags : []),
    "nodejs_compat",
  ]);
  j.compatibility_flags = [...flags];

  // 2026-09-27+: nodejs_compat / node:fs tersedia di Workers
  j.compatibility_date = "2026-09-27";

  // Ensure ANALYTICS_KV binding survives Nitro rewrite
  const kvId = "8c809729ccd64e5da6e9cb7dd62fb40b";
  const need = [
    { binding: "ANALYTICS_KV", id: kvId },
    { binding: "DR_PINGUIN_ANALYTICS", id: kvId },
  ];
  const existing = Array.isArray(j.kv_namespaces) ? j.kv_namespaces : [];
  const byBind = new Map(existing.map((x) => [x.binding, x]));
  for (const n of need) byBind.set(n.binding, n);
  j.kv_namespaces = [...byBind.values()];


  // Don't wipe routes — if empty, leave a note; CF dashboard routes may still apply
  // if we avoid sending empty routes array. Delete empty routes key.
  if (Array.isArray(j.routes) && j.routes.length === 0) {
    delete j.routes;
  }

  // Keep observability on if present remotely (safer default)
  if (!j.observability) {
    j.observability = { enabled: true, logs: { enabled: true } };
  } else {
    j.observability.enabled = true;
    j.observability.logs = { ...(j.observability.logs || {}), enabled: true };
  }

  writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  console.log(
    "[cf-patch] updated",
    p,
    "flags=",
    j.compatibility_flags.join(","),
    "date=",
    j.compatibility_date,
  );
}
