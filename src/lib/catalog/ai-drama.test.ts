import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasEpisodeMarker } from "./series.ts";
import { findCategory } from "./categories.ts";

describe("AI Drama category", () => {
  it("keeps the /kategori/ai-plus slug and shows the AI Drama label", () => {
    const cat = findCategory("ai-plus");
    assert.equal(cat?.slug, "ai-plus");
    assert.equal(cat?.label, "AI Drama");
    assert.equal(findCategory("AI+")?.slug, "ai-plus");
    assert.equal(findCategory("AI Drama")?.slug, "ai-plus");
    assert.equal(findCategory("ai-drama")?.slug, "ai-plus");
    assert.equal(findCategory("ai-indo")?.slug, "ai-indo");
    assert.equal(findCategory("ai-indo")?.label, "AI Drama Indo");
  });

  it("treats episode-marked titles as AI Drama candidates and leaves the rest out", () => {
    assert.equal(hasEpisodeMarker("Hubungan suami istri yang sangat kuat Episode 2 - koleksidrpinguin.com"), true);
    assert.equal(hasEpisodeMarker("第6集 在线播放 啪啪 - koleksidrpinguin.com"), true);
    assert.equal(hasEpisodeMarker("Campur Y6XxXjZ3lrSvAmR"), false);
    assert.equal(hasEpisodeMarker("Brondong Muasin Tante STW"), false);
    assert.equal(hasEpisodeMarker("Bokep Indo Andini Viral Di Ewe Ber Gilir (Koleksi Dr. Pinguin Bokep, M.S.B.) AI"), false);
  });
});
