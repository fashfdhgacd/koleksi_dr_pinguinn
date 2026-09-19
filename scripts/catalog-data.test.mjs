import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

test("bundled videos.json is a large unique catalog", () => {
  const raw = loadJson("src/lib/catalog/videos.json");
  const items = Array.isArray(raw) ? raw : raw.items || raw.videos || [];
  assert.ok(items.length > 1000, `expected 1000+ items, got ${items.length}`);
  const ids = items.map((item) => item.id || item.file_id || item.embed);
  const unique = new Set(ids.filter(Boolean));
  assert.ok(unique.size > 1000);
  const missingTitle = items.filter((item) => !String(item.title || "").trim()).length;
  assert.ok(missingTitle < items.length * 0.2);
});

test("streamtape.json and posters.json are valid JSON objects/arrays", () => {
  const tape = loadJson("src/lib/catalog/streamtape.json");
  const posters = loadJson("src/lib/catalog/posters.json");
  assert.ok(tape);
  assert.ok(posters);
  const tapeCount = Array.isArray(tape) ? tape.length : Object.keys(tape).length;
  const posterCount = Array.isArray(posters) ? posters.length : Object.keys(posters).length;
  assert.ok(tapeCount > 0);
  assert.ok(posterCount > 100);
});

test("gitignore keeps env files out except .env.example", () => {
  const gi = readFileSync(join(root, ".gitignore"), "utf8");
  assert.match(gi, /^\.env$/m);
  assert.match(gi, /^\.env\.\*$/m);
  assert.match(gi, /^!\.env\.example$/m);
  assert.match(gi, /^node_modules$/m);
});
