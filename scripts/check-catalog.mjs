// Build guard: fail the build (so Workers Builds keeps the previous deploy live) when a bundled
// catalog feed shrinks sharply versus data/catalog-baseline.json, a file is not valid JSON, or a
// chunk listed in a *-index.json is missing / not covered by the loader contract.
// Raise the baseline by running: node scripts/check-catalog.mjs --update-baseline
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHUNKED_FEEDS,
  chunkNumber,
  feedBase,
  indexFileName,
  indexParts,
  isIndexFile,
} from "../src/lib/catalog/chunk-contract.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
const baselinePath = join(dataDir, "catalog-baseline.json");
const MAX_DROP = 0.1;
const errors = [];

function readJson(rel) {
  try {
    return JSON.parse(readFileSync(join(root, rel), "utf8"));
  } catch (e) {
    errors.push(`${rel}: invalid JSON (${e instanceof Error ? e.message : e})`);
    return null;
  }
}
function countList(v) {
  return Array.isArray(v) ? v.filter((x) => x && typeof x === "object").length : 0;
}

const counts = {};
const files = readdirSync(dataDir).filter((f) => f.endsWith(".json"));

for (const base of CHUNKED_FEEDS) {
  const chunks = files.filter((f) => feedBase(f) === base && chunkNumber(f) > 0);
  let total = 0;
  for (const f of chunks) {
    const v = readJson(`data/${f}`);
    if (v !== null && !Array.isArray(v)) errors.push(`data/${f}: expected a list`);
    total += countList(v);
  }
  const idxName = indexFileName(base);
  if (files.includes(idxName)) {
    const idx = readJson(`data/${idxName}`);
    for (const part of indexParts(idx)) {
      if (!chunks.includes(part)) errors.push(`data/${idxName} lists ${part}, which does not exist`);
    }
  }
  counts[base] = total;
}

// Any chunked feed the loader does not know about would be silently dropped.
for (const f of files) {
  const base = feedBase(f);
  const chunked = isIndexFile(f) || /-p\d+\.json$/i.test(f);
  if (chunked && !CHUNKED_FEEDS.includes(base)) {
    errors.push(`data/${f}: feed "${base}" is chunked but not in CHUNKED_FEEDS (src/lib/catalog/chunk-contract.js)`);
  }
}

// The site must load chunked feeds through mergeChunks (glob), never by importing one chunk file.
for (const rel of ["src/lib/catalog/local-cache.ts", "src/routes/api/owner-recent.ts"]) {
  const src = existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : "";
  for (const base of CHUNKED_FEEDS) {
    if (new RegExp(`from\\s+["'][./]*data/${base}\\.json["']`).test(src)) {
      errors.push(`${rel} imports data/${base}.json directly; use mergeChunks so every chunk loads`);
    }
  }
}

for (const rel of ["data/drp-bokep.json", "src/lib/catalog/videos.json"]) {
  counts[rel.replace(/^.*\//, "").replace(/\.json$/, "")] = countList(readJson(rel));
}
counts.total = Object.values(counts).reduce((a, b) => a + b, 0);

if (process.argv.includes("--update-baseline")) {
  if (errors.length) {
    console.error("[check-catalog] refusing to update baseline:\n  " + errors.join("\n  "));
    process.exit(1);
  }
  writeFileSync(baselinePath, JSON.stringify(counts, null, 2) + "\n");
  console.log("[check-catalog] baseline updated", counts);
  process.exit(0);
}

if (existsSync(baselinePath)) {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  for (const [key, before] of Object.entries(baseline)) {
    const now = counts[key] ?? 0;
    if (before > 0 && now < before * (1 - MAX_DROP)) {
      errors.push(`${key}: ${now} items, baseline ${before} (drop over ${MAX_DROP * 100}%)`);
    }
  }
} else {
  errors.push("data/catalog-baseline.json missing");
}

if (errors.length) {
  console.error("[check-catalog] FAILED, build stopped so the live deploy stays:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log("[check-catalog] ok", counts);
