// Fill catalog posters the hourly/daily jobs skipped.
// URLS_ONLY=1 writes stable image URLs into data/latest-posters.json (no R2, no ffmpeg).
// Otherwise: HEAD posters/typed/<id>, and for each 404 download the host's current poster
// or grab one frame (Putarin HLS / MXDrop mp4, same ffmpeg idea as videy-thumbs).
// Bytes go to R2 via the Cloudflare API (existing CLOUDFLARE_API_TOKEN) or, if that token
// cannot write, POST /thumb/<id> which stores with the Worker R2 binding (PUTARIN_API_KEY
// already on the Worker). No KV. No new Worker env. Never prints secrets.
import { createHash } from "node:crypto";
import { execFile, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { isCloudflareChallenge } from "./lib/thumb-health-http.mjs";
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
} from "../src/lib/poster-sources.js";

const require = createRequire(import.meta.url);
const { loadAll } = require("./lib/latest-chunks.cjs");

const URLS_ONLY = process.env.URLS_ONLY === "1";
const FULL_SCAN = process.env.FULL_SCAN === "1";
const LIMIT = Number(process.env.LIMIT || 0);
const FRAME_CAP = Number(process.env.FRAME_CAP || 0);
const BUDGET_MS = Number(process.env.BUDGET_MS || 0) || Number(process.env.BUDGET_MIN || (URLS_ONLY ? 8 : 18)) * 60_000;
const SITE = "https://koleksidrpinguin.com";
const R2_PUBLIC = "https://img.koleksidrpinguin.com/posters/typed/";
const UA = "koleksidrpinguin-poster-backfill/1.0 (+https://github.com/fashfdhgacd/koleksi_dr_pinguinn)";
const blocklist = JSON.parse(fs.readFileSync(new URL("../src/lib/image-blocklist.json", import.meta.url), "utf8"));
const MIN_BYTES = Number(blocklist.minBytes) || 3000;
const PLACEHOLDER_MD5 = blocklist.md5 || {};

let started = Date.now();
const overBudget = () => Date.now() - started > BUDGET_MS;
let framesUsed = 0;

