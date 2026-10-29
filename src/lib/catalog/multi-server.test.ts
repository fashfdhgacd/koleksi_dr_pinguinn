import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeServers, multiServerFrom, serverHostOf } from "./multi-server.ts";

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
    const r = mergeServers([tape("old1", { createdAt: 1000 }), indo("new1", { createdAt: 5000 }), byse("by-x", { createdAt: 3000 })]);
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

  it("never merges Videy, short titles, or one host alone", () => {
    const videy = { id: "v1", title: T, embed: "https://videy.co/e/v1" };
    assert.equal(mergeServers([videy, tape("t1")]).groups.length, 0);
    assert.equal(mergeServers([tape("s1", { title: "Cewek Kos" }), indo("s2", { title: "Cewek Kos" })]).groups.length, 0);
    assert.equal(mergeServers([tape("t1"), tape("t2")]).groups.length, 0);
  });

  it("blocks a group whose durations differ or that has one host twice with other lengths", () => {
    const far = mergeServers([indo("i1", { duration: 600 }), tape("t1", { duration: 1200 })]);
    assert.equal(far.groups.length, 0);
    assert.equal(far.blocked[0].why, "duration-differs");
    const twice = mergeServers([indo("i1", { duration: 600 }), tape("t1", { duration: 600 }), tape("t2", { duration: 610 })]);
    assert.equal(twice.groups.length, 0);
    assert.equal(twice.blocked[0].why, "host-twice");
    const close = mergeServers([indo("i1", { duration: 600 }), tape("t1", { duration: 615 })]);
    assert.equal(close.groups.length, 1);
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
