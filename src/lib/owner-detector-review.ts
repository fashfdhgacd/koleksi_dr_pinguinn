/**
 * Kotak "Perlu dicek" (detector minor, verdict "review") di /pemilik.
 * - Upload baru yang "review" ditahan (hidden_reason "detector-review") tapi tampil di sini
 *   dengan link pratinjau khusus pemilik (embed sumber, karena /watch masih 404).
 * - Katalog lama yang "review" tetap tayang sampai pemilik memutuskan.
 * - "minor" dan judul yang terkunci minor-lock tidak masuk sini (terkunci, tanpa link tonton).
 * - REVIEW_PENDING (keputusan pemilik 2026-11-02): umur pemeran belum terkonfirmasi, ditahan dari
 *   publik (data tetap). Tampil di sini dengan alasannya. Tayangkan hanya dengan catatan bukti bahwa
 *   semua pemeran 18+ saat produksi (disimpan di review state); "Tetap ditahan" hanya menandai dicek.
 * Tayangkan = Unhide (+ hapus owner-hide); Sembunyiin = owner-hide. Kunci minor-lock tetap
 * menang di local-cache (isHiddenRaw), jadi Tayangkan tidak pernah membuka judul terkunci.
 */
import { applyUnhidden, hiddenReasonRaw, isLockedMinor, loadItemsRaw } from "@/lib/catalog/local-cache";
import { isReviewPendingReason, strictPendingReason, titleReviewReason } from "@/lib/catalog/review-pending.js";
import { readUnhideState, setUnhidden } from "@/lib/catalog/unhide-store";
import { readOwnerHideState, setOwnerHidden } from "@/lib/catalog/owner-hide-store";
import { readReviewState, writeReviewState } from "@/lib/owner-review-store";
import { minorContentReason } from "@/lib/catalog/minor-detector.js";
import { explainTitle, schoolReviewCue } from "@/lib/catalog/minor-context.js";
import { lockedMinorReason } from "@/lib/catalog/minor-lock.js";
import { withSavedEdit } from "@/lib/catalog/owner-edit-merge.js";
import { readOwnerEditState, setOwnerEdit } from "@/lib/catalog/owner-edit-store";
import { uploadRejectReason } from "@/lib/bot/title-guard.js";
import { HOLD_REASON, canPublishTitle, titleHold } from "@/lib/bot/title-hold.js";

/** Hard checks a held draft's new title must also pass (reject list + minor lock + detector "minor"). */
function hardOk(t: string): boolean {
  return !uploadRejectReason(t) && !lockedMinorReason(t) && minorContentReason(t) !== "minor";
}

/**
 * Saves a new title for a held upload draft and publishes it when the title is clean. Used by a bot
 * resend (and /pemilik). Owner rule 2026-11-02: the title is ALWAYS saved (a held video is never
 * locked against editing); the checks only decide whether it goes live:
 *  - strict REVIEW_PENDING (Andini Permata set, anime/hentai) stays withheld until Tayangkan + proof;
 *  - a title that still fails the hold/hard checks stays held ("title_needs_rename");
 *  - otherwise owner-hide off + Unhide, same stores as /pemilik Edit + Tayangkan.
 */
export async function publishHeldDraft(
  id: string,
  title: string,
  category?: string,
): Promise<{ ok: boolean; error?: string; saved?: boolean; reason?: string }> {
  let saved;
  try {
    saved = await setOwnerEdit(id, { title, ...(category ? { category } : {}) });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "kv_error" };
  }
  try {
    const [unhide0, hide0, edits0] = await Promise.all([
      readUnhideState(),
      readOwnerHideState().catch(() => null),
      readOwnerEditState(),
    ]);
    applyUnhidden(Object.keys(unhide0.ids), hide0 ? Object.keys(hide0.ids) : null, withSavedEdit(edits0.ids, id, saved));
    const cache = (await loadItemsRaw()) as unknown as { raw?: AnyItem[]; items: AnyItem[] };
    const held = (cache.raw || cache.items).find((x) => x?.id === id);
    const still = held ? hiddenReasonRaw(held as never) : "";
    if (isReviewPendingReason(still)) return { ok: false, saved: true, error: "review_pending_needs_proof", reason: still };
    if (!canPublishTitle(title, hardOk) || titleReviewReason(title)) {
      return { ok: false, saved: true, error: "title_needs_rename", reason: titleReviewReason(title) || String(titleHold(title, hardOk)?.term || "") };
    }
    const hideIds = Object.keys((await setOwnerHidden(id, false)).ids);
    const unhideIds = Object.keys((await setUnhidden(id, true)).ids);
    applyUnhidden(unhideIds, hideIds, withSavedEdit((await readOwnerEditState()).ids, id, saved));
    const state = await readReviewState(true);
    state.checked[`det:${id}`] = Date.now();
    await writeReviewState(state);
    return { ok: true, saved: true };
  } catch (e) {
    return { ok: false, saved: true, error: e instanceof Error ? e.message : "kv_error" };
  }
}

