/**
 * Deterministic, free Indonesian -> English title rewrite for Bluesky posts (no API).
 * Word map only: unknown words are dropped (never posted as-is); when too little of the title is
 * understood it becomes a generic "New hot video" style line. The result is checked again by
 * englishBlockReason() in scripts/lib/bluesky-post-lib.mjs before anything is posted.
 */

/** Indonesian/slang -> English. "" = filler, dropped. */
const MAP = {
  // filler / site words
  bokep: "", indo: "", indonesia: "", bokepindo: "", koleksi: "", dr: "", pinguin: "", link: "", videy: "",
  yang: "", di: "", ke: "", dan: "&", sama: "with", gitu: "", ya: "", banget: "", nih: "", aja: "", sih: "",
  deh: "", dong: "", kok: "", tapi: "but", terus: "", lagi: "", jadi: "", ini: "", itu: "", udah: "", sudah: "",
  yok: "", gak: "", nggak: "", mau: "", guys: "", awwww: "", njir: "", eh: "", ni: "", si: "", sampe: "",
  sampai: "", karena: "", untuk: "", dari: "from", dengan: "with", bersama: "with", bareng: "with", pas: "", saat: "",
  sambil: "while", langsung: "", ternyata: "", juga: "", lebih: "more", paling: "most", sangat: "", super: "super",
  terbaru: "", baru: "new", full: "full", hd: "HD", "4k": "4K", part: "part", video: "video", vid: "video",
  kena: "", bikin: "", pake: "in", pakai: "in", dapat: "", dapet: "", minta: "", pengen: "", suka: "loves",
  // people (adult wording only)
  cewek: "babe", cewe: "babe", wanita: "woman", perempuan: "woman", pria: "guy", cowok: "guy",
  cowo: "guy", tante: "MILF", milf: "MILF", janda: "divorcee", istri: "wife", bini: "wife", suami: "husband",
  pasutri: "couple", couple: "couple", pasangan: "couple", kekasih: "lover", teman: "friend", temen: "friend",
  tetangga: "neighbor", bos: "boss", boss: "boss", sekretaris: "secretary", sekertaris: "secretary", kasir: "cashier",
  terapis: "therapist", pijat: "massage", spa: "spa", model: "model", bule: "foreigner", cici: "babe", cece: "babe",
  tobrut: "busty", toket: "boobs", tete: "boobs", tetek: "boobs", payudara: "breasts",
  semok: "curvy", montok: "curvy", bohay: "curvy", gemoy: "chubby", chubby: "chubby", bbw: "BBW", mulus: "smooth",
  cantik: "pretty", cantiq: "pretty", seksi: "sexy", sexy: "sexy", hot: "hot", panas: "hot", nakal: "naughty",
  binal: "wild", liar: "wild", hyper: "horny", sange: "horny", bergairah: "passionate", bertato: "tattooed",
  tato: "tattoo", kacamata: "glasses", berkacamata: "glasses", jumbo: "huge", gede: "big", besar: "big",
  // acts
  ngentot: "sex", ngewe: "sex", entot: "sex", dientot: "fucked", ewe: "sex", seks: "sex", sex: "sex",
  sepong: "blowjob", nyepong: "blowjob", disepong: "blowjob", blowjob: "blowjob", bj: "blowjob", crot: "cumshot",
  croot: "cumshot", peju: "cum", sperma: "cum", creampie: "creampie", genjot: "pounding", genjotan: "pounding",
  goyang: "riding", goyangan: "riding", wot: "cowgirl", nungging: "doggy", doggy: "doggy",
  doggystyle: "doggy", missionary: "missionary", anal: "anal", threesome: "threesome", gangbang: "gangbang",
  gb: "gangbang", squirt: "squirt", orgasme: "orgasm", orgasm: "orgasm", jilmek: "licking", jilat: "licking",
  dijilat: "licked", colmek: "solo", ngocok: "handjob", kocok: "handjob", lesbian: "lesbian", pamer: "showing off",
  body: "body", ciuman: "kissing", cium: "kiss", mesra: "romantic", romantis: "romantic", enak: "good",
  nikmat: "pleasure", kenikmatan: "pleasure", puas: "satisfied", brutal: "rough", kasar: "rough", pelan: "slow",
  keras: "hard", dalam: "deep", dalem: "deep", lama: "long", cepat: "quick", main: "play", maen: "play",
  kompilasi: "compilation", blowjob2: "blowjob",
  // places / things
  hotel: "hotel", kamar: "room", mobil: "car", kantor: "office", rumah: "home", dapur: "kitchen",
  mandi: "shower", ranjang: "bed", kasur: "bed", sofa: "sofa", outdoor: "outdoor", pantai: "beach", villa: "villa",
  penginapan: "inn", kafe: "cafe", cafe: "cafe", malam: "night", pagi: "morning", lingerie: "lingerie",
  stocking: "stockings", stockings: "stockings", kimono: "kimono", cosplay: "cosplay", baju: "outfit",
  merah: "red", hitam: "black", putih: "white", biru: "blue", pink: "pink",
};

/** English words allowed through unchanged. */
const EN = new Set(
  ("hot sexy new best pov sex fuck fucking amateur couple babe guy wife husband with and in on the a of my her his " +
    "blowjob creampie anal threesome milf bbw latina asian ebony busty curvy chubby big huge passion doggy missionary " +
    "cowgirl orgasm squirt lingerie stockings massage hotel room bed shower office night morning lover lovers " +
    "beautiful gorgeous pretty passionate rough slow deep hard wild naughty solo lesbian cumshot cum handjob hd 4k " +
    "photoshoot party dream romantic kiss kissing full part video")
    .split(" "),
);

const CONNECT = new Set(["&", "with", "from", "but", "while", "in", "and", "on", "the", "a", "of"]);
const FALLBACKS = ["New hot video", "Fresh hot video", "New steamy video", "Hot new upload", "New 18+ video"];

function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h;
}

/** Generic title chosen by video id (stable per video). */
export function fallbackTitle(id) {
  return FALLBACKS[hash(id) % FALLBACKS.length];
}

/**
 * English title for a (brand-stripped) Indonesian/English title.
 * @returns {{ title: string, fallback: boolean }}
 */
export function toEnglishTitle(title, id = "") {
  const tokens = String(title || "")
    .toLowerCase()
    .split(/[^a-z0-9+&]+/)
    .filter(Boolean);
  const out = [];
  let known = 0;
  let content = 0;
  for (const t of tokens) {
    const stem = t.replace(/nya$/, "");
    let en;
    if (Object.hasOwn(MAP, t)) en = MAP[t];
    else if (stem && Object.hasOwn(MAP, stem)) en = MAP[stem];
    else if (EN.has(t)) en = t;
    else if (/^\d{1,3}$/.test(t) && out[out.length - 1] === "part") en = t;
    else continue; // unknown word: dropped
    known++;
    if (!en) continue;
    if (!CONNECT.has(en)) content++;
    if (out[out.length - 1] !== en) out.push(en);
  }
  while (out.length && CONNECT.has(out[0])) out.shift();
  while (out.length && CONNECT.has(out[out.length - 1])) out.pop();
  const ratio = tokens.length ? known / tokens.length : 0;
  if (content < 2 || ratio < 0.6) return { title: fallbackTitle(id), fallback: true };
  const s = out.join(" ").replace(/\s+/g, " ").trim();
  return { title: (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, 120), fallback: false };
}
