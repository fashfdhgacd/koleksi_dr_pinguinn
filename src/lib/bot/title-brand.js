/**
 * Judul upload bot (video BARU saja; katalog lama tidak ditulis ulang).
 *
 * 1. Buang branding situs / channel Telegram lain di akhir judul ("… - AVTub", "… | BokepHot",
 *    "… @channel", "… t.me/xxx", "… [indo18.buzz]", "… Join tele …").
 * 2. Buang branding pinguin lama ("(Koleksi Dr. Pinguin Bokep, M.S.B.)", "Dr Pinguin",
 *    "koleksidrpinguin.com") supaya tidak dobel.
 * 3. Pasang tepat satu akhiran " - koleksidrpinguin.com" (keputusan pemilik), lewat brandUploadTitle().
 *
 * Prinsip: ragu → biarkan. Potongan akhir hanya dibuang kalau jelas branding: ada di daftar
 * KNOWN_FOREIGN_BRANDS, berbentuk domain / @handle / t.me / ajakan join tele, atau satu kata
 * gabungan nama situs (KingBokep, IndoViral44, AVTub). Isi judul ("Part 2", "Full", "Viral",
 * "Jav", "Indo", nama pemeran, kode JAV) tidak disentuh.
 *
 * Tanpa import: dipakai bot Workers (src/lib/bot/parse.js) dan bot Node lama (lib/parse.js).
 */

export const BRAND_DOMAIN = "koleksidrpinguin.com";
export const BRAND_SUFFIX = ` - ${BRAND_DOMAIN}`;

/**
 * Nama situs / channel lain yang selalu dibuang kalau berdiri sendiri di akhir judul
 * (setelah pemisah " - ", " | ", " – ", " — ", " · " atau di dalam kurung). Huruf kecil,
 * tanpa tanda baca, spasi tunggal. Tambah nama baru di sini.
 */
export const KNOWN_FOREIGN_BRANDS = [
  "avtub",
  "avtube",
  "avp",
  "babi bakar",
  "babibakar",
  "indoav",
  "indo av",
  "userbokep",
  "user bokep",
  "putarin",
  "puterin",
  "streamtape",
  "videy",
  "videyy",
  "lulustream",
  "doodstream",
  "dood",
  "xvideos",
  "xnxx",
  "pornhub",
  "xhamster",
  "spankbang",
  "eporner",
  "missav",
  "jable",
  "supjav",
  "javhd",
  "javmost",
  "javgg",
  "bokephot",
  "bokep hot",
  "bokepidaman",
  "kingbokep",
  "king bokep",
  "indo18",
  "xxxbp",
  "bokepcyou",
  "bokep cyou",
  "ladangbokep",
  "ladang bokep",
  "indoviral44",
  "rajasex",
  "bosbokep",
  "myvidster",
  "simontok",
  "bokepindo",
  "telegram",
  "youtube",
];

/** Kata biasa yang mirip nama gabungan situs tapi isi judul. Jangan dibuang. */
const COMMON_WORDS = new Set([
  "sexy",
  "sexi",
  "seksi",
  "sexual",
  "javanese",
  "bathtub",
  "hubby",
  "tube",
  "viral",
  "bokep",
  "porn",
  "jav",
  "indo",
  "indonesia",
  "indonesian",
]);

/** Akhiran kata Indonesia: "viralnya", "bokepin" dsb. tetap isi judul. */
const ID_AFFIX_RE = /^(nya|kan|an|in|lah|ku|mu|kah|pun)$/i;

const TLDS =
  "com|net|org|xyz|site|online|top|icu|lol|biz|info|me|tv|co|id|club|live|fun|pro|link|cc|ws|vip|buzz|today|mobi|academy|space|dev|app|io|cyou|sbs|shop|store|asia|to|su|ru|pw|tk|ml|ga|cf|gq|my|ph|win|bid|stream|watch|video|xxx|porn|sex|tube|lat|homes|pics|wiki|cam|cfd|click|rest|quest|tokyo|world|website|digital|social|life|monster|bond|skin|hair|boats|autos|beauty|makeup|quest|zone";

/** "xxx.com", "www.situs.net/path", "https://a.b.xyz", "situs.pages.dev" (TLD whitelist). */
const DOMAIN_RE = new RegExp(
  `^(?:https?:\\/\\/)?(?:www\\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})(?:\\/\\S*)?$`,
  "i",
);