export type DetectorReviewRow = {
  id: string;
  title: string;
  translation: string | null;
  /** Selalu dari detector pemilik: "review_pending" di kotak ini. */
  moderation: "review_pending";
  assessment: string;
  reason: string;
  signals: string[];
  held: boolean;
  status: string;
  thumbUrl: string;
  watchUrl: string;
  decidedAt: number | null;
  /** REVIEW_PENDING row: approve needs a proof note; "keep" leaves it withheld. */
  pending?: boolean;
  /** Strict REVIEW_PENDING (Andini Permata set, anime/hentai): a new title is saved but only "Setujui" releases it. */
  strict?: boolean;
};

/** Glosarium kata Mandarin yang sering muncul di judul (terjemahan kata kunci, bukan mesin). */
const ZH: [string, string][] = [
  ["高考", "ujian masuk kuliah"], ["高三", "kelas 3 SMA"], ["高中", "SMA"], ["初中", "SMP"], ["中学", "sekolah menengah"],
  ["小学", "SD"], ["学生妹", "cewek pelajar"], ["学生", "pelajar"], ["校服", "seragam sekolah"], ["老师", "guru"],
  ["萝莉", "loli"], ["幼", "anak kecil"], ["儿子", "anak laki-laki"], ["女儿", "anak perempuan"], ["妈妈", "ibu"],
  ["母亲", "ibu"], ["继母", "ibu tiri"], ["后妈", "ibu tiri"], ["爸爸", "ayah"], ["父亲", "ayah"], ["姐姐", "kakak perempuan"],
  ["妹妹", "adik perempuan"], ["弟弟", "adik laki-laki"], ["哥哥", "kakak laki-laki"], ["老婆", "istri"], ["妻子", "istri"],
  ["人妻", "istri orang"], ["丈夫", "suami"], ["阿姨", "tante"], ["大学生", "mahasiswa"], ["大学", "kampus"], ["奖励", "hadiah"],
  ["考试", "ujian"], ["前", "sebelum"], ["后", "sesudah"], ["偷情", "selingkuh"], ["强奸", "pemerkosaan"], ["迷奸", "dibius"],
  ["性爱", "seks"], ["做爱", "bercinta"], ["中出", "keluar di dalam"], ["巨乳", "payudara besar"], ["美女", "cewek cantik"],
  ["少妇", "wanita muda (menikah)"], ["熟女", "wanita matang"], ["自慰", "masturbasi"], ["国产", "lokal China"], ["视频", "video"],
];

export function translateZh(title: string): string | null {
  if (!/[\u4e00-\u9fff]/.test(title)) return null;
  let s = title;
  for (const [zh, id] of [...ZH].sort((a, b) => b[0].length - a[0].length)) s = s.split(zh).join(` ${id} `);
  s = s.replace(/[\u4e00-\u9fff]+/g, "…").replace(/\s+/g, " ").trim();
  return `${s} (terjemahan kata kunci)`;
}

type AnyItem = { id: string; title?: unknown; embed?: unknown; direct?: unknown; hidden?: unknown; hidden_reason?: unknown; review_reason?: unknown };

function http(v: unknown): string | null {
  const s = String(v || "").trim();
  return /^https?:\/\//i.test(s) ? s : null;
}

