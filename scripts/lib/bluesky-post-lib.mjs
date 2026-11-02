/**
 * Pure helpers for scripts/bluesky-post.mjs (tested in scripts/bluesky-post.test.mjs).
 * No network, no secrets.
 */
import { uploadModeration } from "../../src/lib/catalog/moderation.js";
import { reviewPendingReason, titleReviewReason } from "../../src/lib/catalog/review-pending.js";
import { titleHold } from "../../src/lib/bot/title-hold.js";

export const ORIGIN = "https://koleksidrpinguin.com";
export const MAX_PER_DAY = 6;
/** Only videos added in the last NEW_DAYS days are "new". */
export const NEW_DAYS = 4;
export const POST_LABEL = "porn";

/**
 * Extra Bluesky-only blocklist on top of the site's own title checks: leak / non-consent wording,
 * hidden cameras, anything that hints at age, school, family or a real named person. A title with
 * any of these is never posted (it can still be on the site).
 */
const BLOCK_RE = new RegExp(
  "\\b(?:" +
    [
      "bocor\\w*", "kesebar", "tersebar", "disebar\\w*", "sebar\\w*", "leak\\w*",
      "direkam", "rekam\\w*", "merekam", "hidden\\s*cam\\w*", "kamera\\s+tersembunyi", "spy\\s*cam\\w*", "cctv",
      "ngintip\\w*", "intip\\w*", "mengintip", "voyeur", "ketahuan", "grebek\\w*", "digrebek\\w*", "razia",
      "mabuk", "tidur\\w*", "pingsan", "obat", "dibius", "paksa\\w*", "dipaksa\\w*", "perkosa\\w*", "diperkosa\\w*",
      "rape\\w*", "gilir\\w*", "digilir\\w*", "ancam\\w*", "diancam\\w*", "peras\\w*", "balas\\s+dendam", "revenge",
      "sekolah", "seragam", "smp", "sma", "smk", "sd", "pelajar", "siswi?", "murid", "osis", "pramuka",
      "abg", "teen\\w*", "bocil", "belia", "umur", "muda", "imut", "lugu", "polos", "perawan", "virgin", "loli\\w*",
      "kecil", "young", "school\\w*", "student", "kids?", "anak\\w*", "dedek", "adek", "adik\\w*",
      "ayah\\w*", "bapak\\w*", "papa\\w*", "papi", "mama\\w*", "mami", "ibu\\w*", "emak", "kakak\\w*", "keponakan",
      "paman", "incest", "sedarah", "keluarga", "mertua", "tiri\\w*",
      "tiktok\\w*", "selebgram", "artis", "influencer", "youtuber", "streamer", "ukhti", "santri\\w*", "pondok",
      "hijab\\w*", "jilbab\\w*", "cadar", "pesantren", "deepfake", "fake",
      // amateur / private / real-person material (consent cannot be shown in a social post)
      "sextape", "sex\\s*tape", "viral\\w*", "rame", "percakapan\\w*", "pacar\\w*", "selfie", "casero", "amatir",
      "amateur", "homemade", "live", "vcs", "vc", "seleb\\w*", "indomaret", "alfamart", "shopee\\w*", "gojek", "ojol",
      "grab", "mahasi\\w*", "kampus", "kuliah", "kost", "gadis", "cewe\\w*\\s+sma", "suster", "nakes",
      "ai", "dibuat\\s+oleh", "buatan", "nezha", "yosuga\\w*", "anime", "hentai", "kartun", "cartoon",
      "bude", "pakde", "saudari\\w*", "keluarga\\w*", "guru\\w*", "dosen", "tocil", "abang\\w*", "bo", "open\\s*bo",
      "lacur", "murahan", "negro\\w*", "nigg\\w*", "menyelinap", "dibawa\\s+pulang", "bar", "clubbing", "dugem", "pelacur\\w*", "jual\\w*",
      // animated / game / adapted-series titles (characters of unclear age)
      "episode", "episose", "eps?", "bab", "modifikasi", "douluo", "ailin", "rongrong", "comic", "komik", "donghua",
      "reinkarnasi", "bereinkarnasi", "harem\\w*", "sistem", "game", "3d", "animasi",
      "bude", "pakde", "sodara\\w*", "saudara\\w*", "mamah", "ipar", "om",
    ].join("|") +
    ")\\b",
  "i",
);
/** Catalog categories never posted (amateur, leaked, real-person, hijab, AI, anime). */
const BLOCK_CATEGORIES = new Set([
  "amatir", "viral", "chindo", "jilbab", "hijab", "percakapan", "colmek", "live", "selebgram", "selingkuh",
  "skandal", "anime", "hentai", "ai-plus", "ai-gay", "ai", "abg", "sma", "pelajar",
]);
/** Any age number in the title ("18yo", "19 tahun") is left out too: age is never claimed in a post. */
const AGE_RE = /\b\d{1,2}\s?(?:yo|y\.?o\.?|years?|tahun|thn|th)\b/i;

