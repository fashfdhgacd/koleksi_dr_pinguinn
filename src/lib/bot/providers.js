import { BYSE_DOMAINS } from "../catalog/drp-hosts.js";
import { fetchValidImage } from "@/lib/image-guard";
import { fetchPuterinPoster } from "@/lib/puterin-poster";

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, redirect: "follow" });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: res.status, data: null, raw: text.slice(0, 200) };
  }
}

function decodeEntities(s = "") {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}

/** Race a promise against a hard timeout; never hang forever. */
function withTimeout(promise, ms, fallback = "") {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Ambil judul dari <title> halaman embed Puterin kalau API key kosong. */
async function scrapePutarinTitle(code) {
  if (!code) return "";
  const urls = [
    `https://puterin.biz/e/${encodeURIComponent(code)}`,
    `https://panel.putarin.com/e/${encodeURIComponent(code)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: "text/html",
          "user-agent": "Mozilla/5.0 (compatible; kdp-bot/1.0)",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(2800),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const m = html.match(/<title>([^<]+)<\/title>/i);
      if (!m) continue;
      let title = decodeEntities(m[1]);
      title = title
        .replace(/\s*[·|].*putarin.*$/i, "")
        .replace(/\s*[-–].*puterin.*$/i, "")
        .trim();
      if (!title || /tidak ditemukan|not found|^video$/i.test(title)) continue;
      return title;
    } catch {
      /* try next */
    }
  }
  return "";
}

export async function fetchPutarinTitle(code, env) {
  const key = env.PUTARIN_API_KEY;
  const base = (env.PUTARIN_API_BASE || "https://panel.putarin.com/api/dev").replace(/\/$/, "");
  if (key && code) {
    try {
      const { ok, data } = await withTimeout(
        getJson(`${base}/video/${encodeURIComponent(code)}`, {
          "X-API-Key": key,
          Accept: "application/json",
        }),
        3000,
        { ok: false, data: null },
      );
      if (ok && data) {
        const t = String(data.video?.title || data.title || data.data?.title || "").trim();
        if (t) return t;
      }
    } catch {
      /* fall through to scrape */
    }
  }
  return withTimeout(scrapePutarinTitle(code), 3000, "");
}

/**
 * IndoAV / UserBokep: read og:image (+ og:title) from the public /d/<id> page.
 * Short timeout so the batch stays fast; returns empty strings on any failure.
 */
export async function fetchEmbedPageMeta(embedUrl, id) {
  let origin = "";
  try {
    origin = new URL(String(embedUrl || "")).origin;
  } catch {
    return { title: "", thumb: "" };
  }
  if (!origin || !id || !/indoav\.|userbokep\./i.test(origin)) return { title: "", thumb: "" };
  const run = async () => {
    for (const path of [`/d/${encodeURIComponent(id)}`, `/e/${encodeURIComponent(id)}`]) {
      try {
        const res = await fetch(origin + path, {
          headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (compatible; kdp-bot/1.0)" },
          redirect: "follow",
          signal: AbortSignal.timeout(3500),
        });
        if (!res.ok) continue;
        const html = await res.text();
        const img = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        const ttl = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
        const thumb = img ? decodeEntities(img[1]) : "";
        const title = ttl ? decodeEntities(ttl[1]) : "";
        if (thumb || title) {
          return {
            title,
            thumb: /^https:\/\//i.test(thumb) && !/placeholder|logo|favicon/i.test(thumb) ? thumb : "",
          };
        }
      } catch {
        /* try next */
      }
    }
    return { title: "", thumb: "" };
  };
  return withTimeout(run(), 6000, { title: "", thumb: "" });
}

/* ------------------------------------------------------------------------------------------------
 * LuluStream / DoodStream / Byse ("Koleksi Dr. Pinguin Bokep"): title + poster, best effort, once at
 * upload time (never per view). Any failure returns empty strings: the card then falls back to the
 * site's brand poster (/thumb/<id>) and the title to an auto title the owner can fix in /pemilik.
 * ---------------------------------------------------------------------------------------------- */

const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

/** Titles that are a host/anti-bot page, not the video's name. */
const JUNK_TITLE =
  /^(?:video|watch|embed|player|loading|untitled|file|404|403)$|just a moment|attention required|ddos|cloudflare|access denied|not found|file (?:was )?(?:deleted|removed|not found)|video (?:not found|tidak ditemukan)|tidak ditemukan|captcha|verify|doodstream|lulustream|byse/i;

function cleanHostTitle(raw = "") {
  let t = decodeEntities(String(raw || ""))
    .replace(/\s*[-|–—·]\s*(?:dood\s*stream|doodstream|dood|luluvdo|lulu\s*stream|lulustream|lulu|byse)[^|]*$/i, "")
    .replace(/^(?:watch|nonton)\s+/i, "")
    .replace(/\.(?:mp4|mkv|mov|avi|webm|m4v|ts)$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Short CJK titles ("龍女") are real titles: 2+ characters is enough for Chinese/Japanese/Korean.
  const minLen = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(t) ? 2 : 3;
  if (!t || t.length < minLen || JUNK_TITLE.test(t)) return "";
  // Never cut the title (owner 2026-10-19: titles, incl. Chinese ones, are kept exactly as uploaded).
  return t;
}

function absUrl(raw, base) {
  const v = decodeEntities(String(raw || "")).replace(/\\\//g, "/").trim();
  if (!v || /^data:/i.test(v)) return "";
  try {
    const u = new URL(v, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

/** Poster candidates in an embed page: og:image, <video poster>, player config image/poster/thumbnail. */
function posterFromHtml(html, base) {
  const pats = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<video[^>]+poster=["']([^"']+)["']/i,
    /["']?(?:poster|image|thumbnail|thumb|splash|splash_img|single_img|poster_url|thumbnail_url)["']?\s*[:=]\s*["']([^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/i,
    /(https?:\/\/[^"'\s)]+\/(?:snaps|splash|thumbs?|posters?|images?)\/[^"'\s)]+\.(?:jpe?g|png|webp))/i,
  ];
  for (const re of pats) {
    const m = html.match(re);
    const u = m ? absUrl(m[1], base) : "";
    if (u && !/placeholder|logo|favicon|sprite|blank|default|no-?image|avatar|icon/i.test(u)) return u;
  }
  return "";
}

function titleFromHtml(html) {
  const pats = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
    /<h[1-4][^>]*>([^<]{3,160})<\/h[1-4]>/i,
  ];
  for (const re of pats) {
    const m = html.match(re);
    const t = m ? cleanHostTitle(m[1]) : "";
    if (t) return t;
  }
  return "";
}

/** True when the URL answers with an image (first bytes only). Unknown = false, so we never store junk. */
async function looksLikeImage(url, referer) {
  if (!/^https?:\/\//i.test(String(url || ""))) return false;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": BROWSER_UA, accept: "image/*", range: "bytes=0-2047", ...(referer ? { referer } : {}) },
      redirect: "follow",
      signal: AbortSignal.timeout(3500),
    });
    const type = String(res.headers.get("content-type") || "").toLowerCase();
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    // SVG is never a video frame (img-place answers unknown codes with a small SVG placeholder).
    return (res.status === 200 || res.status === 206) && type.startsWith("image/") && !type.includes("svg");
  } catch {
    return false;
  }
}

async function fetchHtml(url, referer) {
  try {
    const res = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "id-ID,id;q=0.9,en;q=0.8",
        "user-agent": BROWSER_UA,
        ...(referer ? { referer } : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { html: "", url: res.url || url };
    const html = (await res.text()).slice(0, 400_000);
    return { html, url: res.url || url };
  } catch {
    return { html: "", url };
  }
}

/**
 * LuluStream / DoodStream: scrape the public embed (and Dood /d/) page for title + poster.
 * The poster is kept only if it really answers with an image. Never throws; 9 s cap.
 */
export async function fetchDrpPageMeta(kind, embedUrl, code) {
  const empty = { title: "", thumb: "" };
  if (!code || !embedUrl) return empty;
  const run = async () => {
    let origin = "";
    try {
      origin = new URL(embedUrl).origin;
    } catch {
      return empty;
    }
    const c = encodeURIComponent(code);
    const pages =
      kind === "dood"
        ? [`${origin}/e/${c}`, `${origin}/d/${c}`]
        : kind === "lulu"
          ? [`https://luluvdo.com/e/${c}`, `https://lulustream.com/${c}.html`]
          : [embedUrl];
    let title = "";
    let thumb = "";
    for (const page of pages) {
      const { html, url } = await fetchHtml(page, "https://koleksidrpinguin.com/");
      if (!html) continue;
      if (!title) title = titleFromHtml(html);
      if (!thumb) {
        const cand = posterFromHtml(html, url);
        if (cand && (await looksLikeImage(cand, url))) thumb = cand;
      }
      if (title && thumb) break;
    }
    return { title, thumb };
  };
  return withTimeout(run(), 9000, empty);
}

/**
 * Byse keeps each thumbnail at img-place.com/<code>_xt.jpg (sometimes only _t.jpg). Public, no key,
 * and reachable when Byse's details endpoint refuses server IPs ("proxy/vpn access is not allowed").
 * Returns the first URL that answers with a real image, else "" (fresh uploads have none yet).
 */
export async function fetchBysePoster(/** @type {unknown} */ code) {
  const c = String(code || "");
  if (!/^[A-Za-z0-9]{4,40}$/.test(c)) return "";
  for (const suffix of ["_xt", "_t"]) {
    const url = `https://img-place.com/${encodeURIComponent(c)}${suffix}.jpg`;
    if (await looksLikeImage(url, "")) return url;
  }
  return "";
}

/**
 * Byse public player details (no API key): <embed domain>/api/videos/<code>/embed/details.
 * Tries the link's own domain first, then the known Byse domains. ok=true only for a real Byse
 * answer (used to accept links on an unknown domain). embed = Byse's own embed_frame_url when given.
 */
export async function fetchByseMeta(origin, code) {
  const empty = { ok: false, title: "", thumb: "", embed: "", length: 0 };
  if (!code || !/^[A-Za-z0-9]{4,40}$/.test(String(code))) return empty;
  const run = async () => {
    const bases = [];
    const add = (b) => {
      if (b && !bases.includes(b)) bases.push(b);
    };
    if (origin && !/^https?:\/\/(?:api\.)?byse\.sx$/i.test(origin)) add(origin);
    for (const d of BYSE_DOMAINS) if (!/^(?:api\.)?byse\.sx$/i.test(d)) add(`https://${d}`);
    for (const base of bases.slice(0, 4)) {
      try {
        const res = await fetch(`${base}/api/videos/${encodeURIComponent(code)}/embed/details`, {
          headers: { accept: "application/json", "user-agent": BROWSER_UA, referer: `${base}/e/${code}` },
          redirect: "follow",
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) continue;
        const data = await res.json().catch(() => null);
        const d = data && typeof data === "object" ? data.data || data.video || data.result || data : null;
        if (!d || typeof d !== "object" || d.error) continue;
        const frame = absUrl(d.embed_frame_url || d.embed_url || "", base);
        const looksByse = Boolean(frame || d.code || d.file_code || d.title || d.poster_url);
        if (!looksByse) continue;
        const title = cleanHostTitle(d.title || d.name || "");
        let thumb = absUrl(d.poster_url || d.thumbnail_url || d.thumbnail || d.poster || d.splash_url || "", base);
        // Byse keeps every thumbnail at img-place.com/<code>_xt.jpg; used when the details omit it.
        // Still verified below: a fresh upload has none yet and keeps the logo until the daily sync.
        if (!thumb) thumb = `https://img-place.com/${encodeURIComponent(String(d.code || d.file_code || code))}_xt.jpg`;
        if (thumb && !(await looksLikeImage(thumb, `${base}/`))) thumb = "";
        const len = Number(d.length_seconds || d.duration || d.length || 0);
        return {
          ok: true,
          title,
          thumb,
          embed: frame && /\/e\//.test(frame) ? frame : "",
          length: Number.isFinite(len) && len > 0 ? Math.round(len) : 0,
        };
      } catch {
        /* next domain */
      }
    }
    // Last resort for a known Byse domain: the embed page itself (og:image / <title>).
    if (origin && !/^https?:\/\/(?:api\.)?byse\.sx$/i.test(origin)) {
      const meta = await fetchDrpPageMeta("byse", `${origin}/e/${code}`, code);
      // Details refused (server IP blocked): the poster still lives on img-place.
      const thumb = meta.thumb || (await fetchBysePoster(code));
      return { ...empty, title: meta.title, thumb };
    }
    return empty;
  };
  return withTimeout(run(), 12000, empty);
}

export async function fetchPutarinMeta(code, env) {
  const key = env.PUTARIN_API_KEY;
  const base = (env.PUTARIN_API_BASE || "https://panel.putarin.com/api/dev").replace(/\/$/, "");
  let title = "";
  let thumb = "";
  if (key && code) {
    try {
      const { ok, data } = await withTimeout(
        getJson(`${base}/video/${encodeURIComponent(code)}`, {
          "X-API-Key": key,
          Accept: "application/json",
        }),
        3000,
        { ok: false, data: null },
      );
      if (ok && data) {
        const v = data.video || data.data || data;
        title = String(v?.title || data.title || "").trim();
        thumb = String(
          v?.poster || v?.thumbnail || v?.thumb || v?.image || data.poster || data.thumbnail || "",
        ).trim();
      }
    } catch {
      /* ignore */
    }
  }
  if (!title) title = await withTimeout(scrapePutarinTitle(code), 3000, "");
  // No (valid) API thumb: resolve the embed's own player.image without a key (same as
  // /api/puterin-thumb), and only keep a poster that passes the central image guard.
  if (thumb && !(await withTimeout(fetchValidImage(thumb, "https://puterin.biz/"), 7000, { ok: false })).ok) thumb = "";
  if (!thumb && code) {
    const p = await withTimeout(fetchPuterinPoster(code).catch(() => null), 6000, null);
    if (p && (await withTimeout(fetchValidImage(p, "https://puterin.biz/"), 7000, { ok: false })).ok) thumb = p;
  }
  return { title, thumb };
}

export async function fetchStreamtapeMeta(fileId, env) {
  const login = env.STREAMTAPE_LOGIN;
  const key = env.STREAMTAPE_KEY;
  const api = (env.STREAMTAPE_API || "https://api.streamtape.com").replace(/\/$/, "");
  let title = "";
  let thumb = "";
  if (!fileId) return { title, thumb };

  const infoUrl = new URL(`${api}/file/info`);
  infoUrl.searchParams.set("file", fileId);
  if (login && key) {
    infoUrl.searchParams.set("login", login);
    infoUrl.searchParams.set("key", key);
  }
  try {
    const { ok, data } = await withTimeout(getJson(infoUrl.toString()), 3500, { ok: false, data: null });
    if (ok && data && data.status === 200 && data.result) {
      const info = data.result?.[fileId] || data.result;
      title = String(info?.name || info?.title || "")
        .replace(/\.[a-z0-9]+$/i, "")
        .trim();
      const t = String(info?.thumb || info?.thumbnail || info?.poster || "").trim();
      if (t.startsWith("http")) thumb = t;
    }
  } catch {
    /* ignore */
  }

  if (!thumb && login && key) {
    try {
      const splashUrl = new URL(`${api}/file/getsplash`);
      splashUrl.searchParams.set("file", fileId);
      splashUrl.searchParams.set("login", login);
      splashUrl.searchParams.set("key", key);
      const { ok, data } = await withTimeout(getJson(splashUrl.toString()), 3500, { ok: false, data: null });
      if (ok && data && data.status === 200) {
        const t = String(data.result || "").trim();
        if (t.startsWith("http")) thumb = t;
      }
    } catch {
      /* ignore */
    }
  }

  return { title, thumb };
}

export async function fetchStreamtapeTitle(fileId, env) {
  const { title } = await fetchStreamtapeMeta(fileId, env);
  return title;
}


/** Expand puterin.biz/f/{id} folder page into individual /v/ videos. */
export async function expandPutarinFolder(folderId, folderTitle = "") {
  const id = String(folderId || "").trim();
  if (!id) return [];
  const urls = [
    `https://puterin.biz/f/${encodeURIComponent(id)}`,
    `https://panel.putarin.com/f/${encodeURIComponent(id)}`,
  ];
  let html = "";
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: "text/html",
          "user-agent": "Mozilla/5.0 (compatible; kdp-bot/1.0)",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(28000),
      });
      if (!res.ok) continue;
      html = await res.text();
      if (html.includes('class="pcard"') && /\/v\/[A-Za-z0-9_-]+/.test(html)) break;
    } catch {
      /* next */
    }
  }
  if (!html) return [];

  const out = [];
  const seen = new Set();
  const cardRe = /<a class="pcard"[^>]*href="\/v\/([A-Za-z0-9_-]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = cardRe.exec(html))) {
    const vid = m[1];
    if (!vid || seen.has(vid)) continue;
    seen.add(vid);
    const body = m[2] || "";
    const tm = body.match(/<div class="pt">([\s\S]*?)<\/div>/i);
    let title = tm ? decodeEntities(tm[1].replace(/<[^>]+>/g, "")).trim() : "";
    if (!title) title = folderTitle ? `${folderTitle} #${out.length + 1}` : `Video ${vid}`;
    const base = "https://puterin.biz";
    out.push({
      id: vid,
      host: "putarin",
      source: "Putarin",
      embed: `${base}/e/${vid}`,
      direct: `${base}/v/${vid}`,
      file: "putarin.json",
      title,
      folderId: id,
    });
  }
  return out;
}