function readJson(p, fb) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fb;
  }
}
function listOf(v) {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.items)) return v.items;
  return [];
}
function sniff(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return "image/webp";
  return "";
}
function validate(bytes, finalUrl) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (isDeadPosterUrl(finalUrl)) return { ok: false, reason: "dead-url" };
  if (buf.byteLength < MIN_BYTES) return { ok: false, reason: "small" };
  const type = sniff(buf);
  if (!type) return { ok: false, reason: "not-image" };
  const hash = createHash("md5").update(buf).digest("hex");
  if (PLACEHOLDER_MD5[hash]) return { ok: false, reason: "placeholder" };
  return { ok: true, type };
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function pool(items, n, fn) {
  let next = 0;
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(runners);
}
async function fetchText(url, referer = "", ms = 12000) {
  try {
    const res = await fetch(url, {
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": UA, ...(referer ? { referer } : {}) },
      redirect: "follow",
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return "";
    const text = await res.text();
    if (/Just a moment|cf-browser-verification|challenge-platform/i.test(text.slice(0, 800))) return "";
    return text.slice(0, 500_000);
  } catch {
    return "";
  }
}
function curlText(url) {
  return new Promise((resolve) => {
    execFile(
      "curl",
      ["-sL", "--max-time", "12", "-A", UA, "-e", "https://koleksidrpinguin.com/", url],
      { encoding: "utf8", maxBuffer: 3 << 20, timeout: 15000 },
      (err, stdout) => {
        const text = err ? "" : String(stdout || "");
        if (/Just a moment|challenge-platform/i.test(text.slice(0, 800))) resolve("");
        else resolve(text.slice(0, 500_000));
      },
    );
  });
}
async function downloadImage(url, referer = "") {
  if (!url || isDeadPosterUrl(url)) return null;
  try {
    const res = await fetch(url, {
      headers: { accept: "image/*", "user-agent": UA, ...(referer ? { referer } : {}) },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const verdict = validate(bytes, res.url || url);
    if (!verdict.ok) return null;
    return { bytes, type: verdict.type };
  } catch {
    return null;
  }
}

const ffmpegOk = !URLS_ONLY && spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;

function grabFrame(inputPath) {
  const out = `${inputPath}.jpg`;
  const run = spawnSync(
    "ffmpeg",
    ["-loglevel", "error", "-y", "-i", inputPath, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", out],
    { timeout: 25000 },
  );
  if (run.status !== 0 || !fs.existsSync(out)) return null;
  const jpg = fs.readFileSync(out);
  fs.rmSync(out, { force: true });
  if (jpegTooFlat(jpg)) return null;
  const verdict = validate(jpg, "https://frame.local/frame.jpg");
  if (!verdict.ok) return null;
  return { bytes: jpg, type: "image/jpeg" };
}

async function frameFromMedia(url, referer) {
  if (!ffmpegOk || (FRAME_CAP > 0 && framesUsed >= FRAME_CAP)) return { deferred: true };
  const tmp = path.join(os.tmpdir(), `poster-${process.pid}-${Math.random().toString(16).slice(2)}`);
  let counted = false;
  try {
    let targets = [url];
    if (/m3u8|\/api\/hls/i.test(url)) {
      const text = await fetchText(url, referer, 12000);
      targets = segmentPicks(playlistSegments(text, url));
    }
    for (const target of targets) {
      const res = await fetch(target, {
        headers: { "user-agent": UA, referer, range: "bytes=0-3500000" },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      }).catch(() => null);
      if (!res || (res.status !== 200 && res.status !== 206)) continue;
      const bin = Buffer.from(await res.arrayBuffer());
      if (bin.length < 1500 || bin.length > 4_000_000) continue;
      if (!counted) {
        framesUsed++;
        counted = true;
      }
      fs.writeFileSync(tmp, bin);
      const img = grabFrame(tmp);
      fs.rmSync(tmp, { force: true });
      if (img) return img;
    }
    return null;
  } catch {
    return null;
  } finally {
    fs.rmSync(tmp, { force: true });
    fs.rmSync(`${tmp}.jpg`, { force: true });
  }
}

async function puterinPlayer(code) {
  const embedUrl = `https://puterin.biz/e/${encodeURIComponent(code)}`;
  const html = await fetchText(embedUrl, "https://puterin.biz/");
  const m = html.match(/window\.__PX=(\{.*?\});/);
  if (!m) return { image: "", file: "" };
  let px;
  try {
    px = JSON.parse(m[1]);
  } catch {
    return { image: "", file: "" };
  }
  if (!px?.n || !px?.d) return { image: "", file: "" };
  let keyHex = "";
  try {
    const pk = await fetch(new URL(`/api/pk?n=${encodeURIComponent(px.n)}`, embedUrl), {
      headers: { "user-agent": UA, referer: embedUrl },
      signal: AbortSignal.timeout(8000),
    });
    if (!pk.ok) return { image: "", file: "" };
    keyHex = (await pk.text()).trim();
  } catch {
    return { image: "", file: "" };
  }
  if (keyHex.length < 64) return { image: "", file: "" };
  try {
    const raw = Uint8Array.from(Buffer.from(px.d, "base64"));
    const iv = raw.subarray(0, 12);
    const ct = raw.subarray(12);
    const key = new Uint8Array(keyHex.length / 2);
    for (let i = 0; i < key.length; i++) key[i] = Number.parseInt(keyHex.slice(i * 2, i * 2 + 2), 16);
    const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, ct);
    const player = JSON.parse(new TextDecoder().decode(plain));
    const image = String(player.image || "");
    let file = String(player.file || "");
    if (file.startsWith("/")) file = new URL(file, embedUrl).href;
    return { image: /^https?:\/\//i.test(image) ? image : "", file: /^https?:\/\//i.test(file) ? file : "" };
  } catch {
    return { image: "", file: "" };
  }
}

async function pageImage(urls) {
  for (const url of urls) {
    const html = url.includes("playmogo.com") || url.includes("dood") ? await curlText(url) : await fetchText(url, "https://koleksidrpinguin.com/");
    const image = metaImage(html);
    if (!image) continue;
    const img = await downloadImage(image, url);
    if (img) return { ...img, stableUrl: image };
  }
  return null;
}

async function firstImage(urls, referer) {
  for (const url of urls) {
    const img = await downloadImage(url, referer);
    if (img) return { ...img, stableUrl: url };
  }
  return null;
}

async function streamtapeSplash(fileId) {
  const login = process.env.STREAMTAPE_LOGIN || "";
  const key = process.env.STREAMTAPE_KEY || "";
  if (!login || !key || !fileId) return null;
  try {
    const u = new URL("https://api.streamtape.com/file/getsplash");
    u.searchParams.set("login", login);
    u.searchParams.set("key", key);
    u.searchParams.set("file", fileId);
    const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => null);
    const url = data?.status === 200 && typeof data.result === "string" ? data.result : "";
    if (!url.startsWith("http")) return null;
    const img = await downloadImage(url, "https://streamtape.com/");
    return img ? { ...img, stableUrl: url } : null;
  } catch {
    return null;
  }
}

async function resolveItem(item) {
  const kind = hostKind(item);
  const code = fileCode(item) || String(item.id || "");
  const embed = String(item.embed || item.direct || "");
  if (kind === "mx") {
    const page = /^https?:\/\/[^/]*mxdrop\./i.test(embed) ? embed : `https://mxdrop.click/e/${code}`;
    const packed = mxdropFromHtml(await fetchText(page, "https://koleksidrpinguin.com/"));
    if (packed.poster) {
      const img = await downloadImage(packed.poster, page);
      if (img) return { ...img, stableUrl: packed.poster };
    }
    if (!URLS_ONLY && packed.file) {
      const frame = await frameFromMedia(packed.file, page);
      if (frame?.bytes || frame?.deferred) return { ...frame, stableUrl: "" };
    }
    return null;
  }
  if (kind === "vidara") {
    const origin = (() => {
      try {
        return new URL(embed).origin;
      } catch {
        return "https://vidara.to";
      }
    })();
    return pageImage([`${origin}/v/${code}`, `${origin}/e/${code}`, embed].filter(Boolean));
  }
  if (kind === "dd") {
    return pageImage([`https://playmogo.com/e/${code}`, embed].filter(Boolean));
  }
  if (kind === "lu") return firstImage(luluPosterUrls(code), "https://lplaygo.com/");
  if (kind === "by") return firstImage(bysePosterUrls(code), embed || "https://byse.sx/");
  if (kind === "indoav" || kind === "userbokep") {
    const hosts = kind === "userbokep"
      ? ["https://tv1.userbokep.com", "https://tv1.indoav.app"]
      : ["https://tv1.indoav.app", "https://tv1.userbokep.com"];
    return pageImage(hosts.map((host) => `${host}/e/${encodeURIComponent(code)}`));
  }
  if (kind === "tape") return streamtapeSplash(code);
  if (kind === "putarin") {
    const player = await puterinPlayer(String(item.id));
    if (player.image && !isDeadPosterUrl(player.image)) {
      const img = await downloadImage(player.image, "https://puterin.biz/");
      if (img) return { ...img, stableUrl: player.image };
    }
    if (!URLS_ONLY && player.file) {
      const frame = await frameFromMedia(player.file, "https://puterin.biz/");
      if (frame?.deferred) return { deferred: true };
      if (frame?.bytes) return { ...frame, stableUrl: "" };
    }
    return null;
  }
  return null;
}

function loadItems() {
  const rows = [];
  const push = (list) => {
    for (const it of listOf(list)) if (includeItem(it)) rows.push(it);
  };
  push(loadAll("videos-latest"));
  push(loadAll("putarin-latest"));
  for (const f of fs.readdirSync("data")) {
    if (!f.endsWith(".json") || /^(videos-latest|putarin-latest|latest-posters|thumb-health)/.test(f)) continue;
    push(readJson(path.join("data", f), []));
  }
  for (const f of fs.readdirSync("src/lib/catalog")) {
    if (!f.endsWith(".json") || /posters|overrides|block/.test(f)) continue;
    push(readJson(path.join("src/lib/catalog", f), []));
  }
  const seen = new Set();
  const out = [];
  for (const it of rows) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

function posterMaps() {
  return [
    readJson("src/lib/catalog/posters.json", {}),
    readJson("src/lib/catalog/jav-posters.json", {}),
    readJson("data/latest-posters.json", {}),
    readJson("src/lib/catalog/overrides.json", {}),
  ];
}
function storedUrl(item, maps) {
  for (const map of maps) {
    const direct = typeof map[item.id] === "string" ? map[item.id] : map[item.id]?.poster;
    if (typeof direct === "string" && /^https?:\/\//i.test(direct)) return direct;
  }
  for (const key of ["poster", "thumbnail"]) {
    if (typeof item[key] === "string" && /^https?:\/\//i.test(item[key])) return item[key];
  }
  return "";
}

async function headPoster(id) {
  const res = await fetch(R2_PUBLIC + encodeURIComponent(id), {
    method: "HEAD",
    headers: { "user-agent": UA },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  if (isCloudflareChallenge(res)) return "challenge";
  if (res.status === 404) return "absent";
  if (res.ok && /^image\//i.test(res.headers.get("content-type") || "")) return "ok";
  if (res.ok) return "bad";
  return "error";
}

function ingestHeaders(type) {
  const headers = { "content-type": type || "image/jpeg", "user-agent": UA };
  const owner = (process.env.ONLINE_VIEW_SECRET || process.env.OWNER_SECRET || process.env.PEMILIK_SECRET || "").trim();
  if (owner) headers["x-online-key"] = owner;
  const token = (process.env.GITHUB_TOKEN || "").trim();
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function putWorker(id, bytes, type) {
  if (!ingestHeaders("image/jpeg").authorization && !ingestHeaders("image/jpeg")["x-online-key"]) {
    return { ok: false, status: 0, message: "no-ingest-auth" };
  }
  const res = await fetch(`${SITE}/thumb/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: ingestHeaders(type),
    body: bytes,
    redirect: "manual",
    signal: AbortSignal.timeout(25000),
  });
  if (isCloudflareChallenge(res)) return { ok: false, status: res.status, message: "challenge" };
  const text = await res.text().catch(() => "");
  if (res.status === 200 && /"ok"\s*:\s*true/.test(text)) return { ok: true, status: 200, message: "" };
  return { ok: false, status: res.status, message: text.replace(/\s+/g, " ").slice(0, 120) };
}

async function storeBytes(id, bytes, type) {
  return putWorker(id, bytes, type);
}

/** 422 = route is live and auth worked (probe body is not an image). 401 = auth rejected. 404 = old worker. */
async function waitForIngest() {
  const probe = new Uint8Array(32);
  for (let i = 0; i < 10; i++) {
    const up = await putWorker("mx-ingestprobe", probe, "image/jpeg");
    if (up.message === "challenge") return "challenge";
    if (up.status === 422 || up.status === 200) return "ready";
    if (up.status === 401) return "auth";
    console.log(`ingest probe HTTP ${up.status}`);
    await sleep(30_000);
  }
  return "missing";
}

function writePosterMap(found) {
  if (!found.size) return 0;
  const file = "data/latest-posters.json";
  const map = readJson(file, {});
  let n = 0;
  for (const [id, url] of found) {
    if (!url || isDeadPosterUrl(url)) continue;
    if (map[id] && !isDeadPosterUrl(map[id])) continue;
    if (map[id] === url) continue;
    map[id] = url;
    n++;
  }
  if (n) fs.writeFileSync(file, JSON.stringify(map, null, 2) + "\n");
  return n;
}

async function urlsOnly(items, maps) {
  const need = items
    .filter((it) => {
      // Putarin's current player.image is the same dead anipop URL. A frame grab is not a stable URL.
      if (hostKind(it) === "putarin") return false;
      const url = storedUrl(it, maps);
      return !url || isDeadPosterUrl(url);
    })
    .sort((a, b) => posterRank(a).band - posterRank(b).band || posterRank(b).date.localeCompare(posterRank(a).date));
  const slice = LIMIT > 0 ? need.slice(0, LIMIT) : need;
  const found = new Map();
  let tried = 0;
  let miss = 0;
  await pool(slice, 6, async (it) => {
    if (overBudget()) return;
    tried++;
    const got = await resolveItem(it).catch(() => null);
    if (got?.stableUrl) found.set(it.id, got.stableUrl);
    else miss++;
  });
  const wrote = writePosterMap(found);
  console.log(`URLS_ONLY tried=${tried} urls=${found.size} wrote=${wrote} miss=${miss} of ${need.length}`);
}

async function backfill(items, maps) {
  const ranked = items
    .filter((it) => {
      if (FULL_SCAN) return true;
      const url = storedUrl(it, maps);
      return !url || isDeadPosterUrl(url);
    })
    .sort((a, b) => posterRank(a).band - posterRank(b).band || posterRank(b).date.localeCompare(posterRank(a).date));
  const missing = [];
  let challenged = false;
  let headErrors = 0;
  await pool(ranked, 20, async (it) => {
    if (challenged) return;
    const state = await headPoster(it.id).catch(() => "error");
    if (state === "challenge") {
      challenged = true;
      return;
    }
    if (state === "absent" || state === "bad") missing.push(it);
    else if (state === "error") headErrors++;
  });
  if (challenged || headErrors > ranked.length / 2) {
    console.error(`poster-backfill: poster host blocked or ${headErrors}/${ranked.length} HEAD checks errored; nothing was uploaded`);
    process.exitCode = 1;
    return;
  }
  const work = LIMIT > 0 ? missing.slice(0, LIMIT) : missing;
  console.log(`missing=${missing.length} head_errors=${headErrors} will_try=${work.length} ffmpeg=${ffmpegOk ? "yes" : "no"}`);
  const ingest = await waitForIngest();
  if (ingest === "challenge") {
    console.error("poster-backfill: Cloudflare challenge while opening ingest; nothing was uploaded");
    process.exitCode = 1;
    return;
  }
  if (ingest !== "ready") {
    console.error(`poster-backfill: worker ingest not usable (${ingest}); nothing was uploaded`);
    process.exitCode = 1;
    return;
  }
  started = Date.now();
  const found = new Map();
  const counts = { stored: 0, noSource: 0, deferred: 0, uploadFailed: 0 };
  const noSourceBy = {};
  let stop = false;
  await pool(work, 4, async (it) => {
    if (stop || overBudget()) {
      counts.deferred++;
      return;
    }
    const known = storedUrl(it, maps);
    let got = null;
    if (known && !isDeadPosterUrl(known)) {
      const img = await downloadImage(known, "https://koleksidrpinguin.com/").catch(() => null);
      if (img) got = { ...img, stableUrl: known };
    }
    if (!got) got = await resolveItem(it).catch(() => null);
    if (got?.deferred) {
      counts.deferred++;
      return;
    }
    if (!got?.bytes) {
      counts.noSource++;
      const kind = hostKind(it) || "other";
      noSourceBy[kind] = (noSourceBy[kind] || 0) + 1;
      return;
    }
    const up = await storeBytes(it.id, got.bytes, got.type).catch((e) => ({ ok: false, status: 0, message: String(e?.message || e).slice(0, 120) }));
    if (up.message === "challenge") {
      console.error("poster-backfill: Cloudflare challenge while storing; stopped");
      stop = true;
      process.exitCode = 1;
      return;
    }
    if (!up.ok) {
      counts.uploadFailed++;
      if (counts.uploadFailed <= 5) console.log(`UPLOAD_FAIL ${it.id} HTTP ${up.status} ${up.message}`);
      return;
    }
    counts.stored++;
    if (got.stableUrl) found.set(it.id, got.stableUrl);
    if (counts.stored % 25 === 0) console.log(`progress stored=${counts.stored} no_source=${counts.noSource}`);
  });
  const wrote = writePosterMap(found);
  const untouched = missing.length - work.length;
  console.log(
    `POSTER_REPORT missing=${missing.length} stored=${counts.stored} no_source=${counts.noSource} upload_failed=${counts.uploadFailed} deferred=${counts.deferred + untouched} map_urls=${wrote}`,
  );
  console.log(`no_source_by ${JSON.stringify(noSourceBy)}`);
  if (counts.stored === 0 && counts.uploadFailed > 0) process.exitCode = 1;
}

const items = loadItems();
const maps = posterMaps();
if (URLS_ONLY) await urlsOnly(items, maps);
else await backfill(items, maps);
