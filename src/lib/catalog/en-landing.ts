/**
 * English keyword landing pages for koleksidrpinguin.com (/en/<slug>).
 *
 * Hand-written English copy only (not a translation of the Indonesian /genre pages).
 * A page is indexable only while it has at least LANDING_MIN_VIDEOS matching videos.
 * Watch pages are unchanged. No ads are added on these pages.
 *
 * Kept free of heavy imports so node --test can load it directly.
 */
import { LANDING_MIN_VIDEOS, hasBannedWord } from "./landing.ts";
import { cariHref, enHref } from "./halaman.ts";

export { LANDING_MIN_VIDEOS, LANDING_PAGE_SIZE, LANDING_INDEX_PAGES } from "./landing.ts";

export type EnLandingDef = {
  slug: string;
  /** Title, category, and tag text must match this (case-insensitive). */
  match: RegExp;
  h1: string;
  /** Document title without the site suffix. */
  title: string;
  description: string;
  /** Two or three short English sentences. */
  intro: string;
  /** Matching Indonesian /genre slug, when the two pages really correspond. */
  idSlug?: string;
};

export const EN_LANDINGS: EnLandingDef[] = [
  {
    slug: "indonesian-amateur",
    match: /\b(?:amatir|amateur|homemade|home made|rekam sendiri|pacar|pacarnya|rumahan)\b/i,
    h1: "Indonesian Amateur Videos",
    title: "Indonesian Amateur Videos",
    description:
      "Indonesian amateur videos from IndoAV and UserBokep, ranked by views. Watch in the browser, no account needed. 18+ only.",
    intro:
      "This page gathers Indonesian amateur recordings already in the Koleksi Dr Pinguin catalog — everyday adult couples and homemade clips, not studio features. They are ordered by views so the most watched titles sit at the top. Everyone shown is 18 or older; press play in your browser, no signup required.",
    idSlug: "bokep-indo-amatir",
  },
  {
    slug: "indo-hijab",
    match: /\b(?:jilbab|jilboob|berjilbab|hijab|hijaber|hijabers|kerudung|tudung|cadar|niqab|ukhti|akhwat|jilbaber|hijaban)\b/i,
    h1: "Indonesian Hijab Videos",
    title: "Indonesian Hijab Videos",
    description:
      "Indonesian hijab and jilbab videos from our IndoAV and UserBokep catalog. Stream on your phone. 18+ only.",
    intro:
      "A short list of Indonesian hijab and jilbab videos that already sit in our catalog, from modest everyday dress to longer amateur recordings. The grid follows view count, not upload date, so popular titles appear first. All performers are adults, and you can watch in the browser without creating an account.",
    idSlug: "bokep-jilbab-indo",
  },
  {
    slug: "indonesian-milf",
    match: /\b(?:tante|milf|janda|stw|mature|mamah muda|mama muda|cougar)\b/i,
    h1: "Indonesian MILF and Mature Videos",
    title: "Indonesian MILF & Mature Videos",
    description:
      "Indonesian MILF, STW, and mature amateur videos, ranked by views. Stream without an account. 18+ only.",
    intro:
      "These clips feature older Indonesian women — often tagged tante, STW, or MILF in the original titles — drawn from IndoAV and UserBokep. The order is by views, so the titles people actually watch rise to the top. Every performer is an adult; start with the first row or browse later pages for more of the same.",
    idSlug: "bokep-indo-stw",
  },
  {
    slug: "indo-viral",
    match: /\b(?:viral|trending|lagi rame|heboh)\b/i,
    h1: "Viral Indonesian Videos",
    title: "Viral Indonesian Videos",
    description:
      "Indonesian videos that circulated widely, collected from our catalog and sorted by views. Watch in the browser. 18+ only.",
    intro:
      "A collection of Indonesian clips whose titles mark them as viral or widely shared, not a scrap of random social feeds. We only keep videos that already passed our catalog checks. They are sorted by views, and everyone on screen is 18 or older.",
  },
  {
    slug: "indonesian-live",
    match: /\b(?:live|livestream|live stream|bigo|mango live|siaran langsung)\b/i,
    h1: "Indonesian Live Recordings",
    title: "Indonesian Live Recordings",
    description:
      "Recorded Indonesian live shows and livestreams from our catalog. Play them on your phone, no login. 18+ only.",
    intro:
      "These are recordings of Indonesian live sessions — phone cameras, chat rooms, and informal streams — already stored in the Koleksi Dr Pinguin catalog. The list is ranked by views rather than the original air time. All performers are adults, and playback works in a normal browser tab.",
    idSlug: "bokep-live-indo",
  },
  {
    slug: "indonesian-wife",
    match: /\b(?:istri|istriku|istrinya|bini|wife|pasutri|suami istri)\b/i,
    h1: "Indonesian Wife Videos",
    title: "Indonesian Wife Videos",
    description:
      "Indonesian wife and married-couple videos from IndoAV and UserBokep. Stream without signing up. 18+ only.",
    intro:
      "This grid collects Indonesian videos whose titles describe wives and married couples, taken only from sources we already host. Popular titles float to the top by view count. Everyone appearing here is 18 or older; watch in the browser at your own pace.",
    idSlug: "bokep-istri-indo",
  },
  {
    slug: "malay-indo",
    match: /\b(?:malaysia|malay|melayu|awek|rempit)\b/i,
    h1: "Malay and Indonesian Videos",
    title: "Malay & Indonesian Videos",
    description:
      "Malay and Indonesian amateur videos from our catalog, including Malaysian titles. Stream on your phone. 18+ only.",
    intro:
      "A mixed shelf of Malay and Indonesian videos — Malaysian amateur titles alongside closely related Indonesian clips already in the catalog. We keep the most watched recordings first so you can scan quickly. All performers are adults, and nothing here needs a new account to play.",
    idSlug: "bokep-cewek-malaysia",
  },
  {
    slug: "indo-western",
    match: /\b(?:bule|barat|western|interracial|foreigner)\b/i,
    h1: "Indonesian and Western Pairings",
    title: "Indonesian & Western Pairings",
    description:
      "Indonesian videos with Western partners, collected from our IndoAV and UserBokep catalog. 18+ only.",
    intro:
      "These titles mention a Western partner together with an Indonesian performer — the clips people often look for when they want that pairing, not a translated copy of another page. They are ranked by views from our own catalog. Everyone shown is 18 or older.",
  },
  {
    slug: "indonesian-tiktok",
    match: /\b(?:tiktok|tiktoker|tiktokers|tik tok)\b/i,
    h1: "Indonesian TikTok-Style Videos",
    title: "Indonesian TikTok-Style Videos",
    description:
      "Indonesian videos tagged or titled around TikTok, drawn from our catalog and sorted by views. 18+ only.",
    intro:
      "A set of Indonesian adult videos whose titles point to TikTok-style clips, not a scrape of the app itself. Every file already lives in the Koleksi Dr Pinguin catalog and has been checked before it appears here. The list follows view count, and all performers are 18 or older.",
  },
  {
    slug: "indonesian-outdoor",
    match: /\b(?:outdoor|di hutan|di kebun|di mobil|dalam mobil|pinggir jalan|di gunung|semak)\b/i,
    h1: "Indonesian Outdoor Videos",
    title: "Indonesian Outdoor Videos",
    description:
      "Indonesian outdoor and in-car amateur videos from our catalog. Watch in the browser. 18+ only.",
    intro:
      "Outdoor Indonesian recordings — parks, cars, and other spots away from a bedroom — taken from titles already in our catalog. Views decide the order, so the familiar clips appear first. All performers are adults; you can play them without installing anything.",
  },
  {
    slug: "indonesian-bathroom",
    match: /\b(?:kamar mandi|kamarmandi|toilet|shower|bak mandi)\b/i,
    h1: "Indonesian Bathroom Videos",
    title: "Indonesian Bathroom Videos",
    description:
      "Indonesian bathroom and shower amateur videos from IndoAV and UserBokep. Stream without an account. 18+ only.",
    intro:
      "These Indonesian amateur clips are set in a bathroom or shower, according to the titles we already store. Hidden-camera wording is kept out of this list. The grid is sorted by views, and every performer is 18 or older.",
  },
  {
    slug: "indonesian-cheating",
    match: /\b(?:selingkuh|perselingkuhan|affair)\b/i,
    h1: "Indonesian Cheating Videos",
    title: "Indonesian Cheating Videos",
    description:
      "Indonesian affair and cheating-themed amateur videos from our catalog, ranked by views. 18+ only.",
    intro:
      "A catalog slice of Indonesian videos whose titles describe an affair between consenting adults. We do not use this page for hidden-camera or non-consent wording. Clips are ordered by views, and everyone on screen is 18 or older.",
    idSlug: "bokep-selingkuh",
  },
  {
    slug: "indo-chinese",
    match: /\b(?:chindo|cindo|cina indo|chinese indo)\b/i,
    h1: "Chinese-Indonesian Videos",
    title: "Chinese-Indonesian Videos",
    description:
      "Chinese-Indonesian (Chindo) amateur videos from our IndoAV and UserBokep catalog. 18+ only.",
    intro:
      "These recordings are tagged or titled as Chinese-Indonesian (Chindo) and already belong to the Koleksi Dr Pinguin catalog. The most watched titles lead the list. All performers are adults, and you can stream them in the browser.",
    idSlug: "bokep-chindo",
  },
  {
    slug: "indonesian-hotel",
    match: /\b(?:hotel|oyo|check-?in|dihotel|penginapan|motel)\b/i,
    h1: "Indonesian Hotel Videos",
    title: "Indonesian Hotel Videos",
    description:
      "Indonesian hotel and OYO amateur videos from our catalog. Watch on your phone, no login. 18+ only.",
    intro:
      "A list of Indonesian amateur videos shot in hotels and short-stay rooms, including titles that mention OYO. They come from catalog sources we already trust, ranked by views. Everyone appearing is 18 or older.",
    idSlug: "bokep-hotel-oyo",
  },
  {
    slug: "indonesian-doggy",
    match: /\b(?:doggy|doggystyle|doggy style|nungging)\b/i,
    h1: "Indonesian Doggy Style Videos",
    title: "Indonesian Doggy Style Videos",
    description:
      "Indonesian doggy style amateur videos from IndoAV and UserBokep, sorted by views. 18+ only.",
    intro:
      "These Indonesian clips are grouped here because the title already names doggy style, not because we relabeled a random set. The order follows view count. All performers are adults; play them in the browser whenever you like.",
    idSlug: "bokep-doggy-indo",
  },
  {
    slug: "indonesian-threesome",
    match: /\b(?:threesome|3some|bertiga|gangbang|foursome|mmf|ffm|orgy)\b/i,
    h1: "Indonesian Threesome Videos",
    title: "Indonesian Threesome Videos",
    description:
      "Indonesian threesome and group amateur videos from our catalog, ranked by views. 18+ only.",
    intro:
      "A compact set of Indonesian threesome and group videos drawn from titles already in the catalog. The most watched recordings appear first. Every performer is an adult, and the player runs in a regular browser tab.",
    idSlug: "threesome-indo",
  },
  {
    slug: "indonesian-pregnant",
    match: /\b(?:bumil|hamil|pregnant|ngidam)\b/i,
    h1: "Indonesian Pregnant Amateur Videos",
    title: "Indonesian Pregnant Amateur Videos",
    description:
      "Indonesian pregnant amateur videos from our catalog. Stream without an account. 18+ only.",
    intro:
      "These Indonesian amateur videos mention a pregnant performer in the title and already live in our catalog. The list is sorted by views so familiar titles show up first. All performers are adults.",
    idSlug: "bokep-bumil",
  },
  {
    slug: "indo-ojol",
    match: /\b(?:ojol|ojek|gojek|grab|driver)\b/i,
    h1: "Indonesian Ride-Hailing Videos",
    title: "Indonesian Ride-Hailing (Ojol) Videos",
    description:
      "Indonesian ojol and ride-hailing amateur videos from our catalog, ranked by views. 18+ only.",
    intro:
      "A page for Indonesian videos whose titles mention ojol or ride-hailing drivers, taken from the same catalog as the rest of the site. Views set the order. Everyone shown is 18 or older, and you can watch without signing in.",
    idSlug: "bokep-ojol",
  },
  {
    slug: "indonesian-webcam",
    match: /\b(?:vcs|video call|videocall|webcam|camsex|cam sex)\b/i,
    h1: "Indonesian Webcam and Video Call Clips",
    title: "Indonesian Webcam & Video Call Clips",
    description:
      "Indonesian webcam and video-call recordings from our catalog. Watch in the browser, no account needed. 18+ only.",
    intro:
      "These are Indonesian video-call and webcam recordings (often titled VCS) that we already host, not a live cam directory. They are ranked by how often people watch them here. All performers are adults.",
    idSlug: "bokep-vcs",
  },
  {
    slug: "indonesian-couple",
    match: /\b(?:pasutri|suami istri|suami-istri|real ?couple|couple|pasangan)\b/i,
    h1: "Indonesian Couple Videos",
    title: "Indonesian Couple Videos",
    description:
      "Indonesian couple and pasutri amateur videos from IndoAV and UserBokep. Stream on your phone. 18+ only.",
    intro:
      "A selection of Indonesian couple videos — married pairs and long-term partners, according to the original titles. They are pulled from our existing catalog and sorted by views. All performers are 18 or older.",
  },
  {
    slug: "indonesian-boarding-house",
    match: /\b(?:kosan|indekos|kost)\b/i,
    h1: "Indonesian Boarding House Videos",
    title: "Indonesian Boarding House (Kosan) Videos",
    description:
      "Indonesian kosan and boarding-house amateur videos from our catalog, ranked by views. 18+ only.",
    intro:
      "These Indonesian amateur videos are set in a kosan, the rented boarding rooms common in Indonesian cities. The titles already say so; we have not stretched the label. The grid follows view count, and every performer is an adult.",
    idSlug: "bokep-kosan",
  },
  {
    slug: "indonesian-ex",
    match: /\b(?:mantan|mantanku|mantannya|ex-girlfriend|ex girlfriend)\b/i,
    h1: "Indonesian Ex-Girlfriend Videos",
    title: "Indonesian Ex-Girlfriend Videos",
    description:
      "Indonesian amateur videos titled around an ex-partner, drawn from our catalog. 18+ only.",
    intro:
      "A small collection of Indonesian videos whose titles mention an ex-girlfriend or former partner. Only catalog titles that already say so are included. They are ordered by views, and everyone appearing is 18 or older.",
  },
  {
    slug: "indonesian-neighbor",
    match: /\b(?:tetangga|tetanggaku)\b/i,
    h1: "Indonesian Neighbor Videos",
    title: "Indonesian Neighbor Videos",
    description:
      "Indonesian amateur videos about a neighbor, taken from our IndoAV and UserBokep catalog. 18+ only.",
    intro:
      "These Indonesian clips talk about a neighbor in the title and already belong to the catalog. Hidden-camera wording is not used as a reason to list a video here. Popular titles lead the page, and all performers are adults.",
  },
  {
    slug: "indonesian-office",
    match: /\b(?:kantor|office|karyawan|karyawati|sekretaris|rekan kerja)\b/i,
    h1: "Indonesian Office Videos",
    title: "Indonesian Office Videos",
    description:
      "Indonesian office and coworker amateur videos from our catalog, sorted by views. 18+ only.",
    intro:
      "A short list of Indonesian videos set in an office or involving coworkers, according to the original titles. They come from the same IndoAV and UserBokep pool as the rest of Koleksi Dr Pinguin. Everyone shown is 18 or older.",
  },
  {
    slug: "indonesian-famous",
    match: /\b(?:selebgram|artis|influencer|selebriti)\b/i,
    h1: "Indonesian Influencer-Style Videos",
    title: "Indonesian Influencer-Style Videos",
    description:
      "Indonesian videos titled around public or social-media figures, drawn from our catalog. 18+ only.",
    intro:
      "These Indonesian titles mention a selebgram, influencer, or public figure; we list the recordings we already host rather than promising celebrity leaks. The order is by views. All performers are adults.",
  },
  // Foreign-visitor long tail (2026-11-22): GSC non-ID queries (MYS/SGP/USA/DEU) "tudung mesum",
  // "bokep bertudung", "bokep kelas bintang", "kelas bintang porn", "bokep percakapan".
  // IndoAV/UserBokep only, like every /en page here; no ads.
  {
    slug: "malaysian-hijab",
    match: /^(?=[\s\S]*\b(?:malaysia|malay|melayu|awek|tudung|bertudung)\b)(?=[\s\S]*\b(?:tudung|bertudung|hijab|jilbab|kerudung)\b)/i,
    h1: "Malaysian Tudung and Hijab Videos",
    title: "Malaysian Tudung & Hijab Videos",
    description:
      "Malaysian tudung and hijab amateur videos, Malay awek clips and bertudung titles from our catalog. Stream on your phone. 18+ only.",
    intro:
      "Malay viewers search for tudung and bertudung clips, so this list keeps only titles that are both Malaysian and hijab-themed. Most are amateur recordings shared by adult couples, sorted by how often they are watched. Tap a card to play it in the browser without an account.",
  },
  {
    slug: "indonesian-softcore-films",
    match: /\bkelas-bintang\b|\bkelas\s*bintang\b/i,
    h1: "Indonesian Softcore Films (Kelas Bintang)",
    title: "Indonesian Softcore Films – Kelas Bintang Movies",
    description:
      "Kelas bintang: Indonesian softcore films and adult movie scenes with professional actors, ranked by views. 18+ only.",
    intro:
      "Kelas bintang is the Indonesian name for softcore feature films and their steamy scenes, shot with professional adult actors rather than phones. We list the ones already in our catalog, most watched first. Each title streams straight in the browser.",
  },
  {
    slug: "indonesian-dirty-talk",
    match: /\bpercakapan\b/i,
    h1: "Indonesian Dirty Talk Videos",
    title: "Indonesian Dirty Talk Videos – With Conversation",
    description:
      "Indonesian dirty talk videos where adult couples keep talking in Indonesian during the scene. Ranked by views. 18+ only.",
    intro:
      "Indonesian viewers tag these clips percakapan because the couple keeps chatting in Indonesian throughout the scene. If you like hearing the language, start here. Everyone shown is an adult, and every video plays in the browser.",
  },
];

