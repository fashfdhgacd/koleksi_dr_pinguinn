import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PAGE_POP_MAX_PER_DAY } from "../page-pop-cap.ts";
import {
  CONFIG_URL,
  CATALOG_BLOCK_KEY,
  PAGE_POPUNDER_MAX_PER_DAY,
  TRAFFICSTARS_SITE_ID,
  VIDEY_SKIP_POPUNDER_MAX_PER_VIDEO,
  defaultState,
  defaultUploadSelection,
  normalizeState,
  selectionFromHosts,
  textHasIndoSource,
  toPublicConfig,
  uploadMarks,
  visibleOnSatellite,
} from "./config.ts";
import { triggerSatelliteSync } from "./sync.ts";

test("ad caps match the main site", () => {
  const popunder = readFileSync(new URL("../../components/card-popunder.ts", import.meta.url), "utf8");
  const videyCap = Number(popunder.match(/export const POP_MAX_VIDEY = (\d+)/)?.[1]);
  assert.equal(PAGE_POPUNDER_MAX_PER_DAY, PAGE_POP_MAX_PER_DAY);
  assert.equal(VIDEY_SKIP_POPUNDER_MAX_PER_VIDEO, videyCap);
  assert.equal(PAGE_POPUNDER_MAX_PER_DAY, 6);
  assert.equal(VIDEY_SKIP_POPUNDER_MAX_PER_VIDEO, 3);
});

test("public config shape for an empty save", () => {
  const pub = toPublicConfig(defaultState(), ["bbb222", "aaa111"]);
  assert.equal(pub.ok, true);
  assert.equal(pub.version, 1);
  assert.equal(pub.endpoint, CONFIG_URL);
  assert.equal(pub.updatedAt, null);
  assert.deepEqual(pub.blockedIds, ["aaa111", "bbb222"]);
  assert.equal(pub.rules.catalogBlockKey, CATALOG_BLOCK_KEY);
  assert.equal(pub.rules.catalogBlockAppliesEverywhere, true);
  assert.equal(pub.rules.pagePopunderMaxPerVisitorPerDay, 6);
  assert.equal(pub.rules.videySkipPopunderMaxPerVideo, 3);
  assert.equal(pub.rules.neverOnIndoav, true);
  assert.deepEqual(
    pub.sites.map((site) => site.host),
    ["videyy.icu", "videqsss.icu"],
  );
  const videyy = pub.sites[0];
  const videq = pub.sites[1];
  assert.equal(videyy.adNetwork, "exoclick");
  assert.equal(videyy.exoclickSiteId, 1119546);
  assert.equal(videq.exoclickSiteId, 1119548);
  assert.equal(TRAFFICSTARS_SITE_ID["videyy.icu"], 92720);
  assert.equal(TRAFFICSTARS_SITE_ID["videqsss.icu"], 92721);
  assert.equal(videyy.approval, "active");
  assert.equal(videyy.sync, true);
  assert.deepEqual(videyy.spots, {
    popunder: "6088480",
    preroll: "",
    inpagePush: "",
    videoSlider: "",
    native300x250: "",
    banner300x100: "",
  });
  assert.equal(videyy.folder, undefined);
  assert.deepEqual(videq.folder, { url: "", import: "first-sync-whole-folder" });
  assert.deepEqual(videyy.skipIds, []);
});

test("hiding a video on one satellite leaves it on the other, and the catalog block wins everywhere", () => {
  const state = defaultState();
  state.sites["videyy.icu"].hidden.clipA = { at: 10, title: "A" };
  state.sites["videqsss.icu"].exclude.clipB = { at: 11 };
  const blocked = new Set(["blocked1"]);
  assert.equal(visibleOnSatellite(state.sites["videyy.icu"], "clipA", blocked), false);
  assert.equal(visibleOnSatellite(state.sites["videqsss.icu"], "clipA", blocked), true);
  assert.equal(visibleOnSatellite(state.sites["videyy.icu"], "clipB", blocked), true);
  assert.equal(visibleOnSatellite(state.sites["videqsss.icu"], "clipB", blocked), false);
  assert.equal(visibleOnSatellite(state.sites["videyy.icu"], "blocked1", blocked), false);
  assert.equal(visibleOnSatellite(state.sites["videqsss.icu"], "blocked1", blocked), false);
  state.sites["videyy.icu"].sync = false;
  assert.equal(visibleOnSatellite(state.sites["videyy.icu"], "kept9", blocked), true);

  const pub = toPublicConfig(state, ["blocked1"]);
  assert.deepEqual(pub.sites[0].hiddenIds, ["clipA"]);
  assert.deepEqual(pub.sites[0].skipIds, ["clipA"]);
  assert.deepEqual(pub.sites[1].uploadExcludeIds, ["clipB"]);
  assert.deepEqual(pub.sites[1].skipIds, ["clipB"]);
  assert.deepEqual(pub.blockedIds, ["blocked1"]);
  assert.equal(pub.sites[0].sync, false);
});

