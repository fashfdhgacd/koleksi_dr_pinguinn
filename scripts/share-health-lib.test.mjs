import assert from "node:assert/strict";
import test from "node:test";
import { isSameOrigin, ogImageOf, requiredSitemapPaths, shareImageProblem, sniffMagic } from "./lib/share-health-lib.mjs";

const html = `
<meta property="og:image" content="https://koleksidrpinguin.com/og/9yMfGMDRKJKo.jpg"/>
<meta property="og:image:type" content="image/jpeg"/>
<meta name="twitter:image" content="https://koleksidrpinguin.com/og/9yMfGMDRKJKo.jpg"/>
<meta name="twitter:card" content="summary_large_image"/>
`;

test("ogImageOf reads og and twitter image tags", () => {
  const og = ogImageOf(html);
  assert.equal(og.og, "https://koleksidrpinguin.com/og/9yMfGMDRKJKo.jpg");
  assert.equal(og.twitter, "https://koleksidrpinguin.com/og/9yMfGMDRKJKo.jpg");
  assert.equal(og.type, "image/jpeg");
});

test("shareImageProblem flags external hosts, missing meta, and non-jpeg", () => {
  const origin = "https://koleksidrpinguin.com";
  const pageUrl = "https://koleksidrpinguin.com/watch/9yMfGMDRKJKo";
  assert.equal(
    shareImageProblem({
      pageUrl,
      origin,
      og: ogImageOf(html),
      imageStatus: 200,
      imageType: "image/jpeg",
      imageBytes: 2000,
      sniff: "jpeg",
    }),
    "",
  );
  const ext = ogImageOf(`<meta property="og:image" content="https://a.embedan.com/image/x.webp"/>`);
  assert.match(shareImageProblem({ pageUrl, origin, og: ext, imageStatus: 200, imageType: "image/jpeg", sniff: "webp" }), /external host/);
  assert.match(shareImageProblem({ pageUrl, origin, og: {}, imageStatus: 0 }), /missing og:image/);
  assert.match(
    shareImageProblem({
      pageUrl,
      origin,
      og: ogImageOf(html),
      imageStatus: 200,
      imageType: "image/webp",
      imageBytes: 2000,
      sniff: "webp",
    }),
    /not JPEG/,
  );
  assert.equal(isSameOrigin("https://koleksidrpinguin.com/og/x.jpg", origin), true);
  assert.equal(isSameOrigin("https://a.embedan.com/x.webp", origin), false);
  assert.equal(sniffMagic(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "jpeg");
  assert.ok(requiredSitemapPaths().includes("/cari/bokep-indoav-terbaru"));
});

import { readFileSync } from "node:fs";

test("watch pages and seoVideoThumbnail point at same-origin /og/<id>.jpg", () => {
  const seo = readFileSync(new URL("../src/lib/seo.ts", import.meta.url), "utf8");
  const watch = readFileSync(new URL("../src/routes/watch.$id.tsx", import.meta.url), "utf8");
  assert.match(seo, /\/og\/\$\{encodeURIComponent\(idClean\)\}\.jpg/);
  assert.match(watch, /seoVideoThumbnail\(item\.id/);
  assert.doesNotMatch(watch, /shareCardImage\(/);
});
