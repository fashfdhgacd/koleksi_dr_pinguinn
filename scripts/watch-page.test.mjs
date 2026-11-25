import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
let vite;

before(async () => {
  vite = await createServer({
    root,
    configFile: false,
    appType: "custom",
    logLevel: "error",
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    define: { __VIDEY_THUMB_IDS__: "null" },
    server: { middlewareMode: true },
  });
});

after(async () => {
  if (vite) await vite.close();
});

const video = {
  id: "test-video",
  title: "Judul_Contoh (Dr. Pinguin)",
  description: "",
  category: "contoh",
  duration: 60,
  durationLabel: "1m 0s",
  thumbnail: "",
  quality: "HD",
  year: null,
  creator: null,
  views: null,
  video_url: null,
  qualities: [],
  subjects: [],
  playable: true,
};

async function renderWatch(item) {
  const { WatchPage } = await vite.ssrLoadModule("/src/lib/watch/watch-page.tsx");
  const rootRoute = createRootRoute({ component: Outlet });
  const watchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/watch/$id",
    validateSearch: () => ({}),
    loader: () => ({ ok: true, type: "detail", item, related: [] }),
    component: WatchPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([watchRoute]),
    history: createMemoryHistory({ initialEntries: ["/watch/test-video"] }),
    isServer: true,
  });
  await router.load();

  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

describe("watch page", () => {
  it("exports the component required by the watch route", async () => {
    const { WatchPage } = await vite.ssrLoadModule("/src/lib/watch/watch-page.tsx");
    assert.equal(typeof WatchPage, "function");
  });

  it("renders the clean heading before the duration and includes a compact fallback description", async () => {
    const { publicWatchDescription } = await vite.ssrLoadModule("/src/lib/seo.ts");
    const desc = publicWatchDescription(video);
    const html = await renderWatch({ ...video, title: video.title + " - koleksidrpinguin.com" });
    assert.match(html, /<h1[^>]*>Judul Contoh<\/h1>/);
    const header = html.slice(html.indexOf("<h1"), html.indexOf("</header>", html.indexOf("<h1")));
    assert.ok(header.indexOf("1m 0s") > header.indexOf("</h1>"));
    assert.match(html, /href="\/cari"/);
    assert.match(desc, /1 menit/);
    assert.match(desc, /Contoh/);
    assert.ok(!html.includes(desc));
    assert.match(html, /Bagian dari koleksi contoh di Dr\. Pinguin\./);
    assert.match(html, /Bagikan/);
    assert.match(html, /1m 0s/);
    assert.doesNotMatch(html, /Pertanyaan Umum/);
    assert.doesNotMatch(html, /Video ini berjudul/);
    assert.doesNotMatch(html, /ada di kategori/);
  });

  it("shows the owner's manual description instead of the generated one", async () => {
    const manual = "Deskripsi manual dari pemilik untuk video contoh ini, ditulis sendiri.";
    const html = await renderWatch({ ...video, description: manual });
    assert.ok(html.includes(manual));
    assert.doesNotMatch(html, /Bagian dari koleksi contoh/);
    assert.doesNotMatch(html, /ada di kategori/);
  });
});

