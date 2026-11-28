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

describe("Gay content wins over Episode -> AI Drama", () => {
  it("bot stores own-host gay titles as ai-gay, even when the title has Episode", () => {
    assert.equal(handler.drpUploadCategory("Fuck to the Clouds Episode 1 gay"), "ai-gay");
    assert.equal(
      handler.drpUploadCategory("Berkat Pejabat Surga Disiplin Berlutut Sang Jenderal ( Koleksi Dr. Boy Friend TV, G. Y. B.) Episode 1"),
      "ai-gay",
    );
    assert.equal(
      handler.drpUploadCategory("Rahasia di Departemen Seni Rupa ( Koleksi Dr. Boy Friend TV, G. Y. B.)"),
      "ai-gay",
    );
    assert.equal(handler.drpUploadCategory("Perjalanan Bisnis Ayah Episode 3", "ai-gay"), "ai-gay");
  });

  it("gaya is not a gay cue, so Episode still goes to AI Drama and plain titles to bokep", () => {
    assert.equal(handler.drpUploadCategory("Belajar Gaya Wot Episode 1"), "ai-plus");
    assert.equal(handler.drpUploadCategory("Percakapan Kontol Hitam Bengkok Maunya Ngewe Gaya Gendong"), "bokep");
    assert.equal(handler.drpUploadCategory("Ntr di Tempat Kerja Episode 1"), "ai-plus");
  });

  it("catalog primary slug is ai-gay for gay titles, even if the stored row is still bokep or ai-plus", () => {
    const title = "Fuck to the Clouds Episode 1 gay - koleksidrpinguin.com";
    assert.equal(shared.slugOf(byse("gay111", title, "bokep")), "ai-gay");
    assert.equal(shared.slugOf(byse("gay112", title, "ai-plus")), "ai-gay");
    assert.equal(shared.slugOf(byse("gay113", title, "ai-gay")), "ai-gay");
    const slugs = cache.catalogSlugs(byse("gay114", title, "bokep"), new Set());
    assert.deepEqual(slugs, ["ai-gay"], slugs.join(","));
  });

  it("older own-host Episode rows stored as bokep stay in bokep when the title is not gay", () => {
    assert.equal(shared.slugOf(byse("old111", "Perangkap Tentara Terakota Episode 2 - koleksidrpinguin.com", "bokep")), "bokep");
    assert.equal(shared.isDrpAiEpisode(byse("old112", "Ntr di Tempat Kerja Episode 1 - koleksidrpinguin.com", "bokep")), false);
  });

  it("the 47 recently miscategorized own-host gay uploads now sit in AI GAY in the bundled data", async () => {
    const latest = (await vite.ssrLoadModule("/data/videos-latest.json")).default;
    const p04 = (await vite.ssrLoadModule("/data/videos-latest-p04.json")).default;
    const ids = new Set([
      // 2026-11-16: Fuck to the Clouds + Berkat Pejabat, 5 own-host copies (Byse missing one episode)
      "by-4wjukwop1ry9", "by-5jjx1fxuwnvg", "by-82k9xy7ivlb5", "by-ck81eauegki5",
      "by-fax8e3fx1tmj", "by-nc5o4lmlcxyd", "by-s4ahmpuihkch",
      "dd-82h3ioah6n95", "dd-blf4hzjx35wi", "dd-cx27be2jokrr", "dd-lpdpt065x9o7",
      "dd-r66aia19x8s5", "dd-wdjzdnkzbvad", "dd-z6axezdi7ca2", "dd-zosv6k58avvg",
      "g18aer20", "g1m0ndnp", "g1v6vni1", "gfb205s", "goowkp9", "gx2rejh", "gygwm8n", "gzycapl",
      "mx-9wwwl9v6b3zmzpn", "mx-9wwwl9vwajl3kr", "mx-pjjjgrpdingpzl", "mx-r6668en4fj1jgq",
      "mx-vkkk4w6ecqw9qe6", "mx-vkkk4wpjtz1ex9", "mx-xwww4z0ohv7lnl", "mx-xwww4zgzhxzng",
      "vd-3VZfcAWc8aNX9", "vd-42QF2ZlzwBFn9", "vd-P9WO4WjvsTaGf", "vd-PH81XzLmTtLPm",
      "vd-cMDXLfIjSFmff", "vd-j3LXPrMsEXxSq", "vd-jv9BPUfgcLBFm", "vd-uqRS6svXEv9YC",
      // 2026-11-27: Sang Pahlawan + Rahasia di Departemen Seni Rupa (no Streamtape copy)
      "by-8yjdxnragmxw", "by-s5hm5lwo9cw6", "lu-f9tby7qx718v", "lu-yleytvkxu2j1",
      "mx-nll4z1xvs1jv8m", "mx-vkk347qxtqvdvlx", "vd-Sg68Mqhe41RUo", "vd-uih9JD3HMSLyO",
    ]);
    assert.equal(ids.size, 47);
    const rows = [...latest, ...p04].filter((r) => ids.has(r.id));
    assert.equal(rows.length, 47, `found ${rows.length}: ${rows.map((r) => r.id).join(",")}`);
    for (const r of rows) {
      assert.equal(r.category, "ai-gay", r.id);
      assert.equal(shared.slugOf(r), "ai-gay", r.id);
    }
  });
});

