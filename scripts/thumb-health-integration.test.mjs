import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

const runner = `
  import { createServer } from "vite";
  import { join } from "node:path";
  const root = process.cwd();
  process.chdir(process.env.THUMB_TEST_DIR);
  const calls = [];
  const repaired = new Set();
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const id = url.pathname.split("/").pop();
    calls.push({ host: url.hostname, id });
    if (url.hostname === "img.koleksidrpinguin.com") {
      if (process.env.THUMB_TEST_SCENARIO === "challenge") {
        return new Response(null, { status: 403, headers: { "cf-mitigated": "challenge" } });
      }
      if (process.env.THUMB_TEST_SCENARIO === "small-error") {
        if (id === "badget" && init.method !== "HEAD") return new Response(null, { status: 403 });
        const length = id === "badget" ? "5000" : "30000";
        return new Response(null, { status: 200, headers: { "content-type": "image/jpeg", "content-length": length } });
      }
      if (repaired.has(id)) {
        return new Response(null, { status: 200, headers: { "content-type": "image/jpeg", "content-length": "30000" } });
      }
      return new Response(null, { status: 404 });
    }
    if (url.hostname === "koleksidrpinguin.com") {
      if (process.env.THUMB_TEST_SCENARIO === "repair-challenge") {
        return new Response(null, { status: 403, headers: { "cf-mitigated": "challenge" } });
      }
      if (id === "fallback") return new Response(null, { status: 302, headers: { "x-thumb-fallback": "1" } });
      if (id === "failed") return new Response(null, { status: 403 });
      if (id === "repaired") {
        repaired.add(id);
        return new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } });
      }
      throw new Error("unexpected repair: " + id);
    }
    throw new Error("unexpected host: " + url.hostname);
  };
  const vite = await createServer({
    root,
    configFile: false,
    appType: "custom",
    logLevel: "error",
    resolve: { alias: { "@": join(root, "src") } },
    server: { middlewareMode: true },
  });
  try {
    await vite.ssrLoadModule("/scripts/thumb-health.mts");
  } finally {
    await vite.close();
  }
  console.log("TEST_CALLS=" + JSON.stringify(calls));
`;

function fixture(ids) {
  const dir = mkdtempSync(join(tmpdir(), "thumb-health-test-"));
  mkdirSync(join(dir, "data"), { recursive: true });
  mkdirSync(join(dir, "src/lib/catalog"), { recursive: true });
  const videos = ids.map((id) => ({
    id,
    title: "Test video",
    source: "IndoAV",
    embed: `https://example.test/e/${id}`,
  }));
  const posters = Object.fromEntries(ids.map((id) => [id, "https://example.test/poster.jpg"]));
  writeFileSync(join(dir, "data/videos-latest.json"), JSON.stringify(videos));
  writeFileSync(join(dir, "data/putarin-latest.json"), "[]");
  writeFileSync(join(dir, "data/latest-posters.json"), JSON.stringify(posters));
  writeFileSync(join(dir, "data/thumb-health.json"), '{"previous":"report"}\n');
  for (const name of ["posters", "jav-posters", "overrides"]) {
    writeFileSync(join(dir, `src/lib/catalog/${name}.json`), "{}");
  }
  return dir;
}

function run(dir, scenario, repairCap = "600") {
  return spawnSync(process.execPath, ["--input-type=module", "-e", runner], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
    env: {
      ...process.env,
      DRY_RUN: "0",
      REPAIR_CAP: repairCap,
      THUMB_TEST_DIR: dir,
      THUMB_TEST_SCENARIO: scenario,
    },
  });
}

for (const scenario of ["challenge", "repair-challenge"]) {
  test(`a ${scenario} stops the scan without overwriting the previous report or poster map`, () => {
    const dir = fixture(Array.from({ length: 20 }, (_, i) => `sample${i}`));
    try {
      const posters = readFileSync(join(dir, "data/latest-posters.json"), "utf8");
      const result = run(dir, scenario);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /stopped by a Cloudflare challenge/);
      assert.equal(readFileSync(join(dir, "data/thumb-health.json"), "utf8"), '{"previous":"report"}\n');
      assert.equal(readFileSync(join(dir, "data/latest-posters.json"), "utf8"), posters);
      const calls = JSON.parse(result.stdout.match(/TEST_CALLS=(.*)/)?.[1] || "null");
      assert.ok(Array.isArray(calls) && calls.length > 0 && calls.length <= 20);
      if (scenario === "challenge") {
        assert.ok(calls.length <= 10);
        assert.ok(calls.every((call) => call.host === "img.koleksidrpinguin.com"));
      } else {
        assert.ok(calls.some((call) => call.host === "koleksidrpinguin.com"));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("repair errors, unresolved posters, completed repairs and deferred work are counted separately", () => {
  const dir = fixture(["fallback", "failed", "repaired", "deferred"]);
  try {
    const result = run(dir, "outcomes", "3");
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(join(dir, "data/thumb-health.json"), "utf8"));
    assert.equal(report.partial, false);
    assert.equal(report.checked, 4);
    assert.equal(report.totals.absent, 4);
    assert.equal(report.totals.repaired, 1);
    assert.equal(report.totals.stillBad, 1);
    assert.equal(report.totals.repairError, 1);
    assert.equal(report.totals.repairDeferred, 1);
    assert.match(report.repairErrorSamples[0].why, /HTTP 403/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failed GET after a successful R2 HEAD is a check error, not a healthy image", () => {
  const dir = fixture(["badget", "goodhead"]);
  try {
    const result = run(dir, "small-error");
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(join(dir, "data/thumb-health.json"), "utf8"));
    assert.equal(report.totals.ok, 1);
    assert.equal(report.totals.error, 1);
    assert.equal(report.totals.stillBad, 0);
    assert.match(report.errorSamples[0].why, /GET HTTP 403/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
