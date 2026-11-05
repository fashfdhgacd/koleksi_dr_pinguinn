"use strict";
/**
 * Blocklist reader for GitHub Actions sync (no KV, no Worker env).
 * Same file the site bundles: src/lib/catalog/catalog-blocklist.json.
 */
const fs = require("node:fs");
const path = require("node:path");

function loadBlocked(root = process.cwd()) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, "src/lib/catalog/catalog-blocklist.json"), "utf8"));
    const ids = raw && raw.ids && typeof raw.ids === "object" && !Array.isArray(raw.ids) ? Object.keys(raw.ids) : [];
    return new Set(ids.map((id) => String(id).trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function isBlocked(id, set) {
  const s = String(id || "").trim();
  if (!s || !set) return false;
  return set.has(s);
}

module.exports = { loadBlocked, isBlocked };
