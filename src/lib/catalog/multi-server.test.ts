import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyManualMerges,
  borrowedPosters,
  borrowedTitles,
  mergeKeyOf,
  mergeServers,
  multiServerFrom,
  serverHostOf,
} from "./multi-server.ts";
import { seriesIndex } from "./series.ts";

const T = "Mahasiswi Cantik Main Di Kos Sampai Pagi";
const indo = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: T,
  embed: `https://indoav.example/e/${id}`,
  ...extra,
});
const tape = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: T,
  embed: `https://streamtape.com/e/${id}`,
  ...extra,
});
const byse = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: T,
  source: "byse",
  embed: `https://byse.example/e/${id}`,
  ...extra,
});

describe("serverHostOf", () => {
  it("names the host of a copy", () => {
    assert.equal(serverHostOf(indo("a")), "IndoAV");
    assert.equal(serverHostOf(tape("b")), "Streamtape");
    assert.equal(serverHostOf(byse("c")), "Byse");
    assert.equal(serverHostOf({ id: "d", embed: "https://videy.co/e/x" }), "Videy");
  });
});

describe("mergeServers", () => {
  it("makes the IndoAV copy the main page even when another copy is older", () => {
    const r = mergeServers([
      tape("old1", { createdAt: 1000 }),
      indo("new1", { createdAt: 5000 }),
      byse("by-x", { createdAt: 3000 }),
    ]);
    assert.equal(r.groups.length, 1);
    const g = r.groups[0];
    assert.equal(g.main, "new1");
    assert.deepEqual(g.ids, ["new1", "old1", "by-x"]);
    assert.deepEqual(g.hosts, ["IndoAV", "Streamtape", "Byse"]);
  });

  it("without IndoAV the oldest copy is main, Byse is always the last server", () => {
    const r = mergeServers([byse("by-a", { createdAt: 1 }), tape("t-b", { createdAt: 9 })]);
    assert.equal(r.groups[0].main, "by-a");
    assert.deepEqual(r.groups[0].ids, ["t-b", "by-a"]);
  });

  it("never merges Videy; a short title on one host needs the same known duration", () => {
    const videy = { id: "v1", title: T, embed: "https://videy.co/e/v1" };
    assert.equal(mergeServers([videy, tape("t1")]).groups.length, 0);
    // Two hosts, same short title, no duration: a multi-host upload of one video.
    const hosts = mergeServers([tape("s1", { title: "Cewek Kos" }), indo("s2", { title: "Cewek Kos" })]);
    assert.deepEqual(
      hosts.groups.map((g) => g.ids),
      [["s2", "s1"]],
    );
    const short = mergeServers([
      indo("m1", { title: "Mantanmu Idamanku", duration: 801 }),
      indo("m2", { title: "Mantanmu Idamanku", duration: 801 }),
    ]);
    assert.deepEqual(
      short.groups.map((g) => g.ids),
      [["m1", "m2"]],
    );
    const other = mergeServers([
      indo("c1", { title: "Colmek", duration: 55 }),
      indo("c2", { title: "Colmek" }),
    ]);
    assert.equal(other.groups.length, 0);
    assert.equal(other.blocked[0].why, "short-no-duration");
  });

  it("joins copies of one title on one host (owner rule: same title = one page)", () => {
    const r = mergeServers([tape("t1"), tape("t2")]);
    assert.deepEqual(
      r.groups.map((g) => g.ids),
      [["t1", "t2"]],
    );
    const i = mergeServers([
      indo("i1", { duration: 584 }),
      indo("i2", { duration: 584 }),
      indo("i3", { duration: 584 }),
    ]);
    assert.deepEqual(
      i.groups.map((g) => [g.main, g.ids.length]),
      [["i1", 3]],
    );
  });

  it("blocks a group whose durations differ or that has one host twice with other lengths", () => {
    const far = mergeServers([indo("i1", { duration: 600 }), tape("t1", { duration: 1200 })]);
    assert.equal(far.groups.length, 0);
    assert.equal(far.blocked[0].why, "duration-differs");
    const twice = mergeServers([
      indo("i1", { duration: 600 }),
      tape("t1", { duration: 600 }),
      tape("t2", { duration: 610 }),
    ]);
    assert.equal(twice.blocked[0].why, "host-twice");
    // Split once by exact duration: the two 600 s copies are one video, t2 keeps its own page.
    assert.deepEqual(
      twice.groups.map((g) => g.ids),
      [["i1", "t1"]],
    );
    const close = mergeServers([indo("i1", { duration: 600 }), tape("t1", { duration: 615 })]);
    assert.equal(close.groups.length, 1);
  });

  it("a group split by duration joins only exact matches and leaves undated lengths alone", () => {
    const G = "Gangguin Adik Lagi Masak Nurut Diewe Keluar Dalem";
    const ub = (id: string, duration?: number) => ({
      id,
      title: G,
      embed: `https://tv1.userbokep.com/e/${id}`,
      duration,
    });
    const r = mergeServers([
      indo("g1", { title: G, duration: 455 }),
      ub("g2", 153),
      indo("g3", { title: G, duration: 455 }),
      indo("g4", { title: G }),
    ]);
    assert.equal(r.blocked[0].why, "duration-differs");
    assert.deepEqual(
      r.groups.map((g) => g.ids),
      [["g1", "g3"]],
    );
    // Many lengths under one common title: nothing to join.
    const V = "Video Bokep Indo Terbaru";
    const v = mergeServers(
      [
        indo("v1", { title: V, duration: 131 }),
        ub("v2", 120),
        indo("v3", { title: V, duration: 115 }),
      ].map((x) => ({ ...x, title: V })),
    );
    assert.equal(v.groups.length, 0);
  });

  it("keeps series episodes apart", () => {
    const s = "Kisah Cinta Kampus Mahasiswa Baru Episode";
    const r = mergeServers([
      indo("e1a", { title: `${s} 1` }),
      tape("e1b", { title: `${s} 1` }),
      indo("e2a", { title: `${s} 2` }),
      tape("e2b", { title: `${s} 2` }),
    ]);
    assert.equal(r.groups.length, 2);
    assert.deepEqual(r.groups.map((g) => g.main).sort(), ["e1a", "e2a"]);
  });
});