/** Nama gabungan satu kata: stem situs di depan (BokepHot, ViralIndo) atau di belakang (KingBokep, AVTub, PornHub, Indo18). */
const PREFIX_STEM_RE = /^(bokep|viral|porn|xxx|sex|jav|ngentot|colmek|memek|ngewe|nonton|nobar)([a-z0-9]{2,})$/i;
const SUFFIX_STEM_RE = /^([a-z0-9]{2,})(bokep|tube|tub|porn|xxx|hub|viral|sex|jav|18|21|69)$/i;
const NUMBERED_PART_RE = /^(part|pt|eps?|episode|vol|chapter|ch|no|scene|sesi|hari|day)\d*$/i;

/** Frasa brand pinguin (dengan/tanpa kurung, bisa terpotong di akhir). Wajib ada "dr" + "pinguin". */
const PINGUIN_ANY_RE =
  /[\(\[]?\s*\b(?:koleksi[\s_]*)?dr[\s_.]*pinguinn?(?:[\s_]*bokep)?(?:\s*,?\s*(?:m\.?\s*s\.?\s*b\b\.?|m\.\s*s\b\.?))?(?:\.(?:com|site))?\s*[\)\]]?/gi;

/** Pemisah antar potongan judul. Tanda hubung butuh spasi di depan (biar "SSIS-123" utuh). */
const SEP_RE = /\s+[-~]{1,2}\s*|\s*[|•·»–—]+\s*/g;

