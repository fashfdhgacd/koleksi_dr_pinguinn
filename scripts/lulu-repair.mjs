#!/usr/bin/env node
// One-off repair (2026-11-20), safe to re-run (idempotent):
//  1) LuluStream moved: luluvdo.com + img.lulucdn.com are NXDOMAIN since ~2026-11-16; the same file codes
//     play on lplaygo.com/e/<code> (lulustream.com/e/ 301s there) with posters on img.lulustream.co.
//  2) Lulu uploads since 2026-11-16 arrived as lplaygo.com share links, which the bot did not know, so they
//     were stored as generic "Video g…" rows (category lainnya) and never joined the multi-server page.
//     They become LuluStream rows again (same id, hidden/embed-review flags kept), titled from the
//     public share page <h1>.
//  3) Dood/Byse titles ending "… com - koleksidrpinguin.com" (host file name "… - koleksidrpinguin com").
// Usage: node scripts/lulu-repair.mjs [--no-net]
import fs from "node:fs";
import { createRequire } from "node:module";
import { brandUploadTitle, cleanUploadTitle } from "../src/lib/bot/title-brand.js";
import { LULU_EMBED_HOST, LULU_IMG_HOST, drpCodeFromUrl } from "../src/lib/catalog/drp-hosts.js";

const require = createRequire(import.meta.url);
const chunks = require("./lib/latest-chunks.cjs");
const NO_NET = process.argv.includes("--no-net");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

// 1) host rewrite, string level so every file keeps its own formatting.
const FILES = fs
  .readdirSync("data")
  .filter((f) => f.endsWith(".json"))
  .map((f) => `data/${f}`)
  .concat(["src/lib/catalog/posters.json"]);
let hostFixes = 0;
for (const f of FILES) {
  if (!fs.existsSync(f)) continue;
  const raw = fs.readFileSync(f, "utf8");
  const next = raw
    .replace(/https:\/\/(?:www\.)?luluvdo\.com\//g, () => (hostFixes++, `https://${LULU_EMBED_HOST}/`))
    .replace(/https:\/\/img\.lulucdn\.com\//g, () => (hostFixes++, `https://${LULU_IMG_HOST}/`));
  if (next !== raw) fs.writeFileSync(f, next);
}

async function shareTitle(code) {
  if (NO_NET) return "";
  try {
    const res = await fetch(`https://${LULU_EMBED_HOST}/${code}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) });
    const html = await res.text();
    const m = html.match(/<h1[^>]*>([^<]{3,200})<\/h1>/i);
    return m ? m[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim() : "";
  } catch {
    return "";
  }
}

// 2) + 3) on the videos-latest chunks.
const loaded = chunks.loadChunks("videos-latest");
let converted = 0;
let untitled = 0;
let comFixes = 0;
const STRAY = /\s+com(\s*-\s*koleksidrpinguin\.com)$/i;
for (const c of loaded.chunks) {
  for (const v of c.items) {
    if (!v || typeof v !== "object") continue;
    if (/^(DoodStream|Byse|LuluStream|MXDrop|Vidara)$/.test(String(v.source)) && STRAY.test(String(v.title || ""))) {
      v.title = String(v.title).replace(STRAY, "$1");
      comFixes++;
    }
    const isLplay = /^https?:\/\/(?:www\.)?lplaygo\.com\//i.test(String(v.embed || ""));
    if (!isLplay || v.source === "LuluStream") continue;
    const code = drpCodeFromUrl(v.embed);
    if (!code) continue;
    const h1 = await shareTitle(code);
    const clean = h1 ? cleanUploadTitle(h1) : "";
    if (clean && clean !== "Video") v.title = brandUploadTitle(clean);
    else untitled++;
    v.source = "LuluStream";
    v.embed = `https://${LULU_EMBED_HOST}/e/${code}`;
    v.direct = `https://${LULU_EMBED_HOST}/e/${code}`;
    v.code = code;
    v.category = "bokep";
    v.tags = ["bokep", "lulu", "telegram"];
    if (!v.poster) v.poster = `https://${LULU_IMG_HOST}/${code}_xt.jpg`;
    if (!v.thumbnail) v.thumbnail = v.poster;
    converted++;
  }
}
const changed = chunks.saveChunks(loaded);
console.log(JSON.stringify({ hostFixes, converted, untitled, comFixes, chunksChanged: changed }));
