import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANTI_BLOKIR_ORIGIN,
  canonicalWatchUrl,
  isAntiBlokirShareUrl,
  shareIntentUrls,
  videoShareUrl,
} from "./share-url.ts";

describe("video share URLs", () => {
  it("prefers the anti-blokir front door", () => {
    const url = videoShareUrl("abc 1");
    assert.equal(url, `${ANTI_BLOKIR_ORIGIN}/v/abc%201`);
    assert.equal(canonicalWatchUrl("abc 1"), "https://koleksidrpinguin.com/watch/abc%201");
  });

  it("falls back to the canonical watch URL when the front door is unset", () => {
    assert.equal(videoShareUrl("xyz", null), "https://koleksidrpinguin.com/watch/xyz");
    assert.equal(videoShareUrl("xyz", ""), "https://koleksidrpinguin.com/watch/xyz");
  });

  it("builds plain share-intent links and hides WhatsApp unless the URL is the front door", () => {
    const front = videoShareUrl("vid1");
    const viaFront = shareIntentUrls("Judul", front);
    assert.match(viaFront.telegram, /^https:\/\/t\.me\/share\/url\?/);
    assert.ok(viaFront.telegram.includes(encodeURIComponent(front)));
    assert.match(viaFront.x, /^https:\/\/twitter\.com\/intent\/tweet\?/);
    assert.match(viaFront.reddit, /^https:\/\/www\.reddit\.com\/submit\?/);
    assert.ok(viaFront.whatsapp && viaFront.whatsapp.startsWith("https://wa.me/"));
    assert.ok(isAntiBlokirShareUrl(front));

    const canonical = canonicalWatchUrl("vid1");
    const viaMain = shareIntentUrls("Judul", canonical);
    assert.equal(viaMain.whatsapp, null);
    assert.equal(isAntiBlokirShareUrl(canonical), false);
  });
});
