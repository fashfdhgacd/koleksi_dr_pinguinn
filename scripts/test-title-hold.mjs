// Tes cek judul upload (title-hold.js): node scripts/test-title-hold.mjs  (exit 1 kalau ada yang gagal)
import { HOLD_REASON, titleHold, holdReplyLines, uploadAction, canPublishTitle, findHeldDraft } from "../src/lib/bot/title-hold.js";
import { uploadRejectReason } from "../src/lib/bot/title-guard.js";
import { lockedMinorReason } from "../src/lib/catalog/minor-lock.js";

const hardOk = (t) => !uploadRejectReason(t) && !lockedMinorReason(t);
let fail = 0;
const check = (ok, msg) => {
  if (!ok) {
    fail += 1;
    console.error(`GAGAL: ${msg}`);
  }
};

// [judul, istilah yang diharapkan | null]
const cases = [
  ["Senior Year Love Story · Episode 1", "senior year"],
  ["My Senior Years Romance", "senior year"],
  ["High School Romance Ep 2", "high school"],
  ["Highschool couple", "high school"],
  ["Junior High crush", "junior high"],
  ["Middle School story", "middle school"],
  ["Cute freshman girl", "freshman"],
  ["Sophomore love", "sophomore"],
  ["Teen girl first time", "teenager"],
  ["Teenager couple", "teenager"],
  ["Student couple room", "student"],
  ["After school special", "school"],
  ["Cewek seragam sekolah", "seragam sekolah"],
  ["Japanese school uniform cosplay", "school uniform"],
  ["Pulang sekolah", "sekolah"],
  ["Siswi cantik", "siswi/siswa"],
  ["Pelajar kos ngewe", "siswi/siswa"],
  ["ABG ngewe di kos", "abg"],
  ["Cewek kelas 12 cantik", "kelas 10/11/12"],
  // Negatif: kata aman, jangan ketahan
  ["Senior Kantor Love Story Episode 1", null],
  ["Senior manager affair", null],
  ["Kisah Cinta Mahasiswa Episode 1", null],
  ["Kelas Bintang hot", null],
  ["First class flight attendant", null],
  ["College student threesome", null],
  ["University students party", null],
  ["Seragam perawat cantik", null],
  ["Seragam kantor SPG", null],
  ["Fifteen minutes", null],
  ["Steen hotel", null],
  ["Schooler", null],
  ["Tante girang", null],
  ["Classic massage", null],
];
for (const [t, want] of cases) {
  const h = titleHold(t, hardOk);
  const got = h ? h.term : null;
  check(got === want, `"${t}" -> ${got}, harusnya ${want}`);
  if (h) {
    check(h.suggestions.length >= 2 && h.suggestions.length <= 3, `"${t}" saran ${h.suggestions.length}`);
    for (const s of h.suggestions) check(!titleHold(s) && hardOk(s), `saran "${s}" masih kena`);
  }
}

const sy = titleHold("Senior Year Love Story · Episode 1", hardOk);
check(sy.meaning.includes("tahun terakhir SMA"), "arti senior year");
check(sy.suggestions.includes("Senior Kantor Love Story Episode 1"), "saran Senior Kantor");
const reply = holdReplyLines("abc123", sy).join("\n");
check(reply.includes("/pemilik") && reply.includes("kirim ulang"), "balasan sebut /pemilik + kirim ulang");
console.log("--- contoh balasan bot ---\n" + reply + "\n---");

// Upload baru: tahan vs normal
const rec = { id: "abc123", embed: "https://putarin.biz/e/abc123" };
check(uploadAction([], rec, "Senior Year Love Story Episode 1 - koleksidrpinguin.com", hardOk).action === "hold", "upload baru ditahan");
check(uploadAction([], rec, "Senior Kantor Love Story Episode 1 - koleksidrpinguin.com", hardOk).action === "new", "upload bersih normal");

// Kirim ulang: draft yang ditahan dipakai lagi (bukan duplikat / copy kedua)
const draft = { id: "abc123", embed: "https://putarin.biz/e/abc123", hidden: true, hidden_reason: HOLD_REASON, title: "Senior Year Love Story Episode 1" };
const items = [draft, { id: "zzz999", embed: "https://x/e/zzz999" }];
const again = uploadAction(items, rec, "Senior Year Love Story Episode 1", hardOk);
check(again.action === "hold-again" && again.draft === draft, "kirim ulang judul lama -> tetap ditahan, tanpa copy kedua");
const pub = uploadAction(items, rec, "Senior Kantor Love Story Episode 1", hardOk);
check(pub.action === "publish" && pub.draft === draft, "kirim ulang judul baru -> draft ditayangkan");
// Cocok lewat embed walau id beda
check(findHeldDraft(items, { id: "other", embed: "https://putarin.biz/e/ABC123" }) === draft, "draft ketemu lewat embed");
// Video live (tidak ditahan) tidak pernah disentuh: upload ulang = normal (nanti di-skip duplikat)
const live = [{ id: "abc123", embed: "https://putarin.biz/e/abc123", title: "Senior Year Love Story" }];
check(uploadAction(live, rec, "Senior Kantor Love Story", hardOk).action === "new", "video live tidak dianggap draft");
check(findHeldDraft([{ ...draft, hidden_reason: "detector-review" }], rec) === null, "alasan lain bukan draft judul");

// Edit -> Tayangkan di /pemilik: judul harus lolos cek yang sama
check(!canPublishTitle("Senior Year Love Story Episode 1", hardOk), "edit belum diganti -> tidak bisa tayang");
check(canPublishTitle("Kisah Cinta Mahasiswa Episode 1", hardOk), "edit judul bersih -> bisa tayang");
check(!canPublishTitle("Siswi SMA cantik", hardOk), "edit ke judul terlarang -> tidak bisa tayang");
check(!canPublishTitle("", hardOk), "judul kosong -> tidak bisa tayang");

if (fail) {
  console.error(`${fail} tes gagal`);
  process.exit(1);
}
console.log(`OK: ${cases.length} judul + alur kirim ulang / edit→tayang lolos`);
