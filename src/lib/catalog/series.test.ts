import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { episodeLabel, parseSeries, seriesIndex } from "./series.ts";

const key = (t: string) => parseSeries(t)?.key;
const ep = (t: string) => parseSeries(t)?.ep;

describe("parseSeries", () => {
  it("joins an episode marker glued to the previous word", () => {
    const a = "Perangkap Tentara TerakotaEpisode 2 - koleksidrpinguin.com";
    const b = "Perangkap Tentara Terakota Episode 4 - koleksidrpinguin.com";
    assert.equal(key(a), key(b));
    assert.equal(ep(a), 2);
    assert.equal(ep(b), 4);
  });

  it("accepts marker variants, leading zeros, case, spacing and tail noise", () => {
    const base = key("Judul Drama Episode 1");
    for (const [t, n] of [
      ["Judul Drama EP02", 2],
      ["judul drama eps. 3", 3],
      ["Judul Drama Ep.04 | KoleksiDrPinguin", 4],
      ["Judul DramaEps 5", 5],
      ["Judul  Drama - Part #6 HD", 6],
      ["JUDUL DRAMA bagian 7 [Sub Indo]", 7],
      ["Judul Drama Episode 8 【中文字幕】", 8],
      ["Judul Drama Episode 9 End", 9],
      ["Judul Drama Epiose 10", 10],
    ] as const) {
      assert.equal(key(t), base, t);
      assert.equal(ep(t), n, t);
    }
  });

  it("reads S01E02 codes and keeps the season in the key", () => {
    assert.equal(ep("Yani Neko S01E03 – Yani Neko Episode 3"), 3);
    assert.equal(key("Yani Neko S01E03 – Yani Neko Episode 3"), key("Yani Neko S01E07 – Yani Neko Episode 7"));
    assert.notEqual(key("Show S01E01"), key("Show S02E01"));
    assert.equal(ep("Jojo Part 3 Stardust S01E25 – Jojo Part 3 Stardust Episode 25"), 25);
  });

  it("reads CJK episode markers", () => {
    assert.equal(key("霸道总裁 第2集"), key("霸道总裁 第3集"));
    assert.equal(ep("霸道总裁 第3集"), 3);
  });

  it("does not merge merely similar titles", () => {
    assert.notEqual(key("Cerita Tante Ena Episode 1"), key("Cerita Tante Ina Episode 2"));
    assert.notEqual(key("Judul Episode 1"), key("Judul Lain Episode 2"));
  });

  it("ignores numbers that are not episodes", () => {
    for (const t of ["Agent 007", "Video 720p", "Judul Episode 100", "Judul Episode 4K", "Judul Part 5x", "ABP-123"]) {
      assert.equal(parseSeries(t), null, t);
    }
    // "Weekend" is a word, not the "End" tag.
    assert.equal(key("Weekend Seru Episode 1"), key("Weekend Seru Episode 2 End"));
    assert.equal(key("Apartemen Mewah Part 1"), "m:apartemenmewah");
  });
});

describe("seriesIndex", () => {
  it("groups glued and spaced episode titles together", () => {
    const items = [
      ["a", "Perangkap Tentara TerakotaEpisode 1 - koleksidrpinguin.com"],
      ["b", "Perangkap Tentara TerakotaEpisode 2 - koleksidrpinguin.com"],
      ["c", "Perangkap Tentara Terakota Episode 3 - koleksidrpinguin.com"],
      ["d", "Perangkap Tentara Terakota Episode 4 - koleksidrpinguin.com"],
      ["e", "Perangkap Tentara Lain Episode 1 - koleksidrpinguin.com"],
    ].map(([id, title]) => ({ id, title, category: "bokep" }));
    const idx = seriesIndex(items);
    const k = idx.byId.get("a");
    assert.ok(k);
    assert.deepEqual([...(idx.groups.get(k!) || [])].sort(), ["a", "b", "c", "d"]);
    assert.equal(idx.byId.get("e"), undefined);
  });
});

describe("episode ranges", () => {
  const B = "Pasangan Seks Saya Seorang Dokter Kandungan ";
  const S = " - koleksidrpinguin.com";
  const info = (e: string) => {
    const s = parseSeries(`${B}${e}${S}`);
    return s ? `${s.key}#${s.ep}.${s.sub}` : null;
  };

  it("never reads a range as 12, or 12 as a range", () => {
    assert.match(info("Episode 12") || "", /#12\.0$/);
    for (const e of ["Episode 1-2", "Episode 1- 2", "Episode 1 -2", "Episode 1 - 2"]) {
      assert.match(info(e) || "", /#1\.2$/, e);
      assert.notEqual(info(e), info("Episode 12"), e);
    }
    // A range is its own merge key: never the same page as Episode 1, 2, 3 or 12.
    for (const e of ["Episode 1", "Episode 2", "Episode 3", "Episode 12"]) assert.notEqual(info("Episode 1 - 2"), info(e), e);
  });

  it("labels a chip as a range only when a dash is written", () => {
    assert.equal(episodeLabel(`${B}Episode 1 - 2${S}`, 1), "1 - 2");
    assert.equal(episodeLabel(`${B}Episode 1-2${S}`, 1), "1 - 2");
    assert.equal(episodeLabel(`${B}Episode 1- 2${S}`, 1), "1 - 2");
    assert.equal(episodeLabel("AI drama China Kebangkitan paman EP1-2 di dapur", 1), "1 - 2");
    assert.equal(episodeLabel(`${B}Episode 12${S}`, 12), "12");
    assert.equal(episodeLabel(`${B}Episode 1 2${S}`, 1), "1"); // ambiguous, no dash: left alone
    assert.equal(episodeLabel(`${B}Episode 3${S}`, 3), "3");
    assert.equal(episodeLabel("Judul Episode 2-1", 2), "2"); // second number not bigger
  });
});
