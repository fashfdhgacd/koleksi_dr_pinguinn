/**
 * Shared keyword -> tag dictionary (site catalog + Telegram bot), added 2026-10-27.
 *
 * Every tag is an existing /kategori slug (categories.ts), so a tag is also category membership;
 * thin categories stay noindex through SEO_MIN_COUNT / MIN_INDEXED_CATEGORY_COUNT as before.
 * These rules are ADDITIVE ONLY: title-tags.ts first computes the older tags exactly as before,
 * then `extraTags` appends more (never removes, never changes the primary category).
 * Computed at ingest (bot) and once per catalog build (site), never per request.
 *
 * Safety: never adds teen-18 / college-18, and adds nothing at all when the title has any
 * child / school / age wording (MINOR_BLOCK). Source-pure slugs (jav, videy, bokep, hentai) are never
 * added here. "gilir" / "prank" are deliberately absent (consent unclear).
 */

/** Child / school / age wording; any hit blocks every extra tag for the video. */
export const MINOR_BLOCK =
  /\b(?:sd|smp|sma|smk|mts|bocil|bocah|anak|pelajar|sekolah|siswi|siswa|seragam|abg|remaja|di ?bawah umur|loli|lolita|underage|child|children|kid|kids|school|schoolgirl|schoolboy|student|students|senior year|teen|teens|teenager|teenage|young|minor|preteen|guru|murid|osis|pramuka|ponakan|keponakan|adik|adek|bapak|ayah|papah|mamah tiri|ibu tiri|step\w*|incest|sedarah|kakak adik)\b/;

/** Slugs this module may never add. */
export const NEVER_ADD = new Set(["jav", "videy", "bokep", "hentai", "teen-18", "college-18", "lainnya", "ai-gay"]);

/** Max tags per video (primary included). */
export const MAX_TAGS = 12;

