import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXO_FALLBACK_ZONES,
  EXO_ZONES,
  GRID_SLOTS,
  MAX_GRID_ADS,
  adPositions,
  fallbackZone,
  gridSlot,
  planGrid,
  visibleCells,
  type GridCell,
  type GridSlot,
} from "./grid-ads.ts";
import { isAdFreePath } from "./catalog/landing.ts";

type AdCell = Extract<GridCell, { kind: "ad" }>;
const BPS = ["mobile", "desktop"] as const;
const ads = (cells: GridCell[], bp?: "mobile" | "desktop") =>
  cells.filter((c): c is AdCell => c.kind === "ad" && (!bp || c.breakpoint === bp));

const FULL: GridSlot[] = [
  { network: "exoclick", zoneId: "e1" },
  { network: "exoclick", zoneId: "e2" },
  { network: "trafficstars", zoneId: "t1" },
  { network: "exoclick", zoneId: "e3" },
  { network: "trafficstars", zoneId: "t2" },
  { network: "exoclick", zoneId: "e4" },
];

// Page sizes in use: catalog 30 (DEFAULT_PAGE_SIZE), landing / en 24, home = 30 minus hero cards,
// last pages anything from 1 up.
const COUNTS = Array.from({ length: 48 }, (_, i) => i + 1);

test("every page shows exactly 6 ad cells per breakpoint, slotIndex 0..5 in order", () => {
  for (const n of COUNTS) {
    const cells = planGrid(n, true);
    for (const bp of BPS) {
      const list = ads(cells, bp);
      assert.equal(list.length, MAX_GRID_ADS, `${bp} n=${n}`);
      assert.deepEqual(list.map((c) => c.slotIndex), [0, 1, 2, 3, 4, 5]);
    }
  }
});

test("rows are full (laptop cells % 3 == 0 for 3+ videos), tiny last pages keep their videos", () => {
  for (const n of COUNTS) {
    const cells = planGrid(n, true);
    if (n >= 3) assert.equal(visibleCells(cells, "desktop").length % 3, 0, `desktop n=${n}`);
    // a tiny last page keeps its videos visible on laptop
    assert.ok(visibleCells(cells, "desktop").filter((c) => c.kind === "video").length >= Math.min(n, 3), `videos n=${n}`);
    // never trims more than 2 videos, and only from the end
    const hiddenDesk = cells.filter((c) => c.kind === "video" && c.hidden.desktop).map((c) => (c as { index: number }).index);
    assert.ok(hiddenDesk.length <= 2);
    assert.deepEqual(hiddenDesk, hiddenDesk.length ? Array.from({ length: hiddenDesk.length }, (_, i) => n - hiddenDesk.length + i) : []);
    assert.equal(cells.filter((c) => c.kind === "video" && c.hidden.mobile).length, 0);
    assert.equal(cells.filter((c) => c.kind === "video").length, n, "every video is in the DOM once");
  }
  // full catalog page: 30 videos + 6 ads = 12 full rows, nothing trimmed
  assert.equal(visibleCells(planGrid(30, true), "desktop").length, 36);
  // landing page: 24 + 6 = 30, nothing trimmed
  assert.equal(visibleCells(planGrid(24, true), "desktop").length, 30);
});

test("full pages keep the usual positions (phone after every 4th video, laptop after 2, 7, 12 ...)", () => {
  assert.deepEqual(adPositions(30, "mobile"), [4, 8, 12, 16, 20, 24]);
  assert.deepEqual(adPositions(30, "desktop"), [2, 7, 12, 17, 22, 27]);
  assert.deepEqual(adPositions(24, "mobile"), [4, 8, 12, 16, 20, 24]);
  // 24 videos only reach 5 laptop rule slots -> spread evenly instead, still 6
  assert.deepEqual(adPositions(24, "desktop"), [2, 6, 10, 14, 18, 22]);
  for (const n of COUNTS) for (const bp of BPS) {
    const p = adPositions(n, bp);
    assert.equal(p.length, 6);
    assert.ok(p.every((x, i) => x >= 1 && x <= n && (i === 0 || x >= p[i - 1])), `${bp} n=${n}: ${p}`);
  }
});

