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
  description: "Deskripsi singkat asli untuk contoh video yang tampil tanpa tambahan paragraf yang lain.",
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

describe("watch page", () => {
  it("exports the component required by the watch route", async () => {
    const { WatchPage } = await vite.ssrLoadModule("/src/lib/watch/watch-page.tsx");
    assert.equal(typeof WatchPage, "function");
  });

  it("renders the original description and video controls without the added FAQ", async () => {
    const { WatchPage } = await vite.ssrLoadModule("/src/lib/watch/watch-page.tsx");
    const rootRoute = createRootRoute({ component: Outlet });
    const watchRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/watch/$id",
      validateSearch: () => ({}),
      loader: () => ({ ok: true, type: "detail", item: video, related: [] }),
      component: WatchPage,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([watchRoute]),
      history: createMemoryHistory({ initialEntries: ["/watch/test-video"] }),
      isServer: true,
    });
    await router.load();

    const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
    assert.match(html, /Judul Contoh/);
    assert.match(html, /Bagikan/);
    assert.match(html, /1m 0s/);
    assert.ok(html.includes(video.description));
    assert.doesNotMatch(html, /Pertanyaan Umum/);
    assert.doesNotMatch(html, /Video ini berjudul/);
  });
});
