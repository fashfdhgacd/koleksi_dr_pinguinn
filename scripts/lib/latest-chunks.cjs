// Chunk-aware reader/writer for chunked feeds in data/ (videos-latest, putarin-latest) for
// workflows and scripts. Follows the naming contract in src/lib/catalog/chunk-contract.js:
//   <feed>.json = chunk 1, <feed>-pNN.json = later chunks, <feed>-index.json = ordered list.
// Order follows the index; chunk files on disk that the index misses are appended by number,
// so a stale index never hides videos. Items keep object identity with their chunk, so callers
// can mutate items from `items` and then call saveChunks() to write back only changed chunks.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

function chunkNumber(file) {
  const name = path.basename(String(file || ""));
  if (/-index\.json$/i.test(name) || !/\.json$/i.test(name)) return 0;
  const m = /-p(\d+)\.json$/i.exec(name);
  return m ? Number(m[1]) : 1;
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return undefined;
  }
}

/** @param {string} base e.g. "videos-latest" @param {string} [dir] */
function chunkFiles(base, dir = "data") {
  const idx = readJson(path.join(dir, `${base}-index.json`));
  const listed = (Array.isArray(idx) ? idx : Array.isArray(idx && idx.parts) ? idx.parts : [])
    .map((p) => path.basename(String(p || "")))
    .filter(Boolean);
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:-p\\d+)?\\.json$`, "i");
  let onDisk = [];
  try {
    onDisk = fs.readdirSync(dir).filter((f) => re.test(f));
  } catch {}
  const order = [];
  for (const f of listed) if (onDisk.includes(f) && !order.includes(f)) order.push(f);
  for (const f of onDisk.filter((f) => !order.includes(f)).sort((a, b) => chunkNumber(a) - chunkNumber(b))) order.push(f);
  return order.map((f) => path.join(dir, f));
}

/**
 * @param {string} base @param {string} [dir]
 * @returns {{ items: any[], chunks: { file: string, items: any[], raw: string }[] }}
 */
function loadChunks(base, dir = "data") {
  const chunks = [];
  for (const file of chunkFiles(base, dir)) {
    let raw = "";
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    let items;
    try {
      items = JSON.parse(raw);
    } catch {
      console.log(`WARN ${file}: invalid JSON, skipped (left untouched)`);
      continue;
    }
    if (!Array.isArray(items)) {
      console.log(`WARN ${file}: not a list, skipped (left untouched)`);
      continue;
    }
    chunks.push({ file, items, raw });
  }
  return { items: chunks.flatMap((c) => c.items), chunks };
}

/** Write back chunks whose content changed (2-space JSON + newline, same as the bot). Never writes an empty chunk over a non-empty one. Returns changed file paths. */
function saveChunks(loaded) {
  const changed = [];
  for (const c of loaded.chunks) {
    if (!c.items.length) continue;
    const body = JSON.stringify(c.items, null, 2) + "\n";
    if (body === c.raw) continue;
    fs.writeFileSync(c.file, body);
    c.raw = body;
    changed.push(c.file);
  }
  return changed;
}

/** Plain list of every video in a chunked feed (read-only convenience). */
function loadAll(base, dir = "data") {
  return loadChunks(base, dir).items;
}

module.exports = { chunkFiles, loadChunks, saveChunks, loadAll, chunkNumber };