/** Title without the " - koleksidrpinguin.com" brand suffix. */
export function baseTitle(title = "") {
  return String(title || "")
    .replace(/\s*[-|–]\s*koleksidrpinguin\.com\s*$/i, "")
    .replace(/^[\s!?.*#|\-–:]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "" when the title may be posted, else a short reason (logged, never posted). */
export function blockReason(item) {
  const raw = String(item?.title || "");
  const t = baseTitle(raw);
  if (!t || t.length < 8) return "judul kosong/pendek";
  if (item.hidden || item.hidden_reason) return "hidden";
  if (item.title_hold) return "title_hold";
  if (item.locked) return "locked";
  const mod = uploadModeration(raw, { category: item.category });
  if (mod.hide) return `moderation:${mod.hide}`;
  if (mod.review) return "review-pending";
  if (reviewPendingReason(item.id, [raw], { category: item.category })) return "review-pending";
  if (titleReviewReason(raw)) return "title-review";
  if (titleHold(raw)) return "title-hold";
  const cat = String(item.category || "").toLowerCase();
  if (BLOCK_CATEGORIES.has(cat) || cat.startsWith("ai-")) return `kategori ${cat}`;
  // Undo simple leetspeak ("T1KTOK", "Cr0t") before the word check.
  const norm = t.replace(/[0134]/g, (c) => ({ 0: "o", 1: "i", 3: "e", 4: "a" })[c]);
  const m = norm.match(BLOCK_RE) || t.match(BLOCK_RE);
  if (m) return `kata "${m[0].toLowerCase()}"`;
  if (AGE_RE.test(t)) return "angka umur";
  return "";
}

/** Count of posts made in the 24 h before `now`. */
export function postsLast24h(state, now = Date.now()) {
  return (state?.posted || []).filter((p) => now - Date.parse(p.at) < 86_400_000).length;
}

/**
 * Next video to post: newest first, added in the last NEW_DAYS days, live in the public sitemap,
 * not posted before (id or same title), passing blockReason.
 * @param {any[]} items catalog items (data/videos-latest.json order: newest first)
 * @param {Set<string>} liveIds ids in the live sitemap (public + indexable)
 * @param {{posted?: {id: string, title?: string}[]}} state
 */
export function pickNext(items, liveIds, state, now = Date.now()) {
  const postedIds = new Set((state?.posted || []).map((p) => String(p.id)));
  const postedTitles = new Set((state?.posted || []).map((p) => baseTitle(p.title || "").toLowerCase()).filter(Boolean));
  const minDay = new Date(now + 7 * 3600_000 - NEW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const sorted = [...items].sort((a, b) =>
    String(b.updated_at || b.date || "").localeCompare(String(a.updated_at || a.date || "")),
  );
  const skipped = [];
  for (const it of sorted) {
    if (!it?.id || String(it.date || "") < minDay) continue;
    const id = String(it.id);
    if (postedIds.has(id)) continue;
    if (!liveIds.has(id)) {
      skipped.push([id, "tidak ada di sitemap live"]);
      continue;
    }
    if (postedTitles.has(baseTitle(it.title).toLowerCase())) continue;
    const why = blockReason(it);
    if (why) {
      skipped.push([id, why]);
      continue;
    }
    return { item: it, skipped };
  }
  return { item: null, skipped };
}

export function watchUrl(id) {
  const q = new URLSearchParams({
    utm_source: "bluesky",
    utm_medium: "social",
    utm_campaign: "organic",
    utm_content: String(id),
  });
  return `${ORIGIN}/watch/${encodeURIComponent(id)}?${q}`;
}

const enc = new TextEncoder();
const byteLen = (s) => enc.encode(s).length;

/** Cut to `max` characters on a word boundary (Bluesky allows 300 graphemes). */
function clip(s, max) {
  const chars = [...s];
  if (chars.length <= max) return s;
  const cut = chars.slice(0, max - 1).join("");
  return `${cut.replace(/\s+\S*$/, "") || cut}…`;
}

/** app.bsky.feed.post record: text + link facet + external card (no image), self-labelled adult. */
export function buildPost(item, now = new Date()) {
  const title = clip(baseTitle(item.title), 200);
  const url = watchUrl(item.id);
  const shown = `koleksidrpinguin.com/watch/${item.id}`;
  const head = `${title}\n\n🔞 18+ · Tonton: `;
  const text = `${head}${shown}`;
  const start = byteLen(head);
  return {
    $type: "app.bsky.feed.post",
    text,
    createdAt: now.toISOString(),
    langs: ["id"],
    facets: [
      {
        index: { byteStart: start, byteEnd: start + byteLen(shown) },
        features: [{ $type: "app.bsky.richtext.facet#link", uri: url }],
      },
    ],
    embed: {
      $type: "app.bsky.embed.external",
      external: {
        uri: url,
        title: clip(title, 120),
        description: "Video dewasa 18+ di koleksidrpinguin.com. Langsung putar, tanpa daftar akun.",
      },
    },
    labels: { $type: "com.atproto.label.defs#selfLabels", values: [{ val: POST_LABEL }] },
  };
}

export const PROFILE_NAME = "Koleksi Dr. Pinguin";
export const PROFILE_BIO =
  "Koleksi video dewasa Indonesia, update tiap hari. 🔞 Khusus 18+: kalau umurmu di bawah 18 tahun, jangan buka. https://koleksidrpinguin.com";

/** Profile record with name/bio/adult label filled only where missing (null = nothing to change). */
export function profilePatch(current) {
  const cur = current && typeof current === "object" ? { ...current } : { $type: "app.bsky.actor.profile" };
  let changed = false;
  if (!String(cur.displayName || "").trim()) {
    cur.displayName = PROFILE_NAME;
    changed = true;
  }
  if (!String(cur.description || "").trim()) {
    cur.description = PROFILE_BIO;
    changed = true;
  }
  if (!cur.labels?.values?.length) {
    cur.labels = { $type: "com.atproto.label.defs#selfLabels", values: [{ val: POST_LABEL }] };
    changed = true;
  }
  cur.$type = "app.bsky.actor.profile";
  return changed ? cur : null;
}
