import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANDINGS, findLanding, hasBannedWord, wordCount } from "./landing.ts";

const categorySlugs = new Set(
  [...readFileSync(new URL("./categories.ts", import.meta.url), "utf8").matchAll(/slug: "([a-z0-9-]+)"/g)].map((m) => m[1]),
);

describe("search landing allowlist", () => {
  it("has unique slugs, H1s and titles", () => {
    for (const key of ["slug", "h1", "title"] as const) {
      const vals = LANDINGS.map((l) => l[key].toLowerCase());
      assert.equal(new Set(vals).size, vals.length, `duplicate ${key}`);
    }
  });

  it("uses url-safe slugs mapped to existing categories", () => {
    for (const l of LANDINGS) {
      assert.match(l.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(categorySlugs.has(l.category), `${l.slug}: unknown category ${l.category}`);
      assert.ok(!["teen-18", "college-18"].includes(l.category), `${l.slug}: noindex category`);
      assert.equal(findLanding(l.slug), l);
    }
  });

  it("keeps intros at 80-120 words", () => {
    for (const l of LANDINGS) {
      const n = wordCount(l.intro);
      assert.ok(n >= 80 && n <= 120, `${l.slug}: ${n} words`);
    }
  });

  it("never contains banned minor / non-consent words", () => {
    for (const l of LANDINGS) {
      for (const text of [l.slug.replace(/-/g, " "), l.h1, l.title, l.description, l.intro, ...l.queries]) {
        assert.equal(hasBannedWord(text), false, `${l.slug}: ${text}`);
      }
    }
  });

  it("flags banned words on word boundaries", () => {
    for (const t of ["Video ABG", "anak SMA", "Bocil", "video bocor", "kesebar di grup", "direkam diam", "skandal kantor", "pelajar"]) {
      assert.equal(hasBannedWord(t), true, t);
    }
    for (const t of ["Tante STW", "Bokep amatir", "Rekaman rumahan", "Pasangan dewasa"]) {
      assert.equal(hasBannedWord(t), false, t);
    }
  });
});
