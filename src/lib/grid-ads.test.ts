import { test } from "node:test";
import assert from "node:assert/strict";
import { GRID_SLOTS, MAX_GRID_ADS, gridSlot, planGrid, type GridCell, type GridSlot } from "./grid-ads.ts";
import { isAdFreePath } from "./catalog/landing.ts";

type AdCell = Extract<GridCell, { kind: "ad" }>;
const ads = (cells: GridCell[], bp?: "mobile" | "desktop") =>
  cells.filter((c): c is AdCell => c.kind === "ad" && (!bp || c.breakpoint === bp));

const FULL: GridSlot[] = [
  { network: "exoclick", zoneId: "e1" },
  { network: "trafficstars", zoneId: "t1" },
  { network: "wynq", zoneId: "w1" },
  { network: "exoclick", zoneId: "e2" },
  { network: "trafficstars", zoneId: "t2" },
  { network: "wynq", zoneId: "w2" },
];

test("at most 6 ad slots per breakpoint, slotIndex 0..5 in order", () => {
  for (const n of [24, 30, 36, 60, 200]) {
    const cells = planGrid(n, true, FULL, true);
    for (const bp of ["mobile", "desktop"] as const) {
      const list = ads(cells, bp);
      assert.ok(list.length <= MAX_GRID_ADS, `${bp} ${n}: ${list.length}`);
      assert.deepEqual(list.map((c) => c.slotIndex), list.map((_, i) => i));
    }
  }
  assert.equal(ads(planGrid(200, true, FULL, true), "mobile").length, 6);
  assert.equal(ads(planGrid(200, true, FULL, true), "desktop").length, 6);
});

test("keeps position rules: phone after every 4th video, laptop after video 2, 7, 12 ...", () => {
  const cells = planGrid(30, true, FULL, true);
  const prevVideo = (i: number) => {
    for (let j = i - 1; j >= 0; j--) if (cells[j].kind === "video") return (cells[j] as { index: number }).index + 1;
    return -1;
  };
  const m = cells.flatMap((c, i) => (c.kind === "ad" && c.breakpoint === "mobile" ? [prevVideo(i)] : []));
  const d = cells.flatMap((c, i) => (c.kind === "ad" && c.breakpoint === "desktop" ? [prevVideo(i)] : []));
  assert.deepEqual(m, [4, 8, 12, 16, 20, 24]);
  assert.deepEqual(d, [2, 7, 12, 17, 22, 27]);
});

test("no zone ID appears twice in one view (per breakpoint), with real config and full config", () => {
  for (const [slots, wynq] of [[GRID_SLOTS, false], [GRID_SLOTS, true], [FULL, true]] as const) {
    for (const n of [12, 24, 30, 36, 100]) {
      const cells = planGrid(n, true, slots, wynq);
      for (const bp of ["mobile", "desktop"] as const) {
        const ids = ads(cells, bp).map((c) => c.slot.zoneId);
        assert.equal(new Set(ids).size, ids.length, `${bp} ${n}: ${ids.join(",")}`);
      }
      const keys = ads(cells).map((c) => c.key);
      assert.equal(new Set(keys).size, keys.length);
    }
  }
  const configured = GRID_SLOTS.map((s) => s.zoneId).filter(Boolean);
  assert.equal(new Set(configured).size, configured.length);
});

test("real config: all 6 slots render per breakpoint, Wynq slots included, in order", () => {
  const cells = planGrid(30, true);
  const expected = [
    [0, "exoclick", "6053864"],
    [1, "trafficstars", "b027eda668f044c2a0e1a331d59cb3d3"],
    [2, "wynq", "0SBV7RF557074"],
    [3, "exoclick", "6111252"],
    [4, "trafficstars", "68654e89b8b14322bcc946c618f13e4c"],
    [5, "wynq", "0SBV80XGCJ8C1"],
  ];
  for (const bp of ["mobile", "desktop"] as const) {
    assert.deepEqual(ads(cells, bp).map((c) => [c.slotIndex, c.slot.network, c.slot.zoneId]), expected);
  }
  assert.deepEqual(gridSlot(2), { network: "wynq", zoneId: "0SBV7RF557074" });
  assert.deepEqual(gridSlot(5), { network: "wynq", zoneId: "0SBV80XGCJ8C1" });
});

test("empty slot renders nothing and never borrows another zone; videos are never displaced", () => {
  const sparse: GridSlot[] = FULL.map((s, i) => (i === 2 || i === 4 ? { ...s, zoneId: "" } : s));
  const cells = planGrid(30, true, sparse, true);
  assert.deepEqual(ads(cells, "desktop").map((c) => [c.slotIndex, c.slot.zoneId]), [[0, "e1"], [1, "t1"], [3, "e2"], [5, "w2"]]);
  assert.deepEqual(ads(cells, "mobile").map((c) => c.slotIndex), [0, 1, 3, 5]);
  assert.deepEqual(cells.filter((c) => c.kind === "video").map((c) => (c as { index: number }).index), [...Array(30).keys()]);
  assert.equal(gridSlot(2, sparse, true), null);
  assert.equal(gridSlot(6), null);
  // Wynq with zone ID but disabled -> nothing
  assert.equal(gridSlot(2, FULL, false), null);
  assert.deepEqual(gridSlot(2, FULL, true), { network: "wynq", zoneId: "w1" });
});

test("Wynq site tag is kept off ad-free source pages only", () => {
  for (const p of ["/cari/bokep-indoav-terbaru", "/cari/bokep-indoav-terbaru/halaman/3", "/ms/cari/bokep-userbokep-indo", "/cari/bokep-userbokep-indo/?x=1"]) {
    assert.equal(isAdFreePath(p), true, p);
  }
  for (const p of ["/", "/ms", "/kategori/bokep", "/watch/abc", "/cari/bokep-indo-stw", "/cari/bokep-indo-stw/halaman/2", "/en/indonesian-amateur", ""]) {
    assert.equal(isAdFreePath(p), false, p);
  }
});

test("no ads when showAds is false (IndoAV / adFree pages)", () => {
  assert.equal(ads(planGrid(30, false)).length, 0);
});
