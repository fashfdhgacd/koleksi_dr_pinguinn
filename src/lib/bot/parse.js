const STREAMTAPE_HOST = /(^|\.)(streamtape\.com|strcloud[a-z0-9]*)$/i;
const PUTARIN_HOST = /(^|\.)(putarin\.com|puterin\.[a-z]+)$/i;
const LULU_HOST = /(^|\.)(luluvdo\.com|lulustream\.com|luluvid\.com|lulu\.st)$/i;
const INDOAV_HOST = /indoav\./i;
const USERBOKEP_HOST = /userbokep\./i;
const VIDEY_HOST = /(^|\.)videy\.co$/i;

/** Spesifik dulu. Viral dan amatir paling umum, dicek terakhir. */
const CATEGORY_RULES = [
  ["jilbab", /\b(jilbab|hijab|berhijab|ukht[iy]|tudung|cadar)\b/i],
  ["chindo", /\b(chindo|cindo|tionghoa)\b/i],
  ["malaysia", /\b(malaysia|malay|melayu)\b/i],
  ["open-bo", /\b(open\s*bo|openbo|michat)\b/i],
  ["gangbang", /\b(gang\s*bang|gangbang|threesome|foursome|bertiga|digilir)\b|rame[\s-]*rame/i],
  ["doggy", /\b(doggy|dogi|nungging)\b/i],
  ["colmek", /\b(colmek|omek|coliin|dildo)\b/i],
  ["percakapan", /\b(percakapan|vcs|ngobrol|telpon|telepon)\b/i],
  ["kosan", /\b(kosan|kost|kos|pacar|hotel|check\s*in)\b/i],
  ["istri", /\b(istri|suami|selingkuh|hamil|binor)\b/i],
  ["tante", /\b(tante|janda|stw|milf|ibu\s*tiri|emak|mama\s*muda)\b/i],
  ["live", /\b(live\s*streaming|livestream|\blive)\b/i],
  ["abg", /\b(abg|sma|mahasiswi|mahasiswa|pelajar|tocil)\b/i],
  ["amatir", /\b(amatir|bokep\s*indo|bokepindo|pasutri|pasangan|homemade)\b/i],
  ["viral", /\bviral\b/i],
];

function normText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectCategory(title = "", fallback = "") {
  const text = normText(`${title} ${fallback}`);
  if (!text) return "lainnya";
  for (const [slug, re] of CATEGORY_RULES) {
    if (re.test(text)) return slug;
  }
  return "lainnya";
}

export function cleanTitle(raw = "") {
  return String(raw)
    .replace(/^\u25b6\s*/, "")
    .replace(/^[\u{1F4C1}\u{1F4C2}\u{1F3AC}\u{1F3A5}\u{1F4F9}]\s*/u, "")
    .replace(/^judul\s*[:\uff1a-]\s*/i, "")
    .replace(/^title\s*[:\uff1a-]\s*/i, "")
    .replace(/koleksidrpinguin\.(com|site)/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\-|]+|[\-|]+$/g, "") || "Video";
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
      LULU_HOST.test(host) ||
      INDOAV_HOST.test(host) ||
      USERBOKEP_HOST.test(host) ||
      VIDEY_HOST.test(host)
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

  if (LULU_HOST.test(host)) {
    const m =
      path.match(/\/(?:e|v|d)\/([A-Za-z0-9]+)/i) ||
      [null, String(path.split("/").filter(Boolean).pop() || "").replace(/\.html$/i, "")];
    const id = m && m[1];
    if (!id) return null;
    const embed = `https://luluvdo.com/e/${id}`;
    return {
      id,
      host: "lulu",
      source: "Lulustream",
      embed,
      direct: embed,
      file: `campur.json`,
    };
  }

  if (VIDEY_HOST.test(host)) {
    const mm = parsed.search.match(/[?&]id=([A-Za-z0-9]+)/i);
    const id = (mm && mm[1]) || "";
    if (!id) return null;
    const ext = id.length === 9 && id.endsWith("2") ? ".mov" : ".mp4";
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

  return null;
}

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

  const urls = extractUrls(text);
  const videos = [];
  let pendingTitle = "";
  for (const line of lines) {
    if (/^(?:title|judul|category|kategori|cat)\s*[:\-]/i.test(line)) continue;
    const lineUrls = extractUrls(line);
    if (lineUrls.length) {
      for (const url of lineUrls) {
        const parsed = parseVideoLink(url);
        if (!parsed) continue;
        const own = cleanTitle(pendingTitle || title || parsed.title || "");
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