describe("mergeServers: the same upload sent again (Oct 29 + Oct 30 2026 batches)", () => {
  const lulu = (id: string, title: string, date: string, extra: Record<string, unknown> = {}) => ({
    id,
    title,
    embed: `https://luluvdo.com/e/${id}`,
    date,
    ...extra,
  });
  const tapeD = (id: string, title: string, date: string) => ({
    id,
    title,
    embed: `https://streamtape.com/e/${id}`,
    date,
  });
  const byseD = (id: string, title: string, date: string, extra: Record<string, unknown> = {}) => ({
    id,
    title,
    source: "byse",
    embed: `https://byse.example/e/${id}`,
    date,
    ...extra,
  });
  const S = "Remake Brave New World Episode 2 - koleksidrpinguin.com";

  it("joins every copy of both multi-host uploads into one page, the oldest main stays main", () => {
    const r = mergeServers([
      lulu("lu-old", S, "2026-10-29"),
      tapeD("st-old", S, "2026-10-29"),
      byseD("by-old", S, "2026-10-29"),
      lulu("lu-new", S, "2026-10-30"),
      tapeD("st-new", S, "2026-10-30"),
      byseD("by-new", S, "2026-10-30"),
    ]);
    assert.equal(r.groups.length, 1);
    assert.equal(r.groups[0].main, "lu-old");
    assert.deepEqual(r.groups[0].ids, ["lu-old", "lu-new", "st-old", "st-new", "by-old", "by-new"]);
  });

  it("a second copy on one host from the same upload joins as another server", () => {
    const F = "Penjaga Malam Feng Agung 2 Versi Modifikasi - koleksidrpinguin.com";
    const r = mergeServers([
      lulu("lu-a", F, "2026-10-30"),
      tapeD("st-a", F, "2026-10-30"),
      byseD("by-a", F, "2026-10-30"),
      byseD("by-b", F, "2026-10-30", { poster: "https://img.example/b.jpg" }),
    ]);
    assert.equal(r.groups.length, 1);
    assert.deepEqual(r.groups[0].ids, ["lu-a", "st-a", "by-a", "by-b"]);
  });

  it("one host on two days joins with both copies", () => {
    const H = "Acesher Hijab Ngentot di Hotel Mewah";
    const r = mergeServers([
      tapeD("t1", H, "2026-10-02"),
      tapeD("t2", H, "2026-10-03"),
      byseD("by-1", H, "2026-10-29"),
    ]);
    assert.equal(r.groups.length, 1);
    assert.deepEqual(r.groups[0].ids, ["t1", "t2", "by-1"]);
  });

  it("titles that differ only in case, brackets, apostrophes, '&' or a final dot are one video", () => {
    const pairs: Array<[string, string]> = [
      [
        "[Ailin] Haremku di Benua Douluo Bab 1 (Kisah Ning Rongrong)",
        "Ailin Haremku di Benua Douluo Bab 1 Kisah Ning Rongrong",
      ],
      ["There's a Bitch Next Door Episode 2", "Theres A Bitch Next Door Episode 2"],
      [
        "Little White Flower & The Landlady's Female Tenant Episode 1",
        "Little White Flower The Landladys Female Tenant Episode 1",
      ],
      [
        "Saudari saya menyerahkan dirinya kepada saya demi uang.",
        "Saudari Saya Menyerahkan Dirinya Kepada Saya Demi Uang",
      ],
      [
        "Kisah Hantu Dinasti Tang (Versi Modifikasi) Episode 1",
        "Kisah Hantu Dinasti Tang Versi Modifikasi Episode 1",
      ],
    ];
    for (const [a, b] of pairs) {
      const r = mergeServers([
        lulu("x1", `${a} - koleksidrpinguin.com`, "2026-10-30"),
        byseD("x2", `${b} - koleksidrpinguin.com`, "2026-10-30"),
      ]);
      assert.equal(r.groups.length, 1, a);
    }
  });

  it("keeps 'Anime Hentai (7)' twice with no duration apart (two different files)", () => {
    const A = "Anime Hentai (7) - koleksidrpinguin.com";
    const r = mergeServers([lulu("a1", A, "2026-10-27"), lulu("a2", A, "2026-10-27")]);
    assert.equal(r.groups.length, 0);
  });

  it("never joins different episodes or numbers: 1 - 2 / 1 2 vs 1-2 / 12, Feng Agung 2 vs 3", () => {
    const P = "Pasangan Seks Saya Seorang Dokter Kandungan Episode";
    const r = mergeServers([
      lulu("p12a", `${P} 1 - 2`, "2026-10-30"),
      tapeD("p12b", `${P} 1 2`, "2026-10-30"),
      byseD("p12c", `${P} 1-2`, "2026-10-30"),
      tapeD("p12x", `${P} 12`, "2026-10-29"),
      lulu("p10", `${P} 10`, "2026-10-30"),
      tapeD("p1", `${P} 1`, "2026-10-30"),
      lulu("f2", "Penjaga Malam Feng Agung 2 Versi Modifikasi", "2026-10-30"),
      tapeD("f3", "Penjaga Malam Feng Agung 3 Versi Modifikasi", "2026-10-30"),
      lulu("h1", "Cinta di Halaman 1 2 Versi Modifikasi", "2026-10-30"),
      tapeD("h12", "Cinta di Halaman 12 Versi Modifikasi", "2026-10-30"),
    ]);
    assert.deepEqual(
      r.groups.map((g) => g.ids.slice().sort()),
      [["p12a", "p12b", "p12c"]],
    );
    // "1 - 2", "1 2" and "1-2" are one episode range; 12, 10, 1 and the other series stay apart.
  });
});

