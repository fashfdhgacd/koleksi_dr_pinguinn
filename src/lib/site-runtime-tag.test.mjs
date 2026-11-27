/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck test doubles for Cache / fetch
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TAG_UPSTREAM_URL,
  RUNTIME_TAG_PATH,
  TAG_TTL_S,
  TAG_FAIL_TTL_S,
  getRuntimeTag,
  runtimeTagResponse,
  resetTagMemo,
} from "./site-runtime-tag.js";

/** Minimal Cache API stand-in keyed by URL. */
function memCache() {
  const m = new Map();
  return {
    m,
    async match(req) {
      const hit = m.get(req.url);
      return hit ? hit.clone() : undefined;
    },
    async put(req, res) {
      m.set(req.url, res.clone());
    },
  };
}

function fetcher(responses) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  fn.calls = calls;
  return fn;
}

test("upstream URL carries pubid, sids, output=js and im=inline", () => {
  const u = new URL(TAG_UPSTREAM_URL);
  assert.equal(u.searchParams.get("v"), "1");
  assert.equal(u.searchParams.get("pubid"), "0SB9Y04YAH7RE");
  assert.equal(u.searchParams.get("sids"), "0SBV0CWY9FC1A");
  assert.equal(u.searchParams.get("output"), "js");
  assert.equal(u.searchParams.get("im"), "inline");
});

test("public path is neutral, outside /assets/, and matches the page constant", () => {
  assert.ok(!/wynq|rapidfire|adblock|aab|abl|\bads?\b|ad[-_./]/i.test(RUNTIME_TAG_PATH), RUNTIME_TAG_PATH);
  assert.ok(!RUNTIME_TAG_PATH.startsWith("/assets/"));
  const gridAds = readFileSync(new URL("./grid-ads.ts", import.meta.url), "utf8");
  assert.match(gridAds, new RegExp(`SITE_RUNTIME_SRC = "${RUNTIME_TAG_PATH.replace(/[.]/g, "\\.")}"`));
  assert.doesNotMatch(gridAds, /rapidfire\.cc\/s\.js/);
});

test("fetches once, then serves memo / Cache API within the TTL, keyed by the full URL", async () => {
  resetTagMemo();
  let t = 1_000_000;
  const cache = memCache();
  const f = fetcher([new Response("js-v1", { status: 200 }), new Response("js-v2", { status: 200 })]);
  assert.equal(await getRuntimeTag({ fetchImpl: f, cache, now: () => t }), "js-v1");
  assert.ok(cache.m.has(TAG_UPSTREAM_URL));
  t += (TAG_TTL_S - 1) * 1000;
  assert.equal(await getRuntimeTag({ fetchImpl: f, cache, now: () => t }), "js-v1");
  // A new isolate (memo gone) reads the shared cache instead of refetching.
  resetTagMemo();
  assert.equal(await getRuntimeTag({ fetchImpl: f, cache, now: () => t }), "js-v1");
  assert.equal(f.calls.length, 1);
  // After the TTL it refetches.
  t += 2000;
  assert.equal(await getRuntimeTag({ fetchImpl: f, cache, now: () => t }), "js-v2");
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0], TAG_UPSTREAM_URL);
});

test("fails open: error, non-200 or empty body gives an empty script with a short cache", async () => {
  for (const bad of [new Error("network"), new Response("nope", { status: 500 }), new Response("   ", { status: 200 })]) {
    resetTagMemo();
    const f = fetcher([bad]);
    const res = await runtimeTagResponse({ fetchImpl: f, cache: memCache(), now: () => 5 });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "");
    assert.equal(res.headers.get("cache-control"), `public, max-age=${TAG_FAIL_TTL_S}`);
    assert.match(res.headers.get("content-type"), /javascript/);
  }
});

test("good response is served as JS with a ~5 min cache", async () => {
  resetTagMemo();
  const res = await runtimeTagResponse({ fetchImpl: fetcher([new Response("(function(){})()", { status: 200 })]), cache: null, now: () => 1 });
  assert.equal(await res.text(), "(function(){})()");
  assert.equal(res.headers.get("cache-control"), `public, max-age=${TAG_TTL_S}`);
  assert.equal(TAG_TTL_S, 300);
});
