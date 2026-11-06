import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { blockedIdSet, isBlockedId } from "./catalog-block.js";
import { acceptLandingCard } from "./landing.ts";
import { categoryHref, cariHref, homeHref, legacyPageRedirect, parseHalamanParam } from "./halaman.ts";

test("halaman paths replace query pagination", () => {
  assert.equal(homeHref(1), "/");
  assert.equal(homeHref(2), "/halaman/2");
  assert.equal(categoryHref("jilbab", 3), "/kategori/jilbab/halaman/3");
  assert.equal(cariHref("bokep-ojol", 2), "/cari/bokep-ojol/halaman/2");
  assert.equal(parseHalamanParam("2"), 2);
  assert.equal(parseHalamanParam("1"), null);
  assert.equal(legacyPageRedirect("/", "?page=2"), "/halaman/2");
  assert.equal(legacyPageRedirect("/kategori/jilbab", "?page=3&periode=minggu"), "/kategori/jilbab/halaman/3?periode=minggu");
  assert.equal(legacyPageRedirect("/cari/bokep-ojol", "?page=2"), "/cari/bokep-ojol/halaman/2");
  assert.equal(legacyPageRedirect("/", "?q=jilbab&page=2"), null);
  assert.equal(legacyPageRedirect("/halaman/1", ""), "/");
});

test("genre landings accept only IndoAV and UserBokep; Videy landing stays Videy", () => {
  const genre = { category: "jilbab" };
  assert.equal(acceptLandingCard({ title: "Tante STW di kamar", creator: "IndoAV", category: "jilbab" }, genre), true);
  assert.equal(acceptLandingCard({ title: "Tante STW di kamar", creator: "UserBokep", category: "jilbab" }, genre), true);
  assert.equal(acceptLandingCard({ title: "Tante STW di kamar", creator: "Videy", category: "jilbab" }, genre), false);
  assert.equal(acceptLandingCard({ title: "Tante STW di kamar", creator: "Putarin", category: "jilbab" }, genre), false);
  assert.equal(acceptLandingCard({ title: "Link videy", creator: "Videy", category: "videy" }, { category: "videy" }), true);
});

test("hard blocklist ids are excluded; a school-title is not an id block by itself", () => {
  const blocked = blockedIdSet(JSON.parse(readFileSync(new URL("./catalog-blocklist.json", import.meta.url), "utf8")));
  assert.equal(isBlockedId("4RBCLH2sf4Xe", blocked), true);
  assert.equal(isBlockedId("synthetic-school-not-blocked", blocked), false);
  assert.equal(isBlockedId("not-a-blocked-id", blocked), false);
  assert.ok(blocked.size >= 60);
  const robots = readFileSync(new URL("../../../public/robots.txt", import.meta.url), "utf8");
  assert.match(robots, /^Sitemap: https:\/\/koleksidrpinguin\.com\/sitemap\.xml$/m);
  const yandex = robots.split(/\n(?=User-agent:)/).find((b) => b.startsWith("User-agent: Yandex"));
  assert.ok(yandex);
  assert.match(yandex!, /^Clean-param: utm_\*$/m);
  const indexnow = readFileSync(new URL("../bot/indexnow.ts", import.meta.url), "utf8");
  assert.match(indexnow, /https:\/\/yandex\.com\/indexnow/);
  assert.match(indexnow, /isBlockedId/);
  const home = readFileSync(new URL("../seo.ts", import.meta.url), "utf8");
  assert.match(home, /Update Setiap Hari/);
  assert.match(home, /tanpa VPN/);
});