/** Extra synonyms per slug (Indonesian + English), whole words only. Order = priority. */
export const KEYWORD_TAG_RULES = [
  ["jilbab", /\b(?:hijabi|jilbob|krudung|kudung|syari|syar i|gamis|bercadar|niqob|muslimah|santriwati)\b/],
  ["tante", /\b(?:tante tante|ibu ibu|emak emak|bu rt|ibu rt|nyonya|janda muda|jamu|milfs|matang|mature woman|tante girang|tanteku)\b/],
  ["istri", /\b(?:istri sah|pengantin|pengantin baru|malam pertama|bulan madu|honeymoon|nikah|menikah|suami|suaminya|nyonya rumah|housewife)\b/],
  ["selingkuh", /\b(?:affair|cheating|cheat|ketahuan|digrebek|digerebek|bini orang|lakinya|selingkuhan|selingkuhannya|ntr)\b/],
  ["gangbang", /\b(?:3p|4p|keroyok|dikeroyok|rame rame|bareng temen|swap|swinger|tukar pasangan)\b/],
  ["barat", /\b(?:western|caucasian|eropa|usa|uk|german|jerman|french|perancis|ukraina|ukrainian|czech|euro)\b/],
  ["chindo", /\b(?:cici|cece|amoy|tionghoa)\b/],
  ["malaysia", /\b(?:awek|melayu|mek|kuala lumpur|johor|tudung)\b/],
  ["selebgram", /\b(?:selegram|celebgram|instagram|ig|youtuber|streamer|ofs|only fans|fansly|seleb tiktok)\b/],
  ["live", /\b(?:streaming|stream|ome tv|ometv|omegle|live show|show live|live bigo|live ig|live tiktok|siaran)\b/],
  ["open-bo", /\b(?:michat|bispak|lonte|pelacur|escort|pijat plus|pijit plus|massage plus|spa plus|terapis|ayam kampus|cewek bo|bo an|short time|longtime|long time|sugar baby)\b/],
  ["colmek", /\b(?:solo|toys|sex toy|sextoy|squirt|squirting|muncrat|ngocok|mainin sendiri|self service)\b/],
  ["sepong", /\b(?:nyepong|disepong|sepongan|ngisep|isep|emut|ngemut|kulum|blow job|oral sex|69)\b/],
  ["doggy", /\b(?:dari belakang|doggie|nungging|posisi anjing|back shot|backshot)\b/],
  ["wot", /\b(?:cowgirl|reverse cowgirl|diatas|di atas|goyangan|goyang pinggul|ngebor|riding)\b/],
  ["crot-dalam", /\b(?:dicrotin dalam|keluar dalam|cum inside)\b/],
  ["tobrut", /\b(?:busty|big boobs|bigboobs|tits|toket gede|susu gede|nenen|semox|bahenol|semlohay)\b/],
  ["kosan", /\b(?:kamar kos|anak kos|kos|kost|kontrakan|kos an)\b/],
  ["hotel", /\b(?:hotel melati|kamar hotel|checkin|airbnb|resort|staycation|guest house|guesthouse)\b/],
  ["kamar-mandi", /\b(?:mandi bareng|kamar mandi|bathroom|toilet umum|wc umum|showering|berendam|kolam)\b/],
  ["outdoor", /\b(?:public|publik|di jalan|jalanan|rooftop|atap|tangga darurat|bioskop|alun alun|kebun|di luar|camping|kemah|tenda)\b/],
  ["percakapan", /\b(?:desah|desahan|mendesah|suara desah|ngobrol|asmr|talking|ngedirty|dirty|ngomong|bahasa jawa|sunda|logat)\b/],
  ["viral", /\b(?:lagi viral|viral banget|rame dibicarakan|geger|gempar|bocor|bocoran|leak|leaked)\b/],
  ["amatir", /\b(?:amatiran|cctv|hidden cam|hiddencam|kamera tersembunyi|kamera hp|rekam hp|selfie|pov|pribadi|ngewe|ngentot|ewe|entot|pacaran|ayang|cowoknya|ceweknya)\b/],
  ["cantik", /\b(?:manis|bening|mulus|seksi|sexy|glowing|putih mulus|cakepp|cantik banget|ayu|kinclong|primadona)\b/],
  ["tiktok", /\b(?:tik tok|tiktokan|fyp|snack video|reels|joget tiktok)\b/],
  ["vcs", /\b(?:vc|vc sex|vid call|call sex|videocall|video call mesum)\b/],
  ["kompilasi", /\b(?:compile|kumpulan|full collection|part \d+ \d+|all in one|aio)\b/],
  ["mantan", /\b(?:ex|ex gf|ex girlfriend|bekas pacar|mantan pacar|balikan)\b/],
  ["tetangga", /\b(?:neighbor|neighbour|sebelah rumah|tetangga sebelah)\b/],
  ["kacamata", /\b(?:specs|eyeglasses|nerd)\b/],
  ["kantor", /\b(?:bos|boss|atasan|bawahan|staff|staf|pegawai|kerja|meeting|kantoran|resepsionis)\b/],
  ["anal", /\b(?:anal sex|lewat belakang|lobang pantat|ass fuck|assfuck|butt fuck)\b/],
  ["hamil", /\b(?:pregnant|lagi hamil|ibu hamil)\b/],
  ["ojol", /\b(?:driver|kurir|abang ojek|maxim|shopeefood|gofood)\b/],
  ["tante", /\b(?:budhe|bude|bunda|tante binal|mbak|mba|teteh|ibu muda|mahmud)\b/],
  ["open-bo", /\b(?:bookingan|booking|order|cewe bayaran|pesan cewek|jasa)\b/],
  ["live", /\b(?:host|mango|nimo|hago|live bareng|lagi live)\b/],
  ["selebgram", /\b(?:konten|kontenin|content creator|pamer|endorse)\b/],
  ["kompilasi", /\b(?:collection|koleksi video|bundle)\b/],
  ["gangbang", /\b(?:sex party|party|pesta seks|pesta)\b/],
  ["outdoor", /\b(?:mall|warung|parkir|motor|pos ronda)\b/],
  ["percakapan", /\b(?:ahh|ahhh|aahh|enak banget|nikmat|sayang|ngedesah)\b/],
  ["amatir", /\b(?:ngewek|ngewekin|pacarku|pacar ku|merekam|rekam|ngintip|ngintipin|kakak|mas|cewe|cewek|cowo|cowok|jatah)\b/],
  ["amatir", /\b(?:indo|indonesia|lokal|local|jawa|jakarta|bandung|surabaya|medan|bali|jogja|semarang)\b/],
];

/** Host / source -> tags (only real catalog themes, never source-pure slugs). */
export const SOURCE_TAG_RULES = [
  // IndoAV / UserBokep / Putarin / Videy-hosted Indo uploads are Indonesian amateur clips.
  ["amatir", /indoav|userbokep|putarin|puterin|videy/i],
];

/**
 * Extra tags to append after the existing ones.
 * @param {string} t normalized title (normCategoryText, templates already stripped)
 * @param {string[]} current tags already chosen (primary first); not modified
 * @param {{ sourceText?: string, storedTags?: string[], allowed?: (slug: string) => boolean }} [opts]
 * @returns {string[]} new tags only, so current + result has at most MAX_TAGS
 */
export function extraTags(t, current, opts = {}) {
  const out = [];
  if (MINOR_BLOCK.test(` ${t} `) || (opts.storedTags || []).some((x) => MINOR_BLOCK.test(String(x).toLowerCase()))) return out;
  const allowed = opts.allowed || (() => true);
  const add = (slug) => {
    if (current.length + out.length >= MAX_TAGS) return;
    if (NEVER_ADD.has(slug) || !allowed(slug) || current.includes(slug) || out.includes(slug)) return;
    out.push(slug);
  };
  // Tags the bot stored at ingest (only real category slugs survive `allowed`).
  for (const s of opts.storedTags || []) add(String(s).toLowerCase().trim());
  if (t) for (const [slug, re] of KEYWORD_TAG_RULES) if (re.test(t)) add(slug);
  const src = opts.sourceText || "";
  if (src && t) for (const [slug, re] of SOURCE_TAG_RULES) if (re.test(src)) add(slug);
  return out;
}
