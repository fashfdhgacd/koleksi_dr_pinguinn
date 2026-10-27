import { refineCategory } from "../catalog/title-category.js";
import { cleanUploadTitle, brandUploadTitle } from "./title-brand.js";
import {
  DRP_ID_PREFIX,
  DRP_SOURCES,
  drpCodeFromUrl,
  drpKindOfHost,
} from "../catalog/drp-hosts.js";
const STREAMTAPE_HOST = /(^|\.)(streamtape\.com|strcloud[a-z0-9]*)$/i;
const PUTARIN_HOST = /(^|\.)(putarin\.com|puterin\.[a-z]+)$/i;
const INDOAV_HOST = /indoav\./i;
const USERBOKEP_HOST = /userbokep\./i;
const VIDEY_HOST = /(^|\.)videy\.co$/i;
/** Videy mirror (cdn2.aceimg.com/<id>.mp4): stored as a Videy item that plays this exact file. */
const ACEIMG_HOST = /(^|\.)aceimg\.com$/i;
/** A bare Videy id as people paste them (9 chars, last one 1 = mp4, 2 = mov). */
const VIDEY_ID_RE = /^[A-Za-z0-9]{8}[12]$/;

/** Spesifik dulu. Imbuhan Indonesia (ber-, di-, nge-) ikut. Amatir (umum) paling akhir. */
const CATEGORY_RULES = [
  ["jilbab", /(ber|di)?(jilbab|hijab)|ukht[iy]|tudung|cadar|berkerudung/i],
  ["chindo", /\b(chindo|cindo|tionghoa|chinese indo)\b/i],
  ["malaysia", /\b(malaysia|malaysi|melayu)\b/i],
  ["open-bo", /open\s*bo|openbo|\bmichat\b|\bopenbo\b/i],
  ["gangbang", /gang\s*bang|threesome|foursome|bertiga|berempat|di\s*gilir|rame[\s-]*rame|ramai[\s-]*ramai/i],
  ["doggy", /\bdoggy\b|\bdogi\b|nungging|menungging/i],
  ["colmek", /colmek|coliin|\bomek\b|dildo|colay/i],
  ["percakapan", /percakapan|\bvcs\b|\bvc\b|ngobrol|telpon|telepon|nelpon|nelfon|video\s*call/i],
  ["kosan", /kosan|kostan|\bkost\b|\bkos\b|kontrakan/i],
  ["istri", /\bistri\b|\bsuami\b|selingkuh|berselingkuh|\bhamil\b|\bbinor\b|istri\s*orang|suami\s*orang/i],
  ["tante", /\btante\b|\bjanda\b|\bstw\b|\bmilf\b|ibu\s*tiri|\bemak\b|emak2|mama\s*muda|mbak\s*muda/i],
  ["live", /live\s*stream|livestream|siaran\s*langsung|\blive\b/i],
  ["abg", /\babg\b|\bsma\b|mahasiswi|mahasiswa|\bpelajar\b/i], // not "tocil": adult slang (small breasts)
  // Viral sebelum amatir: "Bokep Indo Viral ..." masuk Viral, bukan bucket umum Amatir.
  ["viral", /\bviral\b|\bfyp\b/i],
  ["amatir", /amatir|bokep\s*indo|bokepindo|pasutri|\brumahan\b|homemade|\bindo\b/i],
];

