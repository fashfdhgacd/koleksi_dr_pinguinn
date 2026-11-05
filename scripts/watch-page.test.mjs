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

describe("watch page", () => {
  it("exports the component required by the watch route", async () => {
    const { WatchPage } = await vite.ssrLoadModule("/src/lib/watch/watch-page.tsx");
    assert.equal(typeof WatchPage, "function");
  });

  it("renders a watch route with its video controls and SEO section", async () => {
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
    assert.match(html, /Pertanyaan Umum/);
    assert.match(html, /1m 0s/);
  });

  it("renders the longer description and FAQ with the recorded duration", async () => {
    const { WatchSeoSection } = await vite.ssrLoadModule("/src/components/video/watch-seo-section.tsx");
    const { longWatchDescription, watchDescription } = await vite.ssrLoadModule(
      "/src/lib/catalog/watch-description.ts",
    );
    const description = longWatchDescription(video);
    assert.ok(description.startsWith(watchDescription(video)));
    assert.ok(description.length > watchDescription(video).length);
    assert.match(description, /Judul Contoh/);
    assert.doesNotMatch(description, /Judul_Contoh/);

    const html = renderToStaticMarkup(createElement(WatchSeoSection, { item: video }));
    assert.match(html, /Pertanyaan Umum/);
    assert.match(html, /Judul Contoh/);
    assert.match(html, /1m 0s/);
    assert.doesNotMatch(html, /Durasi tidak tercatat/);
  });

  it("reports an unknown duration only when it is not recorded", async () => {
    const { WatchSeoSection } = await vite.ssrLoadModule("/src/components/video/watch-seo-section.tsx");
    const item = { ...video, duration: null, durationLabel: "—" };
    const html = renderToStaticMarkup(createElement(WatchSeoSection, { item }));
    assert.match(html, /Durasi tidak tercatat/);
  });
});
