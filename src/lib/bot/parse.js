const STREAMTAPE_HOST = /(^|\.)(streamtape\.com|strcloud[a-z0-9]*)$/i;
const PUTARIN_HOST = /(^|\.)(putarin\.com|puterin\.[a-z]+)$/i;
const LULU_HOST = /(^|\.)(luluvdo\.com|lulustream\.com|luluvid\.com|lulu\.st)$/i;
const INDOAV_HOST = /indoav\./i;
const USERBOKEP_HOST = /userbokep\./i;
const VIDEY_HOST = /(^|\.)videy\.co$/i;

const CATEGORY_RULES = [
  ["jilbab", /jilbab|hijab|ukhty|ukhti|tudung|berhijab/i],
  ["tante", /tante|janda|\bstw\b|milf|ibu ?tiri|\bemak\b/i],
  ["live", /\blive\b/i],
  ["chindo", /chindo/i],
  ["malaysia", /malay|malaysia/i],
  ["open-bo", /open ?bo|michat/i],
  ["percakapan", /percakapan|vcs|ngobrol|telpon/i],
  ["viral", /viral/i],
  ["gangbang", /gangbang|gilir|rame rame|threesome|foursome|bertiga/i],
  ["doggy", /doggy|nungging/i],
  ["colmek", /colmek|omek|coliin|dildo/i],
  ["kosan", /pacar|kosan|check ?in|hotel|\bkos\b|\bkost\b/i],
  ["istri", /istri|suami|selingkuh|hamil/i],
  ["amatir", /amatir|bokepindo|bokep indo|pasutri|pasangan/i],
  ["abg", /\babg\b|\bsma\b|mahasiswi|mahasiswa|pelajar/i],
];

export function detectCategory(title = "", fallback = "") {
  const text = `${title} ${fallback}`.trim();
  for (const [slug, re] of CATEGORY_RULES) {
    if (re.test(text)) return slug;
  }
  return "lainnya";
}

export function cleanTitle(raw = "") {
  return String(raw)
    .replace(/^\u25b6\s*/, "")
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

// PARTIAL RESTORE IN PROGRESS - do not use
export function parseVideoLink(url) { return null; }
export function parseMessage(text = "") { return { title: "Video", category: "", videos: [], urls: [] }; }
