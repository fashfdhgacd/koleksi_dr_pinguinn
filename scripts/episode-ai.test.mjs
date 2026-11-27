// Owner rule 2026-11-28: an upload whose title has the word "Episode" belongs to AI Drama (/kategori/ai-plus),
// also on his own hosts (Lulu / Dood / Byse / MXDrop / Vidara), which otherwise land in /kategori/bokep.
// Older own-host rows stored as "bokep" stay where they are. Runs the real modules through Vite's SSR loader.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let vite;
let series, shared, cache, handler;

before(async () => {
  vite = await createServer({
    root,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": path.join(root, "src") } },
  });
  series = await vite.ssrLoadModule("/src/lib/catalog/series.ts");
  shared = await vite.ssrLoadModule("/src/lib/catalog/local-shared.ts");
  cache = await vite.ssrLoadModule("/src/lib/catalog/local-cache.ts");
  handler = await vite.ssrLoadModule("/src/lib/bot/upload-handler.js");
});
after(async () => {
  await vite?.close();
});

const byse = (id, title, category) => ({
  id: `by-${id}`,
  title,
  embed: `https://bysejikuar.com/e/${id}`,
  direct: `https://bysejikuar.com/e/${id}`,
  source: "Byse",
  category,
});

describe("Episode title -> AI Drama", () => {
  it("matches the whole word Episode in any case", () => {
    for (const t of ["Ntr di Tempat Kerja Episode 1", "EPISODE 5 Ibu Mengapa", "Pengemar Cocopie Episode (9)", "Toko Liji Li Episode 4 . mp4"]) {
      assert.equal(series.hasEpisodeWord(t), true, t);
    }
    for (const t of ["Vaginaku Penuh Seperma Kental", "Episodes of life", "TerakotaEpisode 2", "Eps 3 Tante", ""]) {
      assert.equal(series.hasEpisodeWord(t), false, t);
    }
  });

  it("bot stores own-host uploads with Episode as ai-plus, the rest as bokep", () => {
    assert.equal(handler.drpUploadCategory("Ntr di Tempat Kerja Episode 1"), "ai-plus");
    assert.equal(handler.drpUploadCategory("Pengemar Cocopie Episode (9)"), "ai-plus");
    assert.equal(handler.drpUploadCategory("Vaginaku Penuh Seperma Kental"), "bokep");
  });

  it("catalog follows the stored category: ai-plus + Episode -> AI Drama; old bokep rows stay", () => {
    assert.equal(shared.slugOf(byse("aaa111", "Ntr di Tempat Kerja Episode 1 - koleksidrpinguin.com", "ai-plus")), "ai-plus");
    assert.equal(shared.slugOf(byse("aaa112", "Ntr di Tempat Kerja Episode 1 - koleksidrpinguin.com", "bokep")), "bokep");
    assert.equal(shared.slugOf(byse("aaa113", "Vaginaku Penuh Seperma Kental - koleksidrpinguin.com", "ai-plus")), "bokep");
    const slugs = cache.catalogSlugs(byse("aaa114", "Pengemar Cocopie Episode (9) - koleksidrpinguin.com", "ai-plus"), new Set());
    assert.ok(slugs.includes("ai-plus"), slugs.join(","));
    assert.ok(!slugs.includes("bokep"), slugs.join(","));
  });

  it("tonight's misfiled Episode uploads (2026-11-28 batch) are in AI Drama in the bundled data", async () => {
    const { default: rows } = await vite.ssrLoadModule("/data/videos-latest.json");
    const hit = rows.filter((r) => /^by-(1kxph18srhuo|rn61otvrpxrv)$/.test(r.id));
    assert.equal(hit.length, 2);
    for (const r of hit) assert.equal(shared.slugOf(r), "ai-plus", r.id);
  });
});
