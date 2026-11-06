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

  it("renders the generated description and video controls without the added FAQ", async () => {
    const html = await renderWatch(video);
    assert.match(html, /Judul Contoh/);
    assert.match(html, /href="\/cari"/);
    assert.match(html, /durasi 1 menit/);
    assert.equal(html.split("ada di kategori").length - 1, 1);
    assert.equal(html.split("Judul Contoh").length - 1, 2);
    assert.match(html, /Bagikan/);
    assert.match(html, /1m 0s/);
    assert.doesNotMatch(html, /Pertanyaan Umum/);
    assert.doesNotMatch(html, /Video ini berjudul/);
  });

  it("shows the owner's manual description instead of the generated one", async () => {
    const manual = "Deskripsi manual dari pemilik untuk video contoh ini, ditulis sendiri.";
    const html = await renderWatch({ ...video, description: manual });
    assert.ok(html.includes(manual));
    assert.doesNotMatch(html, /ada di kategori/);
  });
});

describe("manual description (seo.ts)", () => {
  const base = { id: "test-video", title: "Judul Contoh", category: "jilbab", duration: 120 };

  it("uses a non-empty manual description for the page text and meta", async () => {
    const { publicWatchDescription, resolveVideoSeoDescription } = await vite.ssrLoadModule("/src/lib/seo.ts");
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
    const { publicWatchDescription, resolveVideoSeoDescription } = await vite.ssrLoadModule("/src/lib/seo.ts");
    const auto = publicWatchDescription(base, 160);
    assert.match(auto, /ada di kategori/);
    for (const description of ["", "   ", null, undefined, "Tidak ada sinopsis."]) {
      assert.equal(publicWatchDescription({ ...base, description }, 160), auto);
      assert.equal(resolveVideoSeoDescription({ ...base, description }), resolveVideoSeoDescription(base));
    }
  });

  it("never shows a manual description with forbidden words", async () => {
    const { publicWatchDescription, isSafeManualDescription } = await vite.ssrLoadModule("/src/lib/seo.ts");
    const auto = publicWatchDescription(base);
    for (const bad of ["Video anak SMP viral", "abg bocil colmek", "cewek masih sekolah"]) {
      assert.equal(isSafeManualDescription(bad), false);
      assert.equal(publicWatchDescription({ ...base, description: bad }), auto);
    }
    assert.equal(isSafeManualDescription("Tante hijab viral"), true);
  });
});