function normBrand(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unwrap(seg) {
  return String(seg)
    .trim()
    .replace(/^[\s"'“”‘’«»\(\[\{【]+|[\s"'“”‘’«»\)\]\}】.,!:;]+$/g, "")
    .trim();
}

/** Branding pinguin lama (judul IndoAV pemilik): "(Koleksi Dr. Pinguin Bokep, M.S.B.)", "Dr Pinguin", "M.S.B.", domain. */
export function isPinguinBrand(seg) {
  const s = unwrap(seg);
  if (!s) return false;
  if (/pinguin|penguin/i.test(s) && s.split(/\s+/).length <= 8) return true;
  return /^m\.?\s*s\.?\s*b\.?$/i.test(s);
}

function isCompoundSiteToken(token) {
  const t = String(token);
  if (!/^[a-z0-9]{5,}$/i.test(t) || !/[a-z]/i.test(t)) return false;
  const low = t.toLowerCase();
  if (COMMON_WORDS.has(low) || NUMBERED_PART_RE.test(low)) return false;
  const p = low.match(PREFIX_STEM_RE);
  if (p && !ID_AFFIX_RE.test(p[2])) return true;
  const s = low.match(SUFFIX_STEM_RE);
  if (s && !ID_AFFIX_RE.test(s[1])) return true;
  return false;
}

/** True kalau potongan (tanpa pemisah) jelas branding situs / channel lain. Ragu → false. */
export function isForeignBrand(seg) {
  const raw = String(seg || "").trim();
  const s = unwrap(raw);
  if (!s) return false;
  const words = s.split(/\s+/);
  // t.me/xxx, link telegram, ajakan join tele / grup / channel
  if (/(?:^|\s)(?:https?:\/\/)?t\.me\//i.test(s)) return true;
  // "Telegram", "Tele: …", "Telegram @…", "Telegram channel …", "Telegram IndoViral44" (bukan "Telegram Bocor")
  if (/^(?:telegram|tele|tg)$/i.test(s)) return true;
  if (words.length <= 10 && /^(?:telegram|tele|tg)\s*(?:[:：@]|\b(?:channel|ch|grup|group)\b)/i.test(s)) return true;
  if (words.length === 2 && /^(?:telegram|tele|tg)$/i.test(words[0]) && (isCompoundSiteToken(words[1]) || KNOWN_FOREIGN_BRANDS.includes(normBrand(words[1]))))
    return true;
  if (
    words.length <= 10 &&
    /\b(?:join|gabung|follow|ikuti|subscribe|sub)\b[\s\S]*(?:\b(?:tele(?:gram)?|tg|grup|group|channel|ch|ig|instagram)\b|@)/i.test(s)
  )
    return true;
  if (words.length > 4) return false;
  // @channel
  if (words.length === 1 && /^@[\w.]{2,}$/.test(s)) return true;
  // domain / url
  if (words.length === 1 && (DOMAIN_RE.test(s) || /^https?:\/\//i.test(s))) return true;
  // daftar nama yang dikenal
  if (KNOWN_FOREIGN_BRANDS.includes(normBrand(s))) return true;
  // satu kata gabungan nama situs
  if (words.length === 1 && isCompoundSiteToken(s)) return true;
  return false;
}

function hasContent(s) {
  return /[\p{L}\p{N}]{2,}/u.test(String(s || ""));
}

/** Satu putaran pembersihan ujung judul. Mengembalikan judul baru (atau sama kalau tidak ada yang dibuang). */
function stripOnce(t) {
  let m;
  // 1. Kurung di akhir: "(Koleksi Dr. Pinguin …)", "[indo18.buzz]", "(@channel)"
  m = t.match(/^(.*?)\s*[\(\[\{【]([^\(\)\[\]\{\}【】]{1,80})[\)\]\}】]\s*$/u);
  if (m && hasContent(m[1]) && (isPinguinBrand(m[2]) || isForeignBrand(m[2]))) return m[1];

  // 2. Potongan terakhir setelah pemisah: "… - AVTub", "… | BokepHot", "… — Koleksi Dr. Pinguin"
  let last = null;
  SEP_RE.lastIndex = 0;
  let sm;
  while ((sm = SEP_RE.exec(t))) {
    if (sm.index + sm[0].length < t.length) last = sm;
    if (sm[0].length === 0) SEP_RE.lastIndex += 1;
  }
  if (last) {
    const head = t.slice(0, last.index);
    const seg = t.slice(last.index + last[0].length);
    if (hasContent(head) && (isPinguinBrand(seg) || isForeignBrand(seg))) return head;
  }

  // 3. Tanpa pemisah di ujung: "@channel", "t.me/xxx", "https://…", "situs.com", "Join tele …", "Telegram: …"
  const tailRules = [
    /^(.*?)\s+(?:join|gabung|follow|ikuti|subscribe)\s+(?:tele(?:gram)?|tg|grup|group|channel|ch|ig|instagram)\b.*$/i,
    /^(.*?)\s+(?:telegram|tele|tg)\s*[:：@]\s*\S.*$/i,
    /^(.*?)\s+(?:https?:\/\/|www\.|t\.me\/)\S+$/i,
    /^(.*?)\s+@[\w.]{2,}$/,
  ];
  for (const re of tailRules) {
    m = t.match(re);
    if (m && hasContent(m[1])) return m[1];
  }
  m = t.match(/^(.*?)\s+(\S+)$/);
  if (m && hasContent(m[1]) && DOMAIN_RE.test(m[2].replace(/[.,;:!]+$/, ""))) return m[1];

  // 4. Branding pinguin tanpa pemisah: "… Koleksi Dr. Pinguin Bokep, M.S.B.", "… Dr Pinguin", "… M.S.B."
  m = t.match(/^(.*?)[\s,]*\b(?:koleksi\s*)?dr\.?\s*pinguin(?:\s*bokep)?(?:\s*,?\s*m\.?\s*s\.?\s*b\.?)?\s*$/i);
  if (m && hasContent(m[1])) return m[1];
  m = t.match(/^(.*?)[\s,]*\bM\.S\.B\.?\s*$/);
  if (m && hasContent(m[1])) return m[1];

  return t;
}

/** Kata sambung yang tertinggal setelah branding dibuang: "… BY bwka7r.bsky.social" → "…". */
function dropDangling(head) {
  const m = head.match(/^(.*?)[\s,]+(?:by|via|from|oleh|credit|cr|src|source|sumber)\s*[:：]?\s*$/i);
  return m && hasContent(m[1]) ? m[1] : head;
}

function stripLeading(t) {
  // Hanya penanda kuat di depan: "[KingBokep] Judul", "indo18.buzz - Judul", "AVTub | Judul".
  // Nama gabungan / @handle di depan dibiarkan (sering nama pemeran: "@nov4prilia (NOVA APRILIA)").
  let m = t.match(/^\s*[\(\[\{【]([^\(\)\[\]\{\}【】]{1,60})[\)\]\}】]\s*(?:[-|–—:·]\s*)?(.*)$/u);
  if (m && hasContent(m[2]) && (isPinguinBrand(m[1]) || isForeignBrand(m[1]))) return m[2];
  m = t.match(/^\s*([^\s|–—·]+(?:\s+[^\s|–—·]+){0,2})(?:\s+[-~]{1,2}\s*|\s*[|–—·•»]+\s*)(.*)$/);
  if (m && hasContent(m[2])) {
    const lead = unwrap(m[1]);
    if (isPinguinBrand(lead) || DOMAIN_RE.test(lead) || KNOWN_FOREIGN_BRANDS.includes(normBrand(lead))) return m[2];
  }
  return t;
}

/**
 * Kata usia ala aturan Pornhub: "teen/teens/teenager(s)", "ABG", "remaja", "belia" -> "18+" (pemeran dewasa).
 * "Cewek ABG" -> "Cewek 18+", "ABG Hijab" -> "Cewek 18+ Hijab". Idempotent.
 */
export function adultAgeWording(raw = "") {
  return String(raw ?? "")
    .replace(/\b(cewek|cewe|cwe|gadis|girl)\s+(?:abg|teens?|teenagers?|remaja|belia)\b/gi, "$1 18+")
    .replace(/\babg\b/gi, "Cewek 18+")
    .replace(/\b(?:teenagers?|teens?|remaja|belia)\b/gi, "18+")
    .replace(/18\+(?:\s+18\+)+/g, "18+")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Judul dasar tanpa branding siapa pun (situs lain maupun pinguin). Idempotent.
 * Kosong → "Video" (dipakai bot untuk tahu "tidak ada judul").
 */
export function cleanUploadTitle(raw = "") {
  let t = String(raw ?? "")
    .replace(/^\u25b6\s*/, "")
    .replace(/^[\u{1F4C1}\u{1F4C2}\u{1F3AC}\u{1F3A5}\u{1F4F9}]\s*/u, "")
    .replace(/^judul\s*[:\uff1a-]\s*/i, "")
    .replace(/^title\s*[:\uff1a-]\s*/i, "")
    // No markup in titles: drop < and > (titles end up in HTML/JSON-LD on the site).
    .replace(/[<>]/g, " ")
    .replace(/[\u200b\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Branding pinguin sendiri di mana saja (akhiran dipasang ulang sekali oleh brandUploadTitle):
  // "Indo FC2543 (Koleksi Dr. Pinguin Bokep, M.S.B.) CANTIK", "AI Bokep koleksi_dr_pinguin.com (10)",
  // "… (Koleksi Dr. Pinguin Bokep, M.S" (terpotong), "koleksidrpinguin.com".
  const before = t;
  t = t
    .replace(/[\(\[][^\(\)\[\]]*pinguin[^\(\)\[\]]*[\)\]]/gi, " ")
    .replace(/(?:https?:\/\/)?(?:www\.)?koleksidrpinguin\.(?:com|site)\/?/gi, " ")
    .replace(PINGUIN_ANY_RE, " ")
    .replace(/[\(\[]\s*[\)\]]/g, " ")
    .replace(/\s+([,)\]])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s\-|–—·•:,~]+/u, "");
  // Judulnya cuma brand + nomor ("Koleksi Dr. Pinguin Bokep, M.S.B (27)") → biarkan, jangan jadi "(27)".
  if (!/\p{L}{2,}/u.test(t)) t = before;
  t = t.replace(/[\s\-|–—·•:,~]+$/u, "").trim();

  for (let i = 0; i < 6; i++) {
    const cut = stripOnce(t);
    const next = stripLeading(cut === t ? t : dropDangling(cut)).replace(/[\s\-|–—·•:,~]+$/u, "").trim();
    if (next === t) break;
    t = next;
  }

  return (
    adultAgeWording(t)
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[\-|]+|[\-|]+$/g, "")
      .trim() || "Video"
  );
}

/** Judul final yang disimpan untuk upload baru: judul dasar + tepat satu " - koleksidrpinguin.com". */
export function brandUploadTitle(raw = "") {
  const base = cleanUploadTitle(raw);
  return `${base}${BRAND_SUFFIX}`;
}
