import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeWatched, pageButtons, pageWatched, popOutcomes, watchId, type WatchedList } from "./owner-videos.ts";

test("watchId keeps only /watch/<id> paths", () => {
  assert.equal(watchId("/watch/abc"), "abc");
  assert.equal(watchId("/watch/abc/"), "abc");
  assert.equal(watchId("/watch/a%20b?x=1"), "a b");
  assert.equal(watchId("/kategori/bokep"), "");
  assert.equal(watchId("/watch/"), "");
});

test("mergeWatched joins views and popunders by video id", () => {
  const rows = mergeWatched(
    [
      { path: "/watch/a", views: 5, uniq: 3 },
      { path: "/watch/a/", views: 1, uniq: 1 },
      { path: "/watch/b", views: 9, uniq: 2 },
      { path: "/", views: 100, uniq: 50 },
    ],
    [
      { id: "a", n: 2 },
      { id: "c", n: 1 },
      { id: "b", n: 0 },
    ],
  );
  assert.deepEqual(
    rows.map((r) => [r.id, r.views, r.uniq, r.pops]),
    [
      ["b", 9, 2, 0],
      ["a", 6, 4, 2],
      ["c", 0, 0, 1],
    ],
  );
});

test("mergeWatched splits popunders per video: TrafficStars = opened - ExoClick fallback, plus both-failed", () => {
  const rows = mergeWatched(
    [{ path: "/watch/a", views: 5, uniq: 3 }],
    [
      { id: "a", n: 4, exo: 1, fail: 2 },
      { id: "old", n: 3 }, // old rows have no pop_x / pop_f: all TrafficStars
      { id: "onlyfail", n: 0, fail: 1 }, // a video where every tap failed still shows up
    ],
  );
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual([by.a.pops, by.a.popsExo, by.a.popsFail], [4, 1, 2]);
  assert.deepEqual(popOutcomes(by.a.pops, by.a.popsExo, by.a.popsFail), { ts: 3, exo: 1, fail: 2 });
  assert.deepEqual(popOutcomes(by.old.pops, by.old.popsExo, by.old.popsFail), { ts: 3, exo: 0, fail: 0 });
  assert.deepEqual(popOutcomes(by.onlyfail.pops, by.onlyfail.popsExo, by.onlyfail.popsFail), { ts: 0, exo: 0, fail: 1 });
});

test("popOutcomes never goes negative and tolerates missing fields", () => {
  assert.deepEqual(popOutcomes(2, 5, 0), { ts: 0, exo: 2, fail: 0 });
  assert.deepEqual(popOutcomes(7, undefined as unknown as number, undefined as unknown as number), { ts: 7, exo: 0, fail: 0 });
});

function list(n: number): WatchedList {
  return {
    period: "today",
    rows: Array.from({ length: n }, (_, i) => ({
      id: `v${i}`,
      title: i === 3 ? "Ntr di Tempat Kerja Episode 1" : `Video ${i}`,
      thumb: "",
      cat: "",
      server: "",
      up: 1000 + i,
      views: n - i,
      uniq: 1,
      pops: i % 3,
      popsExo: 0,
      popsFail: 0,
    })),
    totals: { views: 0, prevViews: 0, pops: { videy: 0, other: 0, prevVidey: 0, prevOther: 0, exo: 0, prevExo: 0, fail: 0, prevFail: 0, tap: 0, prevTap: 0, revisit: 0, prevRevisit: 0 } },
    updatedAt: "",
  };
}

test("pageWatched: default most watched, 10 per page, search and sort", () => {
  const l = list(25);
  const p1 = pageWatched(l, {});
  assert.equal(p1.pages, 3);
  assert.equal(p1.total, 25);
  assert.equal(p1.rows.length, 10);
  assert.equal(p1.rows[0].id, "v0");
  const p3 = pageWatched(l, { page: 99 });
  assert.equal(p3.page, 3);
  assert.equal(p3.rows.length, 5);
  const s = pageWatched(l, { q: "tempat KERJA" });
  assert.equal(s.total, 1);
  assert.equal(s.totalAll, 25);
  assert.equal(s.rows[0].id, "v3");
  assert.equal(pageWatched(l, { sort: "upload", dir: "desc" }).rows[0].id, "v24");
  assert.equal(pageWatched(l, { sort: "views", dir: "asc" }).rows[0].id, "v24");
  assert.equal(pageWatched(l, { sort: "pop" }).rows[0].pops, 2);
});

test("pageButtons shows first, last and around the current page", () => {
  assert.deepEqual(pageButtons(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageButtons(10, 20), [1, 2, 0, 9, 10, 11, 0, 19, 20]);
  assert.deepEqual(pageButtons(1, 20), [1, 2, 0, 19, 20]);
});
