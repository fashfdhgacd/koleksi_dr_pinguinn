import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { overviewCopy } from "./overview-copy.ts";
import { canonicalHref, hreflangAlternates, listingDocument, pageSuffix } from "./listing-head.ts";

const ORIGIN = "https://koleksidrpinguin.com";

function codes(path: string) {
  return hreflangAlternates(path).map((link) => link.hreflang).sort();
}

function hrefs(path: string) {
  return Object.fromEntries(hreflangAlternates(path).map((link) => [link.hreflang, link.href]));
}

describe("paginated listing head", () => {
  it("keeps page 1 overview copy and adds a localized page suffix", () => {
    for (const language of ["id", "ms", "en"] as const) {
      const first = listingDocument("/kategori/malaysia", language, 241);
      const later = listingDocument("/kategori/malaysia/halaman/5", language, 241);
      const overview = overviewCopy("/kategori/malaysia", language, 241);
      assert.ok(first && later && overview);
      assert.equal(first.title, overview.title);
      assert.equal(first.heading, overview.heading);
      assert.equal(first.description, overview.description);
      assert.equal(later.description, first.description);
      assert.equal(later.heading, first.heading + pageSuffix(language, 5));
      assert.equal(later.title, `${later.heading} | Koleksi Dr. Pinguin`);
      assert.equal(later.title.includes("koleksidrpinguin.com"), false);
      assert.doesNotMatch(later.description, /koleksi Koleksi/);
      assert.doesNotMatch(later.title, / · Halaman| · Page/);
    }
    assert.match(listingDocument("/kategori/malaysia/halaman/5", "id", 241)!.title, / – Halaman 5 \| Koleksi Dr\. Pinguin$/);
    assert.match(listingDocument("/kategori/malaysia/halaman/2", "ms", 241)!.title, /^Video Melayu Malaysia Terkini – Halaman 2 \| Koleksi Dr\. Pinguin$/);
    assert.match(listingDocument("/kategori/videy", "id", 630)!.title, /^Bokep Videy Indo Terbaru \| Koleksi Dr\. Pinguin$/);
    assert.equal(listingDocument("/", "ms", 6416)?.title, overviewCopy("/", "ms", 6416)?.title);
    assert.equal(listingDocument("/", "id", 6416)?.title, overviewCopy("/", "id", 6416)?.title);
    assert.equal(listingDocument("/", "en", 6416)?.title, overviewCopy("/", "en", 6416)?.title);
    assert.match(listingDocument("/halaman/2", "id", 6416)!.title, /^Video Bokep Indo Terbaru – Halaman 2 \| Koleksi Dr\. Pinguin$/);
    assert.match(listingDocument("/halaman/2", "ms", 6416)!.title, /^Video Indonesia Terkini – Halaman 2 \| Koleksi Dr\. Pinguin$/);
    assert.match(listingDocument("/halaman/3", "en", 6416)!.title, /^Latest Indonesian Videos – Page 3 \| Koleksi Dr\. Pinguin$/);
  });

  it("uses the page-1 heading for categories without curated overview", () => {
    const id = listingDocument("/kategori/jilbab/halaman/2", "id");
    const ms = listingDocument("/kategori/jilbab/halaman/2", "ms");
    const en = listingDocument("/kategori/jilbab/halaman/2", "en");
    assert.equal(id?.title, "Bokep Jilbab Indo Viral 2026 - Video Hijab Terbaru – Halaman 2 | Koleksi Dr. Pinguin");
    assert.equal(id?.description.startsWith("Halaman 2:"), false);
    assert.equal(ms?.title, "Wanita bertudung – Halaman 2 | Koleksi Dr. Pinguin");
    assert.equal(ms?.description, "Terokai koleksi Wanita bertudung dan pilih video untuk ditonton. Untuk penonton 18 tahun ke atas.");
    assert.equal(en?.title, "Hijab videos – Page 2 | Koleksi Dr. Pinguin");
    assert.equal(listingDocument("/kategori/jilbab", "id"), null);
  });

  it("paginates English and Indonesian keyword listings from their page-1 title", () => {
    const english = listingDocument("/en/malay-indo/halaman/3", "en");
    const indo = listingDocument("/cari/bokep-cewek-malaysia/halaman/3", "id");
    assert.equal(english?.title, "Malay & Indonesian Videos – Page 3 | Koleksi Dr. Pinguin");
    assert.equal(english?.heading, "Malay and Indonesian Videos – Page 3");
    assert.match(english?.description ?? "", /^Malay and Indonesian amateur videos/);
    assert.doesNotMatch(english?.description ?? "", /^Page 3:/);
    assert.equal(indo?.title, "Bokep Cewek Malaysia & Awek Rempit – Halaman 3 | Koleksi Dr. Pinguin");
    assert.equal(listingDocument("/en/malay-indo", "en"), null);
  });

  it("canonicalizes each page to itself on the same locale as page 1", () => {
    assert.equal(canonicalHref("/kategori/malaysia"), `${ORIGIN}/id/kategori/malaysia`);
    assert.equal(canonicalHref("/kategori/malaysia/halaman/5"), `${ORIGIN}/id/kategori/malaysia/halaman/5`);
    assert.equal(canonicalHref("/ms/kategori/malaysia/halaman/2"), `${ORIGIN}/ms/kategori/malaysia/halaman/2`);
    assert.equal(canonicalHref("/id/kategori/malaysia/halaman/5"), `${ORIGIN}/id/kategori/malaysia/halaman/5`);
    assert.equal(canonicalHref("/kategori/jilbab/halaman/2"), `${ORIGIN}/kategori/jilbab/halaman/2`);
    assert.equal(canonicalHref("/en/malay-indo/halaman/3"), `${ORIGIN}/en/malay-indo/halaman/3`);
    assert.equal(canonicalHref("/ms"), `${ORIGIN}/ms`);
    assert.equal(canonicalHref("/id/kategori/videy"), `${ORIGIN}/id/kategori/videy`);
    assert.equal(canonicalHref("/"), `${ORIGIN}/ms`);
  });

  it("emits ms, id, en and x-default on home, category, watch and keyword pages", () => {
    for (const path of ["/", "/ms", "/kategori/malaysia", "/kategori/malaysia/halaman/5", "/ms/kategori/malaysia/halaman/2", "/id/kategori/videy", "/kategori/jilbab/halaman/2", "/en/malay-indo/halaman/3", "/watch/AbC02"]) {
      assert.deepEqual(codes(path), ["en", "id", "ms-MY", "x-default"]);
    }
    const malaysia = hrefs("/kategori/malaysia/halaman/5");
    assert.equal(malaysia.id, `${ORIGIN}/id/kategori/malaysia/halaman/5`);
    assert.equal(malaysia["ms-MY"], `${ORIGIN}/ms/kategori/malaysia/halaman/5`);
    assert.equal(malaysia.en, `${ORIGIN}/en/kategori/malaysia/halaman/5`);
    assert.equal(malaysia["x-default"], malaysia["ms-MY"]);

    const home = hrefs("/ms");
    assert.equal(home["ms-MY"], `${ORIGIN}/ms`);
    assert.equal(home.id, `${ORIGIN}/id`);
    assert.equal(home.en, `${ORIGIN}/en/home`);
    assert.equal(home["x-default"], `${ORIGIN}/ms`);

    const landing = hrefs("/en/malay-indo/halaman/3");
    assert.equal(landing.en, `${ORIGIN}/en/malay-indo/halaman/3`);
    assert.equal(landing.id, `${ORIGIN}/cari/bokep-cewek-malaysia/halaman/3`);
    assert.equal(landing["ms-MY"], `${ORIGIN}/ms/cari/bokep-cewek-malaysia/halaman/3`);
    assert.equal(landing["x-default"], landing["ms-MY"]);

    const watch = hrefs("/watch/AbC02");
    assert.equal(watch.id, `${ORIGIN}/watch/AbC02`);
    assert.equal(watch["ms-MY"], `${ORIGIN}/ms/watch/AbC02`);
    assert.equal(watch.en, `${ORIGIN}/en/watch/AbC02`);
    assert.equal(watch["x-default"], watch["ms-MY"]);
  });

  it("renders the hreflang attribute in lowercase", () => {
    const html = renderToStaticMarkup(createElement("link", { rel: "alternate", href: `${ORIGIN}/ms`, hreflang: "ms-MY" }));
    assert.match(html, /hreflang="ms-MY"/);
    assert.equal(html.includes("hrefLang"), false);
  });
});