const bySlug = new Map(EN_LANDINGS.map((l) => [l.slug, l]));
const enForId = new Map(
  EN_LANDINGS.filter((l) => l.idSlug).map((l) => [l.idSlug as string, l.slug]),
);

export function findEnLanding(slug: string | undefined | null): EnLandingDef | undefined {
  return bySlug.get(String(slug || "").trim().toLowerCase());
}

export function enSlugForId(idSlug: string | undefined | null): string | undefined {
  return enForId.get(String(idSlug || "").trim().toLowerCase());
}

export function idSlugForEn(enSlug: string | undefined | null): string | undefined {
  return findEnLanding(enSlug)?.idSlug;
}

export function enDocumentTitle(title: string, page: number, suffix: string): string {
  const head = page > 1 ? `${title} – Page ${page}` : title;
  return `${head} | ${suffix}`;
}

export function sentenceCount(text: string): number {
  const stripped = String(text || "").replace(/\b(Dr|Mr|Mrs|Ms|Jr|Sr)\./g, "$1");
  return stripped
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s && /[.!?]$/.test(s.trim()))
    .length;
}

export function acceptEnLandingCard(
  card: { title?: string; creator?: string | null; category?: string },
  def: Pick<EnLandingDef, "match">,
  haystack?: string,
): boolean {
  const title = String(card.title || "");
  if (!title || hasBannedWord(title)) return false;
  const blob = haystack || `${title} ${card.category || ""}`;
  return def.match.test(blob);
}

