import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bysePosterUrls,
  fileCode,
  hostKind,
  includeItem,
  isDeadPosterUrl,
  jpegTooFlat,
  luluPosterUrls,
  metaImage,
  mxdropFromHtml,
  playlistSegments,
  posterRank,
  segmentPicks,
  typedPosterKey,
  unpackDean,
  workerCanResolve,
} from "../src/lib/poster-sources.js";

const MX_PACKED = `eval(function(p,a,c,k,e,d){e=function(c){return c};if(!''.replace(/^/,String)){while(c--){d[c]=k[c]||c}k=[function(e){return d[e]}];e=function(){return'\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c])}}return p}('1.33="//2.7.6/32/5.31";1.30=" ";1.29="//2.7.6/28/5.4?27=26-25&24=23&22=21";',10,34,'|MDCore|q2dgt5pce|2F|mp4|033vl48juj9jlg|net|mxcontent|true|blockAB|com|2Fkoleksidrpinguin|3A|https|referrer|adTagUrl|chromeInject|remotesub|vserver|4905ff9a8099b148fe6b2ba95c969398|vfile|1794680785|_t|1794692955|e|ge99CVsBQ|3J3w0pHMYByw|s|v2|wurl|furl|jpg|thumbs|poster'.split('|'),0,{}))`;

test("MXDrop unpack yields the thumbs jpg, not the packed tokens", () => {
  const got = mxdropFromHtml(MX_PACKED);
  assert.equal(got.poster, "https://q2dgt5pce.mxcontent.net/thumbs/033vl48juj9jlg.jpg");
  assert.match(got.file, /^https:\/\/q2dgt5pce\.mxcontent\.net\/v2\/033vl48juj9jlg\.mp4\?/);
  assert.equal(unpackDean("no packer"), "");
});

test("dead anipop posters are not treated as a source", () => {
  assert.equal(isDeadPosterUrl("https://static.anipop.xyz/poster/video/EMRhhgcaBJ.jpg"), true);
  assert.equal(isDeadPosterUrl("https://img.lulucdn.com/abc_xt.jpg"), false);
  assert.equal(isDeadPosterUrl(""), false);
});

test("vidara and dood pages expose og:image", () => {
  const vidara = `<meta property="og:image" content="https://m996yefd.s1q2105.com/thumbnail/adQunTMOEx/qxg3295JKsE49.jpg">`;
  assert.equal(metaImage(vidara), "https://m996yefd.s1q2105.com/thumbnail/adQunTMOEx/qxg3295JKsE49.jpg");
  assert.equal(metaImage(`<meta property="og:image" content="https://imgds.net/splash/pxwao2ehzda2m047.jpg">`), "https://imgds.net/splash/pxwao2ehzda2m047.jpg");
  assert.equal(metaImage(`<meta property="og:image" content="https://cdn.example/logo.png">`), "");
});

test("typed R2 key and prefix resolvers", () => {
  assert.equal(typedPosterKey("mx-033vl48juj9jlg"), "posters/typed/mx-033vl48juj9jlg");
  assert.equal(typedPosterKey("bad id!"), "posters/typed/badid");
  assert.equal(workerCanResolve("mx-033vl48juj9jlg"), true);
  assert.equal(workerCanResolve("g117kfjz"), false);
  assert.deepEqual(luluPosterUrls("abc12345"), ["https://img.lulustream.co/abc12345_xt.jpg", "https://img.lulustream.co/abc12345.jpg"]);
  assert.deepEqual(bysePosterUrls("wq1qy2midnle").length, 2);
});

test("HLS playlist lines become absolute segment URLs", () => {
  const text = "#EXTM3U\n#EXTINF:6,\n//low.example/storage/abc/seg0\n#EXTINF:6,\n//low.example/storage/abc/seg1\n#EXTINF:6,\n//low.example/storage/abc/seg2\n";
  const segs = playlistSegments(text, "https://puterin.biz/api/hls?t=1");
  assert.deepEqual(segs, [
    "https://low.example/storage/abc/seg0",
    "https://low.example/storage/abc/seg1",
    "https://low.example/storage/abc/seg2",
  ]);
  assert.equal(segmentPicks(segs)[0], segs[2]);
});

test("priority puts newest mx/dd/vidara ahead of older IndoAV, and skips safety holds", () => {
  const mx = { id: "mx-aaaabbbb", source: "MXDrop", embed: "https://mxdrop.sx/e/aaaabbbb", date: "2026-11-01" };
  const indo = { id: "indo1", source: "IndoAV", embed: "https://tv1.indoav.app/e/indo1", updated_at: "2026-11-13" };
  const g1 = { id: "g117kfjz", source: "vidara.to", embed: "https://vidara.to/e/qxg3295JKsE49", hidden: true, hidden_reason: "embed-review" };
  const school = { id: "school1", source: "IndoAV", embed: "https://tv1.indoav.app/e/school1", hidden: true, hidden_reason: "school" };
  assert.ok(posterRank(mx).band < posterRank(indo).band);
  assert.equal(hostKind(g1), "vidara");
  assert.equal(includeItem(g1), true);
  assert.equal(includeItem(school), false);
  assert.equal(includeItem({ id: "vy1", source: "Videy", embed: "https://cdn.videy.co/vy1.mp4" }), false);
  assert.equal(fileCode(g1), "qxg3295JKsE49");
  assert.equal(jpegTooFlat(new Uint8Array([0, 1, 2])), false);
});
