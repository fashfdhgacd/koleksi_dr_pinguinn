import assert from "node:assert/strict";
import test from "node:test";
import {
  SITE_ORIGIN,
  decideWatchPlaceholder,
  decisionResponse,
} from "../server/lib/watch-placeholder-decide.ts";

test("hidden or blocked /v and /watch ids 302 to the homepage with noindex", () => {
  for (const path of ["/v/gYpO014jGQHqWPj", "/watch/gYpO014jGQHqWPj"]) {
    const d = decideWatchPlaceholder(path, "GET", "", { targetHidden: true, main: null });
    assert.equal(d.type, "redirect");
    assert.equal(d.status, 302);
    assert.equal(d.location, `${SITE_ORIGIN}/`);
    assert.equal(d.robots, "noindex, nofollow");
    assert.equal(d.cacheControl, "public, max-age=3600");
    const res = decisionResponse(d);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), `${SITE_ORIGIN}/`);
    assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(res.body, null);
  }
});

test("a merged alias 301s to the live main even if the alias itself was hidden", () => {
  const d = decideWatchPlaceholder("/v/aliasCopy01", "GET", "", {
    targetHidden: false,
    main: "liveMain01",
  });
  assert.equal(d.type, "redirect");
  assert.equal(d.status, 301);
  assert.equal(d.location, `${SITE_ORIGIN}/watch/liveMain01`);
  assert.equal(d.robots, undefined);
});

test("a merge into a hidden main stays off /watch and goes home", () => {
  const d = decideWatchPlaceholder("/watch/aliasCopy01", "GET", "", {
    targetHidden: true,
    main: "hiddenMain01",
  });
  assert.equal(d.type, "redirect");
  assert.equal(d.status, 302);
  assert.equal(d.location, `${SITE_ORIGIN}/`);
  assert.equal(d.robots, "noindex, nofollow");
});

test("a live id is left to the page", () => {
  const d = decideWatchPlaceholder("/v/5HOqca3JuYVd", "GET", "", {
    targetHidden: false,
    main: "5HOqca3JuYVd",
  });
  assert.equal(d.type, "next");
});

test("leaked router templates send the visitor into the site, not a bare Gone body", () => {
  const watch = decideWatchPlaceholder("/watch/$id", "GET");
  assert.equal(watch.type, "redirect");
  assert.equal(watch.status, 302);
  assert.equal(watch.location, `${SITE_ORIGIN}/`);
  const cat = decideWatchPlaceholder("/kategori/$slug", "GET");
  assert.equal(cat.type, "redirect");
  assert.equal(cat.status, 302);
  assert.equal(cat.location, `${SITE_ORIGIN}/kategori`);
  assert.equal(cat.robots, "noindex, nofollow");
});

test("trailing slash still 301s to the clean path", () => {
  const d = decideWatchPlaceholder("/kategori/umum/", "GET", "?x=1");
  assert.equal(d.type, "redirect");
  assert.equal(d.status, 301);
  assert.equal(d.location, `${SITE_ORIGIN}/kategori/umum?x=1`);
});

test("unknown or not-yet-looked-up ids fall through so /watch can render its 404 page", () => {
  assert.equal(decideWatchPlaceholder("/watch/unknownId99", "GET").type, "next");
  assert.equal(decideWatchPlaceholder("/v/unknownId99", "GET", "", null).type, "next");
});