describe("multiServerFrom", () => {
  it("maps every merged copy to its main and keeps the copy itself", () => {
    const items = [tape("old1", { createdAt: 1 }), indo("new1", { createdAt: 2 })];
    const m = multiServerFrom(items, mergeServers(items).groups);
    assert.equal(m.mainOf.get("old1"), "new1");
    assert.equal(m.mainOf.has("new1"), false);
    assert.deepEqual(m.servers.get("new1"), ["new1", "old1"]);
    assert.equal(m.away.get("old1"), items[0]);
  });
});

describe("borrowedPosters", () => {
  const thumb = (it: object) => String((it as { poster?: unknown }).poster || "");
  it("gives a main page without a poster the poster of the first other copy that has one", () => {
    const items = [
      byse("by-old", { createdAt: 1 }),
      tape("t1", { createdAt: 2 }),
      tape("t2", { createdAt: 3, title: "Lain Sekali Judulnya Sampai Panjang" }),
    ];
    const items2 = [
      indo("main1", { createdAt: 9 }),
      byse("by-a", { createdAt: 1, poster: "https://img.example/a.jpg" }),
      tape("t3", { createdAt: 2, poster: "https://img.example/t.jpg" }),
    ];
    const all = [
      ...items,
      ...items2.map((x) => ({ ...x, title: "Tante Cantik Pulang Kerja Langsung Main" })),
    ];
    const groups = mergeServers(all).groups;
    const got = borrowedPosters(all, groups, thumb);
    // Byse main (oldest, no IndoAV copy) has no poster and neither does t1: nothing to borrow.
    assert.equal(got.has("by-old"), false);
    // IndoAV main with no poster: Streamtape comes before Byse in server order.
    assert.equal(got.get("main1"), "https://img.example/t.jpg");
  });
  it("keeps a main page's own poster and skips our own api urls", () => {
    const items = [
      indo("m", { createdAt: 1, poster: "https://img.example/own.jpg" }),
      tape("t", { createdAt: 2, poster: "https://img.example/t.jpg" }),
    ];
    assert.equal(borrowedPosters(items, mergeServers(items).groups, thumb).size, 0);
    const items2 = [
      indo("m2", { createdAt: 1 }),
      tape("t2", { createdAt: 2, poster: "https://koleksidrpinguin.com/api/puterin-thumb?id=t2" }),
    ];
    assert.equal(borrowedPosters(items2, mergeServers(items2).groups, thumb).size, 0);
  });
});