test("every live slot is a unique ExoClick zone; no TrafficStars banners", () => {
  for (const n of COUNTS) {
    const cells = planGrid(n, true);
    for (const bp of BPS) {
      const list = ads(cells, bp);
      assert.ok(list.every((c) => c.slot.network === "exoclick"), `${bp} n=${n}`);
      const exo = list.map((c) => c.slot.zoneId);
      assert.equal(new Set(exo).size, exo.length, `${bp} n=${n}`);
      assert.equal(exo.length, 6);
    }
    const keys = ads(cells).map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length);
  }
  const exoAll = [
    ...GRID_SLOTS.filter((s) => s.network === "exoclick").map((s) => s.zoneId),
    ...Object.values(EXO_FALLBACK_ZONES),
  ].filter(Boolean);
  assert.equal(new Set(exoAll).size, exoAll.length);
  assert.equal(GRID_SLOTS.filter((s) => s.network === "trafficstars").length, 0);
  // old TS banner spots and the unused TS-slot fallback zones must not be wired
  const wired = new Set([...exoAll, ...EXO_ZONES]);
  for (const id of ["b027eda668f044c2a0e1a331d59cb3d3", "68654e89b8b14322bcc946c618f13e4c", "6111374", "6111376"]) {
    assert.equal(wired.has(id), false, id);
  }
});

test("real config: 6 distinct ExoClick 300x250 zones in the planned order", () => {
  const expected = [
    [0, "exoclick", "6053864"],
    [1, "exoclick", "6111252"],
    [2, "exoclick", "6056216"],
    [3, "exoclick", "6111370"],
    [4, "exoclick", "6056218"],
    [5, "exoclick", "6111372"],
  ];
  for (const bp of BPS) {
    assert.deepEqual(ads(planGrid(30, true), bp).map((c) => [c.slotIndex, c.slot.network, c.slot.zoneId]), expected);
  }
  assert.equal(GRID_SLOTS.filter((s) => s.network === "exoclick").length, 6);
  assert.equal(GRID_SLOTS.filter((s) => s.network === "trafficstars").length, 0);
  assert.deepEqual(EXO_ZONES, expected.map(([, , id]) => id));
});

test("ExoClick fallback: only for non-ExoClick slots, never an ExoClick slot, '' means none", () => {
  const fb = { 2: "x2", 4: "x4" };
  for (const i of [0, 1, 3, 5]) assert.equal(fallbackZone(i, FULL, fb), null, `slot ${i} is ExoClick`);
  assert.deepEqual([2, 4].map((i) => fallbackZone(i, FULL, fb)), ["x2", "x4"]);
  assert.equal(fallbackZone(2, FULL, { 2: "" }), null);
  // live config: all six slots are already ExoClick, so no fallback is wired
  assert.deepEqual(EXO_FALLBACK_ZONES, {});
  for (let i = 0; i < 6; i++) assert.equal(fallbackZone(i), null, `live slot ${i}`);
});

test("a slot without a zone ID renders nothing and never borrows another zone", () => {
  const sparse: GridSlot[] = FULL.map((s, i) => (i === 3 ? { ...s, zoneId: "" } : s));
  const cells = planGrid(30, true, sparse);
  assert.deepEqual(ads(cells, "desktop").map((c) => [c.slotIndex, c.slot.zoneId]), [[0, "e1"], [1, "e2"], [2, "t1"], [4, "t2"], [5, "e4"]]);
  assert.equal(visibleCells(cells, "desktop").length % 3, 0, "rows still full");
  assert.equal(gridSlot(3, sparse), null);
  assert.equal(gridSlot(6), null);
  assert.deepEqual(gridSlot(4, FULL), { network: "trafficstars", zoneId: "t2" });
});

test("no catalog landing is ad-free (isAdFreePath stays data-driven)", () => {
  for (const p of [
    "/",
    "/ms",
    "/kategori/bokep",
    "/watch/abc",
    "/cari/bokep-indo-stw",
    "/cari/bokep-indo-stw/halaman/2",
    "/en/indonesian-amateur",
    "/cari/bokep-indoav-terbaru",
    "/cari/bokep-indoav-terbaru/halaman/3",
    "/ms/cari/bokep-indoav-terbaru",
    "/cari/bokep-userbokep-indo",
    "/ms/cari/bokep-userbokep-indo",
    "/id/cari/bokep-userbokep-indo",
    "/en/cari/bokep-userbokep-indo",
    "/cari/bokep-userbokep-indo/halaman/3",
    "/cari/bokep-userbokep-indo/?x=1",
    "",
  ]) {
    assert.equal(isAdFreePath(p), false, p);
  }
});

test("no ads when showAds is false (adFree / ads=false pages)", () => {
  assert.equal(ads(planGrid(30, false)).length, 0);
  assert.equal(visibleCells(planGrid(30, false), "desktop").length, 30);
});
