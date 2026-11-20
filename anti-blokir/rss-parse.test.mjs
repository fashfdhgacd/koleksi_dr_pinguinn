import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("./_worker.js", import.meta.url)), "utf8");

describe("anti-blokir worker source", () => {
  it("noindexes pages and canonicalizes to the main site", () => {
    assert.match(src, /noindex, follow/);
    assert.match(src, /koleksidrpinguin\.com/);
    assert.match(src, /Anti Blokir \/ tanpa VPN/);
    assert.match(src, /rss\.xml/);
    assert.doesNotMatch(src, /TRAFFICSTARS|REFRESH_TOKEN|CLOUDFLARE_API_TOKEN/i);
  });
});