describe("applyManualMerges", () => {
  it("joins copies with different titles into one page; the IndoAV copy is main even when newer", () => {
    const items = [
      byse("byse1", { title: "Raja Episode 1", createdAt: 1000 }),
      tape("tape1", { title: "Raja Eps 1 full", createdAt: 2000 }),
      indo("indo1", { title: "Raja 1", createdAt: 4000 }),
      byse("other", { title: "Lain Lagi Sama Sekali", createdAt: 500 }),
    ];
    const groups = applyManualMerges(items, [], { merges: [["byse1", "tape1", "indo1", "gone1"]], splits: [] });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].main, "indo1");
    assert.deepEqual([...groups[0].ids].sort(), ["byse1", "indo1", "tape1"]);
    const ms = multiServerFrom(items, groups);
    assert.equal(ms.servers.get("indo1")?.length, 3);
    assert.equal(ms.mainOf.get("byse1"), "indo1");
    assert.equal(ms.mainOf.has("other"), false);
  });

  it("without an IndoAV copy the oldest is main; the same host twice is allowed", () => {
    const items = [byse("b-new", { createdAt: 5000 }), byse("b-old", { createdAt: 1000 }), tape("t-mid", { createdAt: 3000 })];
    const [g] = applyManualMerges(items, [], { merges: [["b-new", "b-old", "t-mid"]], splits: [] });
    assert.equal(g.main, "b-old");
    assert.equal(g.ids.length, 3);
  });

  it("absorbs an automatic group it touches, and splits undo an automatic group", () => {
    const items = [indo("i1", { createdAt: 1 }), tape("t1", { createdAt: 2 }), byse("b9", { title: "Judul Beda Total", createdAt: 3 })];
    const auto = mergeServers(items).groups;
    assert.equal(auto.length, 1);
    const joined = applyManualMerges(items, auto, { merges: [["t1", "b9"]], splits: [] });
    assert.equal(joined.length, 1);
    assert.deepEqual([...joined[0].ids].sort(), ["b9", "i1", "t1"]);
    assert.equal(joined[0].main, "i1");
    assert.equal(applyManualMerges(items, auto, { merges: [], splits: ["i1", "t1"] }).length, 0);
    assert.deepEqual(applyManualMerges(items, auto, { merges: [], splits: [] }), auto);
  });

  it("borrowedTitles gives a generic-titled main the real title of a copy", () => {
    const items = [indo("i2", { title: "Video", createdAt: 1 }), tape("t2", { title: "Raja Episode 1 Asli", createdAt: 2 })];
    const groups = applyManualMerges(items, [], { merges: [["i2", "t2"]], splits: [] });
    assert.equal(groups[0].main, "i2");
    assert.equal(borrowedTitles(items, groups).get("i2"), "Raja Episode 1 Asli");
  });
});

