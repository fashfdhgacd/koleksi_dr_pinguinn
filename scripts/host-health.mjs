#!/usr/bin/env node
// Daily per-host check (runs in the Daily video sync workflow, ~10 DNS lookups, no secrets besides the
// workflow GITHUB_TOKEN). Writes data/host-counts.json; on a problem posts one Telegram alert through
// the Worker (/api/owner-tools action host-alert, existing bot token) and writes host-alerts.txt so the job fails after
// its commit step (GitHub then emails the owner too).
import fs from "node:fs";
import dns from "node:dns/promises";
import { createRequire } from "node:module";
import { hostAlerts, summarize } from "./lib/host-health-lib.mjs";

const require = createRequire(import.meta.url);
const chunks = require("./lib/latest-chunks.cjs");
const STATE = "data/host-counts.json";

const byId = new Map();
const add = (arr) => {
  for (const it of Array.isArray(arr) ? arr : []) if (it && it.id && !byId.has(it.id)) byId.set(it.id, it);
};
add(chunks.loadAll("videos-latest"));
add(chunks.loadAll("putarin-latest"));
for (const f of fs.readdirSync("data")) {
  if (!f.endsWith(".json") || /^(videos-latest|putarin-latest|latest-posters|thumb-health|host-counts)/.test(f)) continue;
  try {
    add(JSON.parse(fs.readFileSync(`data/${f}`, "utf8")));
  } catch {
    /* not a list */
  }
}

const today = new Date().toISOString().slice(0, 10);
const sum = summarize([...byId.values()], today);
let prev = {};
try {
  prev = JSON.parse(fs.readFileSync(STATE, "utf8")).counts || {};
} catch {
  prev = {};
}

const dead = [];
for (const [family, hosts] of Object.entries(sum.topHosts)) {
  for (const host of hosts) {
    try {
      await dns.lookup(host);
    } catch (err) {
      // Re-check with a public resolver view before calling it dead (runner DNS hiccups).
      try {
        const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`, { signal: AbortSignal.timeout(8000) });
        const j = await r.json();
        if (j.Status === 0 && (j.Answer || []).length) continue;
      } catch {
        /* keep the first error */
      }
      dead.push({ family, host, error: err?.code || "dns" });
    }
  }
}

const alerts = hostAlerts(sum, prev, dead);
fs.writeFileSync(STATE, JSON.stringify({ date: today, counts: sum.counts, recent3d: sum.recent, topHosts: sum.topHosts }, null, 2) + "\n");
console.log(JSON.stringify({ counts: sum.counts, recent3d: sum.recent, prev, dead, alerts }, null, 1));

if (alerts.length) {
  fs.writeFileSync("host-alerts.txt", alerts.join("\n") + "\n");
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  if (token) {
    try {
      const res = await fetch("https://koleksidrpinguin.com/api/owner-tools", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ action: "host-alert", lines: alerts }),
        signal: AbortSignal.timeout(20000),
      });
      console.log("telegram alert:", res.status);
    } catch (err) {
      console.log("telegram alert failed:", err?.message || err);
    }
  }
}