export async function listDetectorReview(): Promise<DetectorReviewRow[]> {
  const cache = (await loadItemsRaw()) as unknown as { raw?: AnyItem[]; items: AnyItem[] };
  const [unhide, ownerHide, state, edits] = await Promise.all([
    readUnhideState(),
    readOwnerHideState(),
    readReviewState(true),
    readOwnerEditState().catch(() => ({ ids: {} as Record<string, { title?: string }> })),
  ]);
  const out: DetectorReviewRow[] = [];
  const seen = new Set<string>();
  for (const it of cache.raw || cache.items) {
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    // Upload held because the title needs renaming (title-hold.js): editable draft, never locked here.
    const renameTag = it.hidden === true && it.hidden_reason === HOLD_REASON;
    // The owner's edited title wins everywhere (owner rule 2026-11-02), not only on rename drafts.
    const title = String(edits.ids[it.id]?.title || it.title || "");
    if (renameTag) {
      if (unhide.ids[it.id]) continue;
      const hold = titleHold(title);
      const clean = canPublishTitle(title, hardOk);
      out.push({
        id: it.id,
        title,
        translation: translateZh(title),
        moderation: "review_pending",
        assessment: clean ? "Judul sudah aman, tinggal Tayangkan" : "Judul perlu diganti",
        reason: clean
          ? "Judul sudah diganti dan lolos cek. Tap Tayangkan buat nayangin."
          : hold
            ? `Judul perlu diganti: kata "${hold.term}" = ${hold.meaning}. Tap Edit, ganti judulnya${hold.suggestions.length ? ` (saran: ${hold.suggestions.join(" / ")})` : ""}, lalu Tayangkan.`
            : "Judul perlu diganti: masih kena cek judul. Tap Edit, ganti judulnya, lalu Tayangkan.",
        signals: hold ? [String(hold.term)] : [],
        held: true,
        status: ownerHide.ids[it.id] ? "Disembunyiin pemilik" : "Ditahan (judul perlu diganti), belum tayang",
        thumbUrl: `/thumb/${it.id}`,
        watchUrl: http(it.embed) || http(it.direct) || `/watch/${it.id}`,
        decidedAt: null,
      });
      continue;
    }
    // REVIEW_PENDING: performers' age unconfirmed (review-pending.js). Withheld until approved with proof.
    const rawReason = hiddenReasonRaw(it as never);
    const pendingReason = isReviewPendingReason(rawReason)
      ? rawReason
      : isReviewPendingReason(String(it.hidden_reason || ""))
        ? String(it.hidden_reason)
        : "";
    if (pendingReason) {
      if (isLockedMinor(it as never)) continue;
      const why = pendingReason.replace(/^review-pending:\s*/, "") || String(it.review_reason || "");
      const ex = explainTitle(title, minorContentReason(title));
      const approved = Boolean(unhide.ids[it.id]) && !ownerHide.ids[it.id];
      const proof = state.proof?.[it.id];
      out.push({
        id: it.id,
        title,
        translation: translateZh(title),
        moderation: "review_pending",
        assessment: "Umur pemeran belum terkonfirmasi",
        reason: `REVIEW_PENDING: ${why}. Tayangkan hanya dengan bukti kredibel bahwa semua pemeran 18+ saat produksi. ${ex.reason}`,
        signals: ex.signals,
        held: !approved,
        status: approved
          ? `Disetujui pemilik${proof?.note ? ` (bukti: ${proof.note})` : ""}`
          : "Ditahan: umur pemeran belum terkonfirmasi",
        thumbUrl: `/thumb/${it.id}`,
        // /watch 404 while withheld; owner-only preview via the source embed.
        watchUrl: approved ? `/watch/${it.id}` : http(it.embed) || http(it.direct) || `/watch/${it.id}`,
        decidedAt: state.checked[`det:${it.id}`] || null,
        pending: true,
        strict: Boolean(strictPendingReason(it.id, [title, String(it.title || "")], String((it as { category?: unknown }).category || ""))),
      });
      continue;
    }
    const heldTag = it.hidden === true && it.hidden_reason === "detector-review";
    const owner = minorContentReason(title);
    // Isyarat sekolah tambahan: hanya antre "Perlu dicek", tidak pernah mengunci/menyembunyikan.
    const cue = owner === "review" || owner === "minor" ? "" : schoolReviewCue(title);
    // Aturan pemilik 2026-10-26: video yang sudah tayang tidak pernah ditandai/diantrekan lagi.
    // Antrean hanya berisi upload baru yang sedang ditahan (hidden_reason "detector-review", belum Tayangkan).
    if (!heldTag || unhide.ids[it.id]) continue;
    if (owner === "minor" || isLockedMinor(it as never)) continue; // status "locked", bukan untuk dicek
    // (Uploads with an 18yo claim are no longer held: they arrive above via review_reason.)
    const ex = explainTitle(title, owner);
    const ownerHidden = Boolean(ownerHide.ids[it.id]);
    const held = ownerHidden || (heldTag && !unhide.ids[it.id]);
    out.push({
      id: it.id,
      title,
      translation: translateZh(title),
      moderation: "review_pending",
      assessment: ex.assessment,
      reason: owner === "review" ? ex.reason : cue ? `Isyarat sekolah (${cue}), tidak dikunci. Pastikan tokohnya dewasa. ${ex.reason}` : `Ditahan saat upload (judul sudah berubah, cek ulang). ${ex.reason}`,
      signals: ex.signals,
      held,
      status: ownerHidden ? "Disembunyiin pemilik" : held ? "Ditahan (upload baru), belum tayang" : "Masih tayang",
      thumbUrl: `/thumb/${it.id}`,
      // /watch 404 untuk item tertahan; pakai embed sumber sebagai pratinjau khusus pemilik.
      watchUrl: held ? http(it.embed) || http(it.direct) || `/watch/${it.id}` : `/watch/${it.id}`,
      decidedAt: state.checked[`det:${it.id}`] || null,
    });
  }
  // Belum diputuskan dulu, yang ditahan paling atas.
  return out.sort((a, b) => Number(!!a.decidedAt) - Number(!!b.decidedAt) || Number(b.held) - Number(a.held));
}