/** Plain-link targets for the ID/EN switcher. No cookies, no auto-redirect. */
export function langSwitchForPath(pathname: string): { lang: "id" | "en"; idHref: string; enHref: string } {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (path === "/en") return { lang: "en", idHref: "/cari", enHref: "/en" };
  const enPage = /^\/en\/([^/]+)(?:\/halaman\/[1-9]\d*)?$/.exec(path);
  if (enPage) {
    const id = idSlugForEn(enPage[1]);
    return { lang: "en", idHref: id ? cariHref(id, 1) : "/cari", enHref: enHref(enPage[1], 1) };
  }
  if (path === "/cari") return { lang: "id", idHref: "/cari", enHref: "/en" };
  const idPage = /^\/cari\/([^/]+)(?:\/halaman\/[1-9]\d*)?$/.exec(path);
  if (idPage) {
    const en = enSlugForId(idPage[1]);
    return { lang: "id", idHref: cariHref(idPage[1], 1), enHref: en ? enHref(en, 1) : "/en" };
  }
  return { lang: "id", idHref: path, enHref: "/en" };
}

/** Reciprocal hreflang for a pair of pages that truly correspond. x-default is the Indonesian URL. */
export function hreflangLinks(idPath: string, englishPath: string, origin: string): Array<{ rel: string; hrefLang: string; href: string }> {
  return [
    { rel: "alternate", hrefLang: "id", href: `${origin}${idPath}` },
    { rel: "alternate", hrefLang: "en", href: `${origin}${englishPath}` },
    { rel: "alternate", hrefLang: "x-default", href: `${origin}${idPath}` },
  ];
}