describe("mergeServers with MXDrop file-name titles", () => {
  it("joins an MXDrop copy titled like a file name with the Lulu and Dood copies", () => {
    const r = mergeServers([
      { id: "lu-a", title: "STEPFATHERS CUM INSIDE ME - koleksidrpinguin.com", embed: "https://luluvdo.com/e/a", source: "LuluStream", createdAt: 1 },
      { id: "dd-b", title: "! STEPFATHERS CUM INSIDE ME - koleksidrpinguin.com", embed: "https://playmogo.com/e/b", source: "DoodStream", createdAt: 2 },
      { id: "mx-c", title: "! STEPFATHERS CUM INSIDE ME.mp4 - koleksidrpinguin.com", embed: "https://mxdrop.sx/e/c", source: "MXDrop", createdAt: 3 },
    ]);
    assert.equal(r.groups.length, 1);
    assert.deepEqual(r.groups[0].hosts, ["LuluStream", "DoodStream", "MXDrop"]);
  });
});

const lulu = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  source: "LuluStream",
  embed: `https://lplaygo.com/e/${id}`,
  ...extra,
});
const mxdrop = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  source: "MXDrop",
  embed: `https://mxdrop.sx/e/${id}`,
  ...extra,
});
const vidara = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  source: "Vidara",
  embed: `https://vidara.to/e/${id}`,
  ...extra,
});