/** True when the item is REVIEW_PENDING (catalog rule or upload record). */
export function isReviewPendingItem(it: AnyItem): boolean {
  // Judged on the current hidden reason: a clean owner title has already released a non-strict hold,
  // so the stored upload reason alone no longer keeps it in "Perlu dicek".
  const r = hiddenReasonRaw(it as never);
  return isReviewPendingReason(r) || (Boolean(r) && isReviewPendingReason(String(it.hidden_reason || "")));
}

export async function decideDetectorReview(body: { id?: unknown; decision?: unknown; proof?: unknown }): Promise<{ ok: boolean; error?: string; status?: number; held?: boolean }> {
  const id = String(body.id || "").trim();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(id)) return { ok: false, error: "bad_id", status: 400 };
  if (body.decision !== "show" && body.decision !== "hide" && body.decision !== "keep") return { ok: false, error: "bad_decision", status: 400 };
  const cache = (await loadItemsRaw()) as unknown as { raw?: AnyItem[]; items: AnyItem[] };
  const it = (cache.raw || cache.items).find((x) => x?.id === id);
  if (!it) return { ok: false, error: "not_found", status: 404 };
  if (isReviewPendingItem(it)) {
    if (minorContentReason(String(it.title || "")) === "minor" || isLockedMinor(it as never)) return { ok: false, error: "locked_minor", status: 403 };
    const proof = String(body.proof ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
    if (body.decision === "show" && proof.length < 10) return { ok: false, error: "proof_required", status: 400 };
    try {
      const state = await readReviewState(true);
      state.checked[`det:${id}`] = Date.now();
      let unhideIds: string[];
      let hideIds: string[];
      if (body.decision === "show") {
        hideIds = Object.keys((await setOwnerHidden(id, false)).ids);
        unhideIds = Object.keys((await setUnhidden(id, true)).ids);
        state.proof = { ...(state.proof || {}), [id]: { note: proof, at: Date.now() } };
      } else {
        // "keep" / "hide": stays withheld; withdraw any earlier approval.
        hideIds = Object.keys((body.decision === "hide" ? await setOwnerHidden(id, true) : await readOwnerHideState()).ids);
        unhideIds = Object.keys((await setUnhidden(id, false)).ids);
        if (state.proof?.[id]) delete state.proof[id];
      }
      applyUnhidden(unhideIds, hideIds);
      await writeReviewState(state);
      return { ok: true, held: body.decision !== "show" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "kv_error", status: 503 };
    }
  }
  if (body.decision === "keep") return { ok: false, error: "bad_decision", status: 400 };
  if (it.hidden === true && it.hidden_reason === HOLD_REASON && body.decision === "show") {
    // Held for its title: publish only once the (edited) title passes the same upload check.
    const edits = await readOwnerEditState().catch(() => ({ ids: {} as Record<string, { title?: string }> }));
    const current = String(edits.ids[id]?.title || it.title || "");
    if (!canPublishTitle(current, hardOk)) return { ok: false, error: "title_needs_rename", status: 409 };
    const r = await publishHeldDraft(id, current);
    return r.ok ? { ok: true, held: false } : { ok: false, error: r.error, status: 503 };
  }
  const title = String(it.title || "");
  // status "locked": tidak bisa ditayangkan lewat tombol Tayangkan.
  if (minorContentReason(title) === "minor" || isLockedMinor(it as never)) return { ok: false, error: "locked_minor", status: 403 };
  try {
    let unhideIds: string[];
    let hideIds: string[];
    if (body.decision === "show") {
      hideIds = Object.keys((await setOwnerHidden(id, false)).ids);
      unhideIds = it.hidden === true ? Object.keys((await setUnhidden(id, true)).ids) : Object.keys((await readUnhideState()).ids);
    } else {
      hideIds = Object.keys((await setOwnerHidden(id, true)).ids);
      unhideIds = Object.keys((await readUnhideState()).ids);
    }
    applyUnhidden(unhideIds, hideIds);
    const state = await readReviewState(true);
    state.checked[`det:${id}`] = Date.now();
    await writeReviewState(state);
    return { ok: true, held: body.decision === "hide" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "kv_error", status: 503 };
  }
}
