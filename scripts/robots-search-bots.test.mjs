import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("robots.txt allows major search crawlers and lists the sitemap", () => {
  const robots = readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");
  for (const agent of [
    "Googlebot",
    "Bingbot",
    "Slurp",
    "DuckDuckBot",
    "Yandex",
    "Bravebot",
    "Applebot",
    "MojeekBot",
    "SeznamBot",
    "Yeti",
  ]) {
    assert.match(robots, new RegExp(`^User-agent: ${agent}$`, "m"), `missing ${agent}`);
  }
  assert.match(robots, /^Sitemap: https:\/\/koleksidrpinguin\.com\/sitemap\.xml$/m);
  // Training-only Apple crawler stays blocked in the Cloudflare-managed block, not this file.
  assert.doesNotMatch(robots, /^User-agent: Applebot-Extended$/m);
});