describe("mergeServers: short series and multi-host titles", () => {
  const suffix = " - koleksidrpinguin.com";

  it("treats a compact Episode title as a series key, not a short title", () => {
    const a = mergeKeyOf({
      id: "lu-1",
      title: `Bai Jie Episode 1${suffix}`,
      source: "LuluStream",
      embed: "https://lplaygo.com/e/1",
    });
    const b = mergeKeyOf({
      id: "by-1",
      title: `Bai Jie Episode 1${suffix}`,
      source: "Byse",
      embed: "https://bysejikuar.com/e/1",
    });
    assert.equal(a.why, "series");
    assert.equal(a.key, b.key);
    assert.equal(a.key, "m:baijie#1.0");
    assert.notEqual(
      a.key,
      mergeKeyOf({
        id: "lu-2",
        title: `Bai Jie Episode 2${suffix}`,
        source: "LuluStream",
        embed: "https://lplaygo.com/e/2",
      }).key,
    );
  });

  it("folds every host copy of one short episode into a single page, and keeps other episodes apart", () => {
    const items = [];
    for (const ep of [1, 2]) {
      const title = `Bai Jie Episode ${ep}${suffix}`;
      items.push(
        byse(`by-${ep}`, { title, date: "2026-11-27" }),
        mxdrop(`mx-${ep}`, { title, date: "2026-11-27" }),
        lulu(`lu-${ep}`, { title, date: "2026-11-27" }),
        vidara(`vd-${ep}`, { title, date: "2026-11-27" }),
      );
    }
    const r = mergeServers(items);
    assert.equal(r.groups.length, 2);
    const byMain = new Map(r.groups.map((g) => [g.main, g]));
    // Oldest copy is main; Lulu ranks before MXDrop/Vidara/Byse when dates are equal.
    const ep1 = [...byMain.values()].find((g) => g.ids.includes("lu-1"));
    const ep2 = [...byMain.values()].find((g) => g.ids.includes("lu-2"));
    assert.ok(ep1 && ep2);
    assert.equal(ep1.ids.length, 4);
    assert.equal(ep2.ids.length, 4);
    assert.deepEqual(new Set(ep1.hosts).size, 4);
    assert.ok(ep1.hosts.includes("LuluStream"));
    assert.ok(ep1.hosts.includes("Byse"));
    assert.ok(ep1.hosts.includes("MXDrop"));
    assert.ok(ep1.hosts.includes("Vidara"));
    assert.equal(new Set([...ep1.ids, ...ep2.ids]).size, 8);
  });

  it("folds a 40-episode short series into 40 pages, then seriesIndex lists episodes 1-40 in order", () => {
    const items = [];
    for (let ep = 1; ep <= 40; ep++) {
      const title = `Bai Jie Episode ${ep}${suffix}`;
      items.push(
        byse(`by-${ep}`, { title, date: "2026-11-27", category: "ai-plus" }),
        mxdrop(`mx-${ep}`, { title, date: "2026-11-27", category: "ai-plus" }),
        lulu(`lu-${ep}`, { title, date: "2026-11-27", category: "ai-plus" }),
        vidara(`vd-${ep}`, { title, date: "2026-11-27", category: "ai-plus" }),
      );
    }
    const r = mergeServers(items);
    assert.equal(r.groups.length, 40);
    assert.equal(r.blocked.length, 0);
    const mains = r.groups.map((g) => ({ id: g.main, title: items.find((it) => it.id === g.main)?.title }));
    const idx = seriesIndex(mains);
    const key = idx.byId.get("lu-1") || idx.byId.get(r.groups.find((g) => g.ids.includes("lu-1"))?.main || "");
    assert.ok(key);
    const ids = idx.groups.get(key) || [];
    assert.equal(ids.length, 40);
    const eps = ids.map((id) => Number(/Episode (\d+)/.exec(mains.find((m) => m.id === id)?.title || "")?.[1]));
    assert.deepEqual(eps, Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it("joins a short non-episode title across hosts without duration, and leaves same-host copies apart", () => {
    const title = `Enak Gak Sayang${suffix}`;
    const multi = mergeServers([
      vidara("vd-a", { title, date: "2026-11-01" }),
      lulu("lu-a", { title, date: "2026-11-01" }),
      byse("by-a", { title, date: "2026-11-01" }),
    ]);
    assert.equal(multi.groups.length, 1);
    assert.equal(multi.groups[0].ids.length, 3);
    const same = mergeServers([
      lulu("lu-1", { title: "Anime Hentai (7)" + suffix, date: "2026-10-27" }),
      lulu("lu-2", { title: "Anime Hentai (7)" + suffix, date: "2026-10-27" }),
    ]);
    assert.equal(same.groups.length, 0);
    assert.equal(same.blocked[0].why, "short-no-duration");
  });
});
