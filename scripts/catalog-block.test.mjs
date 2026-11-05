import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  blockedIdSet,
  isBlockedId,
  normalizeBlockState,
  removalPlan,
  singleRemoveId,
  titleSlug,
  withoutBlocked,
} from "../src/lib/catalog/catalog-block.js";

test("block state keeps only real ids", () => {
  const state = normalizeBlockState({ ids: { good_id: { at: 5 }, "no": { at: 1 }, "has space": { at: 1 } } });
  assert.deepEqual(Object.keys(state.ids), ["good_id"]);
  assert.equal(state.ids.good_id.at, 5);
});

test("withoutBlocked drops the id from a data-file list", () => {
  const blocked = blockedIdSet({ ids: { abc123: { at: 1 } } });
  const items = [{ id: "abc123", title: "A" }, { id: "keep01", title: "B" }, { id: "ABC123", title: "C" }];
  assert.deepEqual(withoutBlocked(items, blocked).map((it) => it.id), ["keep01"]);
  assert.equal(isBlockedId("abc123", blocked), true);
  assert.equal(isBlockedId("keep01", blocked), false);
});

test("one id only — bulk and the locked set are refused", () => {
  assert.equal(singleRemoveId({ id: "video1" }).id, "video1");
  assert.equal(singleRemoveId({ ids: ["a", "b"] }).error, "no_bulk");
  assert.equal(singleRemoveId({ id: ["a", "b"] }).error, "no_bulk");
  assert.equal(singleRemoveId({ id: "a,b" }).error, "no_bulk");
  assert.equal(singleRemoveId({ all: true, id: "video1" }).error, "no_bulk");
  assert.equal(singleRemoveId({ id: "ab" }).error, "bad_id");
});

test("removal plan is 410 when the video exists and 404 when it does not", () => {
  assert.equal(removalPlan("video1", true).watch, 410);
  assert.equal(removalPlan("video1", false).watch, 404);
  assert.ok(removalPlan("video1", true).surfaces.includes("sitemap"));
  assert.ok(removalPlan("video1", true).surfaces.includes("data-files"));
});

test("title slug is searchable", () => {
  assert.equal(titleSlug("Judul Video Baru!"), "judul-video-baru");
});

test("owner delete is behind the existing owner check and is not a bulk action", () => {
  const tools = fs.readFileSync(new URL("../src/routes/api/owner-tools.ts", import.meta.url), "utf8");
  const auth = tools.indexOf("isOwnerRequest");
  const action = tools.indexOf('body.action === "catalog-remove"');
  assert.ok(auth > 0 && action > auth);
  assert.match(tools, /singleRemoveId/);
  assert.match(tools, /dryRun/);
  assert.match(tools, /addCatalogBlocked/);
});

test("catalog build and watch treat a blocked id as gone", () => {
  const src = fs.readFileSync(new URL("../src/lib/catalog/local-cache.ts", import.meta.url), "utf8");
  assert.match(src, /withoutBlocked\(items, BLOCKED\)/);
  assert.match(src, /isBlockedId\(key, BLOCKED\)/);
  assert.match(src, /isBlockedId\(it\?\.id, BLOCKED\)/);
});

test("ingest and daily sync skip the blocklist", () => {
  const ingest = fs.readFileSync(new URL("../src/lib/bot/github.js", import.meta.url), "utf8");
  const sync = fs.readFileSync(new URL("../.github/workflows/daily-video-sync.yml", import.meta.url), "utf8");
  assert.match(ingest, /blockedIdsForIngest/);
  assert.match(sync, /catalog-block\.cjs/);
  assert.match(sync, /isBlocked/);
});

test("blocklist file is the moderation store and adds no worker env", () => {
  const store = fs.readFileSync(new URL("../src/lib/catalog/catalog-block-store.ts", import.meta.url), "utf8");
  const wrangler = fs.readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(store, /owner:catalog-block:v1/);
  assert.match(store, /kv\.put/);
  assert.doesNotMatch(store, /process\.env\.[A-Z0-9_]*BLOCK/);
  assert.doesNotMatch(wrangler, /catalog-block/i);
});