test("upload defaults and the videqsss checkbox", () => {
  assert.deepEqual(defaultUploadSelection(), { main: true, videyy: true, videqsss: false });
  assert.equal(textHasIndoSource("https://tv1.indoav.app/e/abc"), true);
  assert.equal(textHasIndoSource("https://tv1.userbokep.com/e/abc"), true);
  assert.equal(textHasIndoSource("https://videy.co/v/?id=abcdefgh1"), false);

  const selected = selectionFromHosts(["koleksidrpinguin.com", "videyy.icu", "videqsss.icu"]);
  assert.ok(selected);
  const marks = uploadMarks(
    [
      { id: "indo12345", host: "indoav", title: "Indo" },
      { id: "videy1234", host: "videy", title: "Videy" },
      { id: "x", host: "videy" },
    ],
    selected,
  );
  assert.equal(marks.length, 2);
  const indo = marks.find((mark) => mark.id === "indo12345");
  const videy = marks.find((mark) => mark.id === "videy1234");
  assert.deepEqual(indo?.exclude, []);
  assert.equal(indo?.hideOnMain, false);
  assert.deepEqual(videy?.exclude, ["videqsss.icu"]);

  const off = uploadMarks([{ id: "indo12345", host: "indoav" }], { main: false, videyy: false, videqsss: false });
  assert.equal(off[0].hideOnMain, true);
  assert.deepEqual(off[0].exclude, ["videyy.icu", "videqsss.icu"]);
  assert.equal(selectionFromHosts(undefined), null);
});

test("normalize keeps spots, folder, and ids strict", () => {
  const state = normalizeState({
    updatedAt: 50,
    sites: {
      "videyy.icu": {
        sync: false,
        folderUrl: "https://evil.example/secret",
        spots: { popunder: "5210859", preroll: "nope", inpagePush: "" },
        hidden: { goodId1: { at: 1, title: "  Hi  " }, "bad id": { at: 1 }, x: { at: 1 } },
      },
      "videqsss.icu": {
        sync: true,
        folderUrl: "https://user:pass@example.com/folder",
        spots: { banner300x100: "12" },
        exclude: { otherId9: { at: 2 } },
        syncRequestedAt: 80,
      },
    },
  });
  assert.equal(state.sites["videyy.icu"].sync, false);
  assert.equal(state.sites["videyy.icu"].folderUrl, "");
  assert.equal(state.sites["videyy.icu"].spots.popunder, "5210859");
  assert.equal(state.sites["videyy.icu"].spots.preroll, "");
  assert.deepEqual(state.sites["videyy.icu"].hidden.goodId1, { at: 1, title: "Hi" });
  assert.equal(state.sites["videyy.icu"].hidden["bad id"], undefined);
  assert.equal(state.sites["videqsss.icu"].folderUrl, "");
  assert.equal(state.sites["videqsss.icu"].spots.banner300x100, "12");
  assert.equal(state.updatedAt, 50);
  const again = normalizeState({
    sites: { "videqsss.icu": { folderUrl: "https://panel.example/f/abc" } },
  });
  assert.equal(again.sites["videqsss.icu"].folderUrl, "https://panel.example/f/abc");
  assert.equal(again.sites["videyy.icu"].sync, true);
});

test("sync trigger uses GitHub when the existing token is accepted, else the config stamp", async () => {
  const calls: string[] = [];
  const github = await triggerSatelliteSync("videyy.icu", { GH_TOKEN: "token-value" }, async (url) => {
    calls.push(url);
    return new Response(null, { status: 204 });
  });
  assert.equal(github.triggered, true);
  assert.equal(github.via, "github");
  assert.equal(calls.length, 1);
  assert.equal(github.detail.includes("token-value"), false);

  const none = await triggerSatelliteSync("videqsss.icu", {}, async (url) => {
    calls.push(url);
    return new Response("no", { status: 404 });
  });
  assert.equal(none.triggered, false);
  assert.equal(none.via, "config");
  assert.match(calls.at(-1) || "", /videqsss\.icu\/api\/satelit\/sync$/);

  const http = await triggerSatelliteSync("videyy.icu", {}, async () => {
    return new Response(JSON.stringify({ ok: true, at: "2026-11-10T00:00:00.000Z" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  assert.equal(http.via, "http");
  assert.equal(http.lastSyncAt, Date.parse("2026-11-10T00:00:00.000Z"));
});