function normText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[_–—./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectCategory(title = "", fallback = "") {
  const text = normText(`${title} ${fallback}`);
  if (!text) return "lainnya";
  let base = "lainnya";
  for (const [slug, re] of CATEGORY_RULES) {
    if (re.test(text)) {
      base = slug;
      break;
    }
  }
  // Shared with the site catalog: generic results (amatir/lainnya) move to the newer
  // themes (bule, selingkuh, mahasiswi, sepong, hotel, outdoor, ...) when the title matches.
  return refineCategory(base, text);
}

/**
 * Judul dasar: tanpa branding situs/channel lain dan tanpa branding pinguin lama; '<' '>' dibuang.
 * Akhiran " - koleksidrpinguin.com" dipasang sekali saat record dibuat (brandTitle, upload-handler).
 * Aturan + daftar nama situs: src/lib/bot/title-brand.js. Tes: node scripts/test-title-brand.mjs
 */
export function cleanTitle(raw = "") {
  return cleanUploadTitle(raw);
}

/** Judul final upload baru: judul dasar + tepat satu " - koleksidrpinguin.com". */
export function brandTitle(raw = "") {
  return brandUploadTitle(raw);
}

export function extractUrls(text = "") {
  const found = String(text).match(/https?:\/\/[^\s<>"']+/gi) || [];
  return found.map((u) => u.replace(/[),.;]+$/g, ""));
}

export function isUploadHost(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    return (
      STREAMTAPE_HOST.test(host) ||
      PUTARIN_HOST.test(host) ||
      Boolean(drpKindOfHost(host)) ||
      INDOAV_HOST.test(host) ||
      USERBOKEP_HOST.test(host) ||
      VIDEY_HOST.test(host) ||
      ACEIMG_HOST.test(host)
    );
  } catch {
    return false;
  }
}

export function parseVideoLink(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./i, "");
  const path = parsed.pathname || "";
  const origin = parsed.origin;

  if (STREAMTAPE_HOST.test(host) || /strcloud/i.test(host)) {
    const m =
      path.match(/\/(?:e|v|d)\/([A-Za-z0-9_-]+)(?:\/([^/?#]+))?/i) ||
      parsed.search.match(/[?&]id=([A-Za-z0-9_-]+)/i);
    if (!m) return null;
    const id = m[1];
    const embed = `https://streamtape.com/e/${id}`;
    let titleFromPath = "";
    if (m[2]) {
      try {
        titleFromPath = cleanTitle(
          decodeURIComponent(m[2]).replace(/\.(mp4|mov|mkv|avi|webm|m4v)$/i, ""),
        );
      } catch {
        titleFromPath = cleanTitle(String(m[2]).replace(/\.(mp4|mov|mkv|avi|webm|m4v)$/i, ""));
      }
      if (!titleFromPath || titleFromPath === "Video" || titleFromPath === id) {
        titleFromPath = "";
      }
    }
    return {
      id,
      host: "streamtape",
      source: "Streamtape",
      embed,
      direct: embed,
      file: `videos.json`,
      ...(titleFromPath ? { title: titleFromPath } : {}),
    };
  }

  if (PUTARIN_HOST.test(host)) {
    const folder = path.match(/\/f\/([A-Za-z0-9_-]+)/i);
    if (folder) {
      const id = folder[1];
      const base = /puterin\./i.test(host) ? origin : "https://panel.putarin.com";
      return {
        id,
        host: "putarin-folder",
        source: "Putarin",
        embed: `${base}/f/${id}`,
        direct: `${base}/f/${id}`,
        file: `putarin.json`,
        folder: true,
      };
    }
    const m =
      path.match(/\/(?:e|v|d|watch|video)\/([A-Za-z0-9_-]+)/i) ||
      parsed.search.match(/[?&](?:code|id)=([A-Za-z0-9_-]+)/i);
    if (!m) return null;
    const id = m[1];
    const base = /puterin\./i.test(host) ? origin : "https://panel.putarin.com";
    const embed = `${base}/e/${id}`;
    const watch = `${base}/v/${id}`;
    return {
      id,
      host: "putarin",
      source: "Putarin",
      embed,
      direct: watch,
      file: `putarin.json`,
    };
  }

  // Owner's own LuluStream / DoodStream / Byse uploads -> /kategori/bokep (src/lib/catalog/drp-hosts.js).
  const drp = drpKindOfHost(host);
  if (drp) return parseDrpLink(drp, parsed);

  if (ACEIMG_HOST.test(host)) {
    const am = path.match(/^\/([A-Za-z0-9]+)\.mp4$/i);
    if (!am) return null;
    const file = `https://${host.toLowerCase()}/${am[1]}.mp4`;
    return { id: am[1], host: "videy", source: "Videy", embed: file, direct: file, file: `videos.json` };
  }

  if (VIDEY_HOST.test(host)) {
    // videy.co/v/?id=X or a direct file link cdn.videy.co/X.mp4 (cdn2, cdn3, ... too).
    const mm = parsed.search.match(/[?&]id=([A-Za-z0-9]+)/i);
    const fm = /^cdn\d*\./i.test(host) ? path.match(/^\/([A-Za-z0-9]+)\.(mp4|mov)$/i) : null;
    const id = (mm && mm[1]) || (fm && fm[1]) || "";
    if (!id) return null;
    const ext = fm ? `.${fm[2].toLowerCase()}` : id.length === 9 && id.endsWith("2") ? ".mov" : ".mp4";
    return {
      id,
      host: "videy",
      source: "Videy",
      embed: `https://videy.co/v/?id=${id}`,
      direct: `https://cdn.videy.co/${id}${ext}`,
      file: `videos.json`,
    };
  }

  if (INDOAV_HOST.test(host) || USERBOKEP_HOST.test(host)) {
    const m = path.match(/\/(?:e|v|d|watch)\/([A-Za-z0-9_-]+)/i);
    const id = (m && m[1]) || String(path.split("/").filter(Boolean).pop() || "");
    if (!id) return null;
    const embed = url.replace(/\/d\//i, "/e/");
    return {
      id,
      host: INDOAV_HOST.test(host) ? "indoav" : "userbokep",
      source: INDOAV_HOST.test(host) ? "IndoAV" : "Userbokep",
      embed,
      direct: embed,
      file: `videos.json`,
    };
  }

  // Unknown domain with /e/<code>: maybe a Byse account's own embed domain. Only a candidate here;
  // upload-handler keeps it only when Byse's public /api/videos/<code>/embed/details answers.
  const pm = path.match(/^\/e\/([A-Za-z0-9]{6,40})\/?$/);
  if (pm) {
    const code = pm[1];
    const embed = `${origin}/e/${code}`;
    /** @type {Record<string, any>} */
    const probe = {
      id: `${DRP_ID_PREFIX.byse}${code}`,
      code,
      host: "byse-probe",
      source: DRP_SOURCES.byse,
      embed,
      direct: embed,
      origin,
      file: `videos.json`,
    };
    return probe;
  }

  return null;
}

/** Path words on these hosts that are pages, not file codes (dashboard links pasted by mistake). */
const DRP_NOT_A_CODE = new Set([
  "dashboard", "settings", "account", "videos", "folders", "folder", "upload", "uploads", "login",
  "register", "signup", "logout", "premium", "earnings", "payments", "payouts", "affiliate", "support",
  "contact", "privacy", "terms", "dmca", "faq", "about", "api", "apidocs", "reports", "panel", "home",
]);

/** Panel domains that do not play embeds themselves (Byse: each account has its own embed domain). */
const BYSE_PANEL_HOST = /^(?:api\.)?byse\.sx$/i;

/**
 * LuluStream / DoodStream / Byse link -> record base. Ids are prefixed (lu-/dd-/by-) so they never
 * clash with another host's id; `code` keeps the host's own file code for meta lookups.
 * @param {"lulu" | "dood" | "byse"} kind
 * @param {URL} parsed
 * @returns {Record<string, any> | null}
 */
function parseDrpLink(kind, parsed) {
  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  const code = drpCodeFromUrl(parsed.href);
  if (!code || DRP_NOT_A_CODE.has(code.toLowerCase())) return null;
  let embed;
  if (kind === "lulu") embed = `https://luluvdo.com/e/${code}`;
  else if (kind === "dood") embed = `https://${host}/e/${code}`;
  else embed = `${parsed.origin}/e/${code}`;
  return {
    id: `${DRP_ID_PREFIX[kind]}${code}`,
    code,
    host: kind,
    source: DRP_SOURCES[kind],
    embed,
    direct: embed,
    origin: parsed.origin,
    file: `videos.json`,
    // Byse panel link (byse.sx/...): the real embed domain comes from the details endpoint.
    ...(kind === "byse" && BYSE_PANEL_HOST.test(host) ? { needsEmbedDomain: true } : {}),
  };
}

/** Hosts whose "link judul" on one line means: the text after the link is that video's title. */
const SAME_LINE_TITLE_HOSTS = new Set(["videy", "lulu", "dood", "byse", "byse-probe"]);

export function parseMessage(text = "") {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let title = "";
  let category = "";
  for (const line of lines) {
    const tm = line.match(/^(?:title|judul)\s*[:\-]\s*(.+)$/i);
    if (tm) title = tm[1].trim();
    const cm = line.match(/^(?:category|kategori|cat)\s*[:\-]\s*(.+)$/i);
    if (cm) category = cm[1].trim().toLowerCase();
  }
  // Tag #aigay (or #ai-gay / #ai_gay) anywhere in the message = category AI GAY (/kategori/ai-gay).
  if (!category && /(?:^|\s)#ai[-_]?gay\b/i.test(text)) category = "ai-gay";
  // Gay uploads from Boy Friend TV ("BoyFriendTV" / "Boy Friend TV" in the message) also go to AI GAY.
  if (!category && /boy\s*friend\s*tv/i.test(text)) category = "ai-gay";
  // Same for the 2026-10-26 SEO categories: #blunder, #kelasbintang, #tiktok, ... (first one wins).
  if (!category) {
    const m = /(?:^|\s)#(blunder|kelas[-_]?bintang|tiktok|mantan|vcs|kompilasi|tetangga|kacamata|kantor|anal|cantik)\b/i.exec(text);
    if (m) category = m[1].toLowerCase().replace(/^kelas[-_]?bintang$/, "kelas-bintang");
  }

  const urls = extractUrls(text);
  const videos = [];
  // Bare Videy ids (no link): a line of 3+ ids, or a message that is nothing but ids.
  const idLine = (line) => {
    const toks = line.split(/[\s,;]+/).filter(Boolean);
    return toks.length > 0 && toks.every((t) => VIDEY_ID_RE.test(t)) ? toks : null;
  };
  const onlyIds = !urls.length && lines.length > 0 && lines.every((l) => idLine(l));
  let pendingTitle = "";
  for (const line of lines) {
    if (/^(?:title|judul|category|kategori|cat)\s*[:\-]/i.test(line)) continue;
    const lineUrls = extractUrls(line);
    const ids = lineUrls.length ? null : idLine(line);
    if (ids && (onlyIds || ids.length >= 3)) {
      for (const id of ids) {
        const parsed = parseVideoLink(`https://videy.co/v/?id=${id}`);
        if (parsed) videos.push(parsed);
      }
      pendingTitle = "";
      continue;
    }
    if (lineUrls.length) {
      // Videy / Lulu / Dood / Byse: "link judul" on one line; the text after the link is its title.
      let sameLine = "";
      if (lineUrls.length === 1) {
        const rest = line.split(lineUrls[0]).join(" ").replace(/\s+/g, " ").trim();
        const p0 = parseVideoLink(lineUrls[0]);
        if (rest && p0 && SAME_LINE_TITLE_HOSTS.has(p0.host)) sameLine = rest;
      }
      for (const url of lineUrls) {
        const parsed = parseVideoLink(url);
        if (!parsed) continue;
        const own = cleanTitle(sameLine || pendingTitle || title || parsed.title || "");
        videos.push(own && own !== "Video" ? { ...parsed, title: own } : parsed);
      }
      pendingTitle = "";
      continue;
    }
    pendingTitle = line
      .replace(/^[\u{1F4C1}\u{1F4C2}\u{1F3AC}\u{1F3A5}\u{1F4F9}]\s*/u, "")
      .replace(/^\ud83c\udfac\s*/, "");
  }

  if (!videos.length) {
    for (const url of urls) {
      const parsed = parseVideoLink(url);
      if (!parsed) continue;
      const own = cleanTitle(title || parsed.title || "");
      videos.push(own && own !== "Video" ? { ...parsed, title: own } : parsed);
    }
  }

  return { title: cleanTitle(title), category, videos, urls };
}