describe("manual description (seo.ts)", () => {
  const base = { id: "test-video", title: "Judul Contoh", category: "jilbab", duration: 120 };

  it("uses a non-empty manual description for the page text and meta", async () => {
    const { publicWatchDescription, resolveVideoSeoDescription } =
      await vite.ssrLoadModule("/src/lib/seo.ts");
    const manual = "Cewek hijab viral, rekaman asli yang lagi rame dibicarakan.";
    assert.equal(publicWatchDescription({ ...base, description: manual }), manual);
    assert.equal(publicWatchDescription({ ...base, description: manual }, 160), manual);
    assert.equal(resolveVideoSeoDescription({ ...base, description: manual }), manual);
    const long = "kata ".repeat(80).trim();
    const meta = publicWatchDescription({ ...base, description: long }, 160);
    assert.ok(meta.length <= 160);
    assert.ok(meta.endsWith("…"));
  });

  it("keeps the generated description when the manual one is empty", async () => {
    const { publicWatchDescription, resolveVideoSeoDescription } =
      await vite.ssrLoadModule("/src/lib/seo.ts");
    const auto = publicWatchDescription(base, 160);
    assert.match(auto, /Jilbab/);
    assert.match(auto, /2 menit/);
    assert.equal(auto.split("Judul Contoh").length - 1, 1);
    for (const description of ["", "   ", null, undefined, "Tidak ada sinopsis."]) {
      assert.equal(publicWatchDescription({ ...base, description }, 160), auto);
      assert.equal(
        resolveVideoSeoDescription({ ...base, description }),
        resolveVideoSeoDescription(base),
      );
    }
  });

  it("never shows a manual description with forbidden words", async () => {
    const { publicWatchDescription, isSafeManualDescription } =
      await vite.ssrLoadModule("/src/lib/seo.ts");
    const auto = publicWatchDescription(base);
    for (const bad of ["Video anak SMP viral", "abg bocil colmek", "cewek masih sekolah"]) {
      assert.equal(isSafeManualDescription(bad), false);
      assert.equal(publicWatchDescription({ ...base, description: bad }), auto);
    }
    assert.equal(isSafeManualDescription("Tante hijab viral"), true);
  });

  it("writes a different sentence per video and lets a manual description replace curated text", async () => {
    const { publicWatchDescription } = await vite.ssrLoadModule("/src/lib/seo.ts");
    const facts = {
      title: "Judul Sama Persis",
      category: "hotel",
      duration: 300,
      creator: "UserBokep",
    };
    const tails = new Set();
    for (let i = 0; i < 32; i++) {
      const text = publicWatchDescription({ ...facts, id: `vid-${i}` });
      assert.ok(text.length <= 158, text);
      assert.equal(text.split("Judul Sama Persis").length - 1, 1);
      assert.match(text, /Hotel/);
      assert.match(text, /5 menit/);
      assert.match(text, /UserBokep/);
      assert.doesNotMatch(text, /Text Import/);
      tails.add(text.replaceAll("Judul Sama Persis", "T"));
    }
    assert.ok(tails.size >= 12, `only ${tails.size} distinct sentences`);
    const again = publicWatchDescription({ ...facts, id: "vid-3" });
    assert.equal(again, publicWatchDescription({ ...facts, id: "vid-3" }));

    const curatedId = "XyqeEIe5pG6q";
    const curated = publicWatchDescription({
      id: curatedId,
      title: "Judul Apa Saja",
      category: "amatir",
      duration: 180,
      creator: "IndoAV",
    });
    assert.match(curated, /seorang wanita berjilbab/);
    assert.doesNotMatch(curated, /Judul Apa Saja/);
    const manual = "Teks pemilik yang harus menang atas teks kurasi.";
    assert.equal(
      publicWatchDescription({
        id: curatedId,
        title: "Judul Apa Saja",
        category: "amatir",
        description: manual,
      }),
      manual,
    );
    const withNote = "Seorang wanita berjilbab, rekaman amatir. seo: catatan internal.";
    assert.equal(
      publicWatchDescription({
        id: "lain",
        title: "Judul",
        category: "jilbab",
        description: withNote,
      }),
      "Seorang wanita berjilbab, rekaman amatir.",
    );
    const long =
      "Cerita panjang sekali yang harus dipotong supaya nomor bagian tetap kebaca di akhir judul video ini (Koleksi Dr. Pinguin Bokep, M.S.B.)";
    const part6 = publicWatchDescription({
      id: "part-6",
      title: `${long} Part 6`,
      category: "amatir",
      duration: 60,
      creator: "IndoAV",
    });
    const part7 = publicWatchDescription({
      id: "part-7",
      title: `${long} Part 7`,
      category: "amatir",
      duration: 74,
      creator: "IndoAV",
    });
    assert.match(part6, /Part 6/);
    assert.match(part7, /Part 7/);
    assert.notEqual(part6, part7);
  });
});
