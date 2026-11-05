import assert from "node:assert/strict";
import { test } from "node:test";
import { attemptThumbRepair, isCloudflareChallenge, poolUntil } from "./lib/thumb-health-http.mjs";

const options = {
  id: "sample-id",
  site: "https://example.test",
  day: "2026-11-05",
  headers: { "user-agent": "thumb-health-test" },
};

function response(status, headers = {}) {
  return new Response(null, { status, headers });
}

test("a repair is counted only after an image response and successful R2 verification", async () => {
  let checked = 0;
  const result = await attemptThumbRepair({
    ...options,
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://example.test/thumb/sample-id?h=2026-11-05");
      assert.equal(init.redirect, "manual");
      assert.deepEqual(init.headers, options.headers);
      return response(200, { "content-type": "image/jpeg" });
    },
    verify: async () => {
      checked++;
      return "ok";
    },
  });
  assert.equal(result.state, "repaired");
  assert.equal(checked, 1);
});

test("a known fallback is unresolved, but other redirects and failures are errors", async () => {
  for (const [res, expected] of [
    [response(302, { "x-thumb-fallback": "1" }), "unresolved"],
    [response(302, { location: "https://example.test/" }), "error"],
    [response(403), "error"],
    [response(503), "error"],
    [response(200, { "content-type": "text/html" }), "error"],
  ]) {
    const result = await attemptThumbRepair({
      ...options,
      fetchImpl: async () => res,
      verify: async () => {
        assert.fail("verification must not run");
      },
    });
    assert.equal(result.state, expected);
    assert.ok(result.reason);
  }
});

test("Cloudflare challenges are distinct from broken posters", async () => {
  const challenge = new Response(
    new ReadableStream({ cancel: () => { throw new Error("cancel failed"); } }),
    { status: 403, headers: { "cf-mitigated": "challenge" } },
  );
  assert.equal(isCloudflareChallenge(challenge), true);
  assert.equal(isCloudflareChallenge(response(403)), false);
  const result = await attemptThumbRepair({
    ...options,
    fetchImpl: async () => challenge,
    verify: async () => {
      assert.fail("verification must not run");
    },
  });
  assert.equal(result.state, "challenge");
  assert.match(result.reason, /Cloudflare challenge/);
});

test("failed verification and transport errors are not counted as broken posters", async () => {
  for (const [verdict, expected] of [
    ["error", "error"],
    ["absent", "unresolved"],
    ["placeholder", "unresolved"],
  ]) {
    const result = await attemptThumbRepair({
      ...options,
      fetchImpl: async () => response(200, { "content-type": "image/webp" }),
      verify: async () => verdict,
    });
    assert.equal(result.state, expected);
    assert.ok(result.reason);
  }
  const result = await attemptThumbRepair({
    ...options,
    fetchImpl: async () => {
      throw new TypeError("fetch failed");
    },
    verify: async () => "ok",
  });
  assert.equal(result.state, "error");
  assert.match(result.reason, /fetch failed/);
});

test("the work pool stops scheduling more items once a challenge is detected", async () => {
  const seen = [];
  let stopped = false;
  await poolUntil(
    [1, 2, 3, 4],
    2,
    async (item) => {
      seen.push(item);
      stopped = true;
    },
    () => stopped,
  );
  assert.deepEqual(seen, [1]);
});
