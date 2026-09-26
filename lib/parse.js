const STREAMTAPE_HOST = /(^|\.)streamtape\.com$/i;
const PUTARIN_HOST = /(^|\.)putarin\.com$/i;

/**
 * Deteksi JAV / Hentai yang benar.
 * Cover:
 * 1. Kode klasik  SSIS-001, IPZZ-567, RKI-707, MIDE-970
 * 2. Provider     FC2, HEYZO, CARIB, 1PONDO, TOKYO-HOT, dll
 * 3. Keyword      JAV, HENTAI, UNCENSORED, CENSORED
 * 4. Hentai anime judul Jepang + Eps XX
 * 5. Studio besar S1, Moodyz, SOD, Prestige, Idea Pocket, dll
 */
export function isJav(title = "") {
  const t = String(title || "").trim();
  if (!t) return false;
  const u = t.toUpperCase();

  // 1. Kode produk klasik: IPZZ-567, SSIS-001, RKI-707, ABF-331, dll
  if (/\b([A-Z]{2,8})[-_]?\d{2,5}\b/.test(u)) return true;

  // 2. Provider / label khusus
  if (
    /\b(FC2|HEYZO|CARIB|CARIBBEAN|1PONDO|PACO|TOKYO.?HOT|KIN8|GACHI|AVOP|MUGEN|HEYDOUGA|PRESTIGE|SOD|MOODYZ|IDEA.?POCKET|E-BODY|FITCH|OPPAI|WANZ|ATTACKERS|S1\b|FALENO|MADONNA|JULIA)\b/.test(
      u
    )
  )
    return true;

  // 3. Keyword eksplisit
  if (/\b(JAV|HENTAI|UNCENSORED|CENSORED|AV JEPANG|JEPANG AV|JAPAN AV)\b/.test(u)) return true;

  // 4. Pola episode hentai anime (judul romaji + Eps/Episode)
  //    contoh: "Akane wa Tsumare Somerareru Eps 01"
  if (/\b(EPS?|EPISODE)\s*\d{1,3}\b/i.test(t) && /[a-z].*[a-z]/i.test(t) && !/\b(bokep|indo|hijab|jilbab|tante|viral)\b/i.test(t))
    return true;

  // 5. Judul Jepang panjang tanpa kata Indo umum (heuristic hentai series)
  //    banyak spasi + huruf latin, tidak ada kata Indo khas
  const words = t.split(/\s+/).filter(Boolean);
  if (
    words.length >= 4 &&
    !/\b(bokep|indo|hijab|jilbab|tante|janda|viral|live|abg|sma|colmek|doggy|gangbang|istri|suami|kosan|hotel)\b/i.test(t) &&
    /\b(wa|no|ni|to|ga|wo|de|desu|chan|kun|san|sama|sensei|onee|imouto|ane|otoko|onna|ecchi|sex|xxx)\b/i.test(t)
  )
    return true;

  return false;
}

const CATEGORY_RULES = [
  // JAV dulu biar prioritas lebih tinggi dari amatir/viral
  ["jav", null], // dihandle khusus lewat isJav()
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

  // Prioritas JAV — semua 600+ judul harus masuk sini
  if (isJav(text)) return "jav";

  for (const [slug, re] of CATEGORY_RULES) {
    if (!re) continue;
    if (re.test(text)) return slug;
  }
  return "lainnya";
}

export function cleanTitle(raw = "") {
  return (
    String(raw)
      .replace(/^\u25b6\s*/, "")
      .replace(/koleksidrpinguin\.(com|site)/gi, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[\-|]+|[\-|]+$/g, "") || "Video"
  );
}

export function extractUrls(text = "") {
  const found = String(text).match(/https?:\/\/[^\s<>"']+/gi) || [];
  return found.map((u) => u.replace(/[),.;]+$/g, ""));
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
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

  if (STREAMTAPE_HOST.test(host) || /strcloud/i.test(host)) {
    const m =
      path.match(/\/(?:e|v|d)\/([A-Za-z0-9_-]+)/i) ||
      parsed.search.match(/[?&]id=([A-Za-z0-9_-]+)/i);
    if (!m) return null;
    const id = m[1];
    const embed = `https://streamtape.com/e/${id}`;
    return {
      id,
      host: "streamtape",
      source: "Streamtape",
      embed,
      direct: embed,
      file: `videos.json`,
    };
  }

  if (PUTARIN_HOST.test(host) || /panel\.putarin/i.test(host)) {
    const m =
      path.match(/\/(?:e|v|d|video)\/([A-Za-z0-9_-]+)/i) ||
      parsed.search.match(/[?&](?:code|id)=([A-Za-z0-9_-]+)/i);
    if (!m) return null;
    const id = m[1];
    const embed = `https://panel.putarin.com/e/${id}`;
    const watch = `https://panel.putarin.com/v/${id}`;
    return {
      id,
      host: "putarin",
      source: "Putarin",
      embed,
      direct: watch,
      file: `putarin.json`,
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
  for (const url of urls) {
    const parsed = parseVideoLink(url);
    if (parsed) videos.push(parsed);
  }

  return { title: cleanTitle(title), category, videos, urls };
}
