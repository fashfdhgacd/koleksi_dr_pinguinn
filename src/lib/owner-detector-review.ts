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
import {
  applyUnhidden,
  hiddenReasonRaw,
  isLockedMinor,
  isPublicHidden,
  loadItemsRaw,
} from "@/lib/catalog/local-cache";
import { healDecisions, recordDecision, reviewGroup, triggerText } from "@/lib/owner-decisions.js";
import {
  isReviewPendingReason,
  strictPendingReason,
  titleReviewReason,
} from "@/lib/catalog/review-pending.js";
import { readUnhideState, setUnhidden, setUnhiddenMany } from "@/lib/catalog/unhide-store";
import {
  readOwnerHideState,
  setOwnerHidden,
  unhideOwnerHiddenMany,
} from "@/lib/catalog/owner-hide-store";
import { readReviewState, writeReviewState } from "@/lib/owner-review-store";
import { minorContentReason } from "@/lib/catalog/minor-detector.js";
import { explainTitle, schoolReviewCue } from "@/lib/catalog/minor-context.js";
import { lockedMinorReason } from "@/lib/catalog/minor-lock.js";
import { triageLockedTitle, classifyRestriction } from "@/lib/catalog/minor-triage.js";
import { recordVerification, releaseBlock, VERIFICATION_STATUSES } from "@/lib/owner-verification.js";
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
    applyUnhidden(
      Object.keys(unhide0.ids),
      hide0 ? Object.keys(hide0.ids) : null,
      withSavedEdit(edits0.ids, id, saved),
    );
    const cache = (await loadItemsRaw()) as unknown as { raw?: AnyItem[]; items: AnyItem[] };
    const held = (cache.raw || cache.items).find((x) => x?.id === id);
    const still = held ? hiddenReasonRaw(held as never) : "";
    if (isReviewPendingReason(still))
      return { ok: false, saved: true, error: "review_pending_needs_proof", reason: still };
    if (!canPublishTitle(title, hardOk) || titleReviewReason(title)) {
      return {
        ok: false,
        saved: true,
        error: "title_needs_rename",
        reason: titleReviewReason(title) || String(titleHold(title, hardOk)?.term || ""),
      };
    }
    const hideIds = Object.keys((await setOwnerHidden(id, false)).ids);
    const unhideIds = Object.keys((await setUnhidden(id, true)).ids);
    applyUnhidden(unhideIds, hideIds, withSavedEdit((await readOwnerEditState()).ids, id, saved));
    const state = await readReviewState(true);
    state.checked[`det:${id}`] = Date.now();
    state.decisions = recordDecision(state.decisions, id, "show", { title });
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
  thumbUrl: string;
  /** Owner-only preview (source embed) while hidden; /watch once live. */
  watchUrl: string;
  /** "pending" = awaiting the owner; "approved" = Tayangkan (for good); "held" = Tetap tahan. */
  group: "pending" | "approved" | "held";
  /** The word / rule that held it (pending rows). */
  trigger: string;
  /** Strict REVIEW_PENDING (Andini Permata set, strong youth signal, anime/hentai): Tayangkan needs a proof note. */
  strict: boolean;
  /** Hard minor lock reason (explicit SD/SMP/SMA, age under 18, "di bawah umur"): never approvable, title still editable. */
  locked: string;
  /** Locked rows: "explicit" = youth evidence in the title; "verification" = keyword-only lock, still restricted. */
  triage: "explicit" | "verification" | "";
  /** Why the triage tier was chosen (detection evidence shown to the owner). */
  evidence: string[];
  /** When the owner decided (approved / held rows). */
  decidedAt: number | null;
  /** Detection source shown to the owner (keyword lock, context detector, review list, upload hold). */
  source: string;
  /** Separate facts about the title: keyword context, fictional character, claimed performer age. */
  classification: {
    contextKeywords: string[];
    fictionalCharacter: { framing: string; statedAge: number | null };
    performerAge: { claim: string; evidence: string[] };
    hardBlock: boolean;
  };
  /** Owner verification state ("unverified" until recorded) and its change history. */
  verification: {
    status: string;
    note: string;
    at: number | null;
    history: Array<{ status: string; at: number; note: string }>;
    canRelease: boolean;
  };
  /** Approved rows: true while the video is public. */
  live: boolean | null;
};

/** Glosarium kata Mandarin yang sering muncul di judul (terjemahan kata kunci, bukan mesin). */
const ZH: [string, string][] = [
  ["高考", "ujian masuk kuliah"],
  ["高三", "kelas 3 SMA"],
  ["高中", "SMA"],
  ["初中", "SMP"],
  ["中学", "sekolah menengah"],
  ["小学", "SD"],
  ["学生妹", "cewek pelajar"],
  ["学生", "pelajar"],
  ["校服", "seragam sekolah"],
  ["老师", "guru"],
  ["萝莉", "loli"],
  ["幼", "anak kecil"],
  ["儿子", "anak laki-laki"],
  ["女儿", "anak perempuan"],
  ["妈妈", "ibu"],
  ["母亲", "ibu"],
  ["继母", "ibu tiri"],
  ["后妈", "ibu tiri"],
  ["爸爸", "ayah"],
  ["父亲", "ayah"],
  ["姐姐", "kakak perempuan"],
  ["妹妹", "adik perempuan"],
  ["弟弟", "adik laki-laki"],
  ["哥哥", "kakak laki-laki"],
  ["老婆", "istri"],
  ["妻子", "istri"],
  ["人妻", "istri orang"],
  ["丈夫", "suami"],
  ["阿姨", "tante"],
  ["大学生", "mahasiswa"],
  ["大学", "kampus"],
  ["奖励", "hadiah"],
  ["考试", "ujian"],
  ["前", "sebelum"],
  ["后", "sesudah"],
  ["偷情", "selingkuh"],
  ["强奸", "pemerkosaan"],
  ["迷奸", "dibius"],
  ["性爱", "seks"],
  ["做爱", "bercinta"],
  ["中出", "keluar di dalam"],
  ["巨乳", "payudara besar"],
  ["美女", "cewek cantik"],
  ["少妇", "wanita muda (menikah)"],
  ["熟女", "wanita matang"],
  ["自慰", "masturbasi"],
  ["国产", "lokal China"],
  ["视频", "video"],
];

export function translateZh(title: string): string | null {
  if (!/[\u4e00-\u9fff]/.test(title)) return null;
  let s = title;
  for (const [zh, id] of [...ZH].sort((a, b) => b[0].length - a[0].length))
    s = s.split(zh).join(` ${id} `);
  s = s
    .replace(/[\u4e00-\u9fff]+/g, "…")
    .replace(/\s+/g, " ")
    .trim();
  return `${s} (terjemahan kata kunci)`;
}

type AnyItem = {
  id: string;
  title?: unknown;
  embed?: unknown;
  direct?: unknown;
  hidden?: unknown;
  hidden_reason?: unknown;
  review_reason?: unknown;
};

function http(v: unknown): string | null {
  const s = String(v || "").trim();
  return /^https?:\/\//i.test(s) ? s : null;
}

export async function listDetectorReview(): Promise<DetectorReviewRow[]> {
  const cache = (await loadItemsRaw()) as unknown as { raw?: AnyItem[]; items: AnyItem[] };
  let [unhide, ownerHide] = await Promise.all([readUnhideState(), readOwnerHideState()]);
  const [state, edits] = await Promise.all([
    readReviewState(true),
    readOwnerEditState().catch(() => ({ ids: {} as Record<string, { title?: string }> })),
  ]);
  const items = cache.raw || cache.items;
  const byId = new Map<string, AnyItem>();
  for (const it of items) if (it?.id && !byId.has(it.id)) byId.set(it.id, it);
  const decisions = state.decisions || {};
  const verification = state.verification || {};
  // Owner decision wins: put back an approval/hold a stale KV write dropped (owner-only, rare write).
  const heal = healDecisions(decisions, {
    unhide: unhide.ids,
    ownerHide: ownerHide.ids,
    locked: (id) => {
      const it = byId.get(id);
      return !it || isLockedMinor(it as never);
    },
  });
  if (heal.unhide.length || heal.hide.length) {
    try {
      for (const id of heal.unhide) {
        if (ownerHide.ids[id]) ownerHide = await setOwnerHidden(id, false);
        unhide = await setUnhidden(id, true);
      }
      for (const id of heal.hide) {
        ownerHide = await setOwnerHidden(id, true);
        if (unhide.ids[id]) unhide = await setUnhidden(id, false);
      }
      applyUnhidden(Object.keys(unhide.ids), Object.keys(ownerHide.ids));
    } catch {
      /* KV write failed: the ledger still holds the decision; next load retries. */
    }
  }
  const out: DetectorReviewRow[] = [];
  for (const it of byId.values()) {
    const id = it.id;
    // The owner's edited title wins everywhere (owner rule 2026-11-02).
    const title = String(edits.ids[id]?.title || it.title || "");
    const decision = decisions[id] || null;
    let trigger = "";
    let flagged = false;
    let strict = false;
    let source = "";
    if (it.hidden === true && it.hidden_reason === HOLD_REASON) {
      source = "judul upload perlu diganti (title-hold)";
      // Upload held because the title needs renaming (title-hold.js).
      flagged = true;
      trigger = canPublishTitle(title, hardOk)
        ? "judul sudah aman"
        : String(titleHold(title, hardOk)?.term || "cek judul");
    } else {
      const rawReason = hiddenReasonRaw(it as never);
      const pendingReason = isReviewPendingReason(rawReason)
        ? rawReason
        : isReviewPendingReason(String(it.hidden_reason || ""))
          ? String(it.hidden_reason)
          : "";
      if (pendingReason) {
        // REVIEW_PENDING: performers' age unconfirmed (review-pending.js).
        flagged = true;
        source = "daftar tinjau (usia pemeran belum dikonfirmasi)";
        trigger = triggerText(pendingReason);
        strict = Boolean(
          strictPendingReason(
            id,
            [title, String(it.title || "")],
            String((it as { category?: unknown }).category || ""),
          ),
        );
      } else if (
        it.hidden === true &&
        it.hidden_reason === "detector-review" &&
        minorContentReason(title) !== "minor"
      ) {
        // New upload held by the context detector.
        flagged = true;
        source = "detektor konteks (upload baru)";
        const ex = explainTitle(title, minorContentReason(title));
        trigger = ex.signals[0] || schoolReviewCue(title) || "isyarat umur";
      }
    }
    const verif = verification[id] || null;
    const keywordLock = !flagged && !decision && !verif ? lockReason(it, title) : "";
    if (!flagged && !decision && !verif && !keywordLock) continue;
    if (keywordLock && !trigger) {
      source = "kunci kata kunci (minor-lock)";
      trigger = keywordLock;
    }
    const released = verif?.status === "false_positive";
    // Hard minor lock: listed under "Ditahan" with its reason (title still editable), never approvable.
    const locked = lockReason(it, title, released);
    if (!source) source = locked ? "kunci kata kunci (minor-lock)" : "keputusan pemilik";
    const lockName = String(lockedMinorReason(title) || "");
    const cls = classifyRestriction(title, { detector: lockName === "locked:minor-detector" });
    const triage = triageLockedTitle(title, lockName);
    // Sensitive set is judged on the title itself (also for held rows, whose hidden reason is the owner hide).
    if (!strict)
      strict = Boolean(
        strictPendingReason(
          id,
          [title, String(it.title || "")],
          String((it as { category?: unknown }).category || ""),
        ),
      );
    const legacy = flagged ? state.checked[`det:${id}`] || null : null;
    const unhidden = Boolean(unhide.ids[id]);
    const ownerHidden = Boolean(ownerHide.ids[id]);
    const group = locked
      ? "held"
      : reviewGroup({ decision, unhidden, ownerHidden, legacyDecidedAt: legacy });
    if (group === "pending" && (!(flagged || released) || !(await isPublicHidden(id)))) continue; // already public: nothing to decide
    const live = group === "approved" ? !(await isPublicHidden(id)) : null;
    out.push({
      id,
      title,
      translation: translateZh(title),
      thumbUrl: `/thumb/${id}`,
      watchUrl: live ? `/watch/${id}` : http(it.embed) || http(it.direct) || `/watch/${id}`,
      group,
      trigger,
      strict,
      locked,
      triage: locked ? triage.tier : "",
      evidence: locked ? triage.evidence : [],
      source,
      classification: {
        contextKeywords: cls.contextKeywords,
        fictionalCharacter: cls.fictionalCharacter,
        performerAge: cls.performerAge,
        hardBlock: cls.hardBlock,
      },
      verification: {
        status: verif?.status || "unverified",
        note: verif?.note || "",
        at: verif?.at || null,
        history: verif?.history || [],
        canRelease: !releaseBlock(title),
      },
      decidedAt:
        decision?.at ||
        legacy ||
        (unhidden
          ? Number(unhide.ids[id]?.at) || null
          : ownerHidden
            ? Number(ownerHide.ids[id]?.at) || null
            : null),
      live,
    });
  }
  // Newest decision first in the decided lists; pending keeps catalog order.
  return out.sort((a, b) => (b.decidedAt || 0) - (a.decidedAt || 0));
}

/** True when the item is REVIEW_PENDING (catalog rule or upload record). */
export function isReviewPendingItem(it: AnyItem): boolean {
  // Judged on the current hidden reason: a clean owner title has already released a non-strict hold,
  // so the stored upload reason alone no longer keeps it in "Perlu dicek".
  const r = hiddenReasonRaw(it as never);
  return (
    isReviewPendingReason(r) ||
    (Boolean(r) && isReviewPendingReason(String(it.hidden_reason || "")))
  );
}

/**
 * Why Tayangkan is refused, or null. Owner decision wins over the automatic title checks (owner
 * rule 2026-11-02): only hard minor content (reject list, minor lock, detector "minor") is refused,
 * and the strict REVIEW_PENDING set (Andini Permata, strong youth signal, anime/hentai) needs a
 * proof note. A rename-held draft is approved as is: the owner's tap is the decision.
 */
function lockReason(it: AnyItem, title: string, released = false): string {
  if (released && !releaseBlock(title)) return "";
  const r = String(lockedMinorReason(title) || "").replace(/^locked:/, "");
  if (r === "minor-detector") return "judul menyebut anak di bawah umur";
  if (r) return `judul jelas soal anak sekolah / di bawah umur (${r.replace(/-/g, " ")})`;
  if (minorContentReason(title) === "minor") return "judul menyebut anak di bawah umur";
  return isLockedMinor(it as never) ? "dikunci sebagai konten di bawah umur" : "";
}

function approvalBlock(
  it: AnyItem,
  title: string,
  proof: string,
  released = false,
): { error: string; status: number; reason?: string } | null {
  const locked = lockReason(it, title, released);
  if (locked) return { error: "locked_minor", status: 403, reason: locked };
  // Sensitive set (Andini Permata, strong youth signal, anime/hentai): a short owner note is enough.
  if (
    strictPendingReason(
      it.id,
      [title, String(it.title || "")],
      String((it as { category?: unknown }).category || ""),
    ) &&
    !proof
  ) {
    return { error: "proof_required", status: 400 };
  }
  return null;
}

/**
 * "Tayangkan semua": approves many non-sensitive videos in one go (one KV write per store).
 * Strict items (need proof) and hard minor content are skipped and reported, never approved.
 */
export async function approveDetectorReviewBulk(body: {
  ids?: unknown;
}): Promise<{
  ok: boolean;
  error?: string;
  status?: number;
  approved?: string[];
  skipped?: string[];
}> {
  if (!Array.isArray(body.ids) || !body.ids.length)
    return { ok: false, error: "no_ids", status: 400 };
  if (body.ids.length > 500) return { ok: false, error: "too_many_ids", status: 400 };
  const ids = [...new Set(body.ids.map((x) => String(x || "").trim()))].filter((id) =>
    /^[A-Za-z0-9_-]{3,64}$/.test(id),
  );
  const cache = (await loadItemsRaw()) as unknown as { raw?: AnyItem[]; items: AnyItem[] };
  const byId = new Map<string, AnyItem>();
  for (const it of cache.raw || cache.items) if (it?.id && !byId.has(it.id)) byId.set(it.id, it);
  const edits = await readOwnerEditState().catch(() => ({
    ids: {} as Record<string, { title?: string }>,
  }));
  const approved: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    const it = byId.get(id);
    if (!it || approvalBlock(it, String(edits.ids[id]?.title || it.title || ""), ""))
      skipped.push(id);
    else approved.push(id);
  }
  if (!approved.length) return { ok: true, approved, skipped };
  try {
    const hideIds = Object.keys((await unhideOwnerHiddenMany(approved)).ids);
    const unhideIds = Object.keys((await setUnhiddenMany(approved)).ids);
    applyUnhidden(unhideIds, hideIds);
    const state = await readReviewState(true);
    const now = Date.now();
    for (const id of approved) {
      state.checked[`det:${id}`] = now;
      state.decisions = recordDecision(state.decisions, id, "show", {
        title: String(edits.ids[id]?.title || byId.get(id)?.title || ""),
        now,
      });
    }
    await writeReviewState(state);
    return { ok: true, approved, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "kv_error", status: 503 };
  }
}

/**
 * Tayangkan ("show") / Tetap tahan ("keep"; "hide" = same) from "Perlu dicek". The decision is
 * durable (owner-decisions.js): "show" = Unhide + no owner hide, so automatic checks never hide it
 * again; "keep" = owner hide, so a later clean title does not release it. Both are also written to
 * the decision ledger. Hard minor locks are refused; strict REVIEW_PENDING needs a proof note.
 */
export async function decideDetectorReview(body: {
  id?: unknown;
  decision?: unknown;
  proof?: unknown;
}): Promise<{ ok: boolean; error?: string; status?: number; held?: boolean; reason?: string }> {
  const id = String(body.id || "").trim();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(id)) return { ok: false, error: "bad_id", status: 400 };
  if (body.decision !== "show" && body.decision !== "hide" && body.decision !== "keep")
    return { ok: false, error: "bad_decision", status: 400 };
  const show = body.decision === "show";
  const cache = (await loadItemsRaw()) as unknown as { raw?: AnyItem[]; items: AnyItem[] };
  const it = (cache.raw || cache.items).find((x) => x?.id === id);
  if (!it) return { ok: false, error: "not_found", status: 404 };
  const edits = await readOwnerEditState().catch(() => ({
    ids: {} as Record<string, { title?: string }>,
  }));
  const title = String(edits.ids[id]?.title || it.title || "");
  const proof = String(body.proof ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  if (show) {
    const verif = (await readReviewState(true)).verification?.[id];
    const block = approvalBlock(it, title, proof, verif?.status === "false_positive");
    if (block) return { ok: false, ...block };
  }
  try {
    let hideIds: string[];
    let unhideIds: string[];
    if (show) {
      hideIds = Object.keys((await setOwnerHidden(id, false)).ids);
      unhideIds = Object.keys((await setUnhidden(id, true)).ids);
    } else {
      hideIds = Object.keys((await setOwnerHidden(id, true)).ids);
      unhideIds = Object.keys((await setUnhidden(id, false)).ids);
    }
    applyUnhidden(unhideIds, hideIds);
    const state = await readReviewState(true);
    state.checked[`det:${id}`] = Date.now();
    state.decisions = recordDecision(state.decisions, id, show ? "show" : "keep", { title });
    if (show && proof)
      state.proof = { ...(state.proof || {}), [id]: { note: proof, at: Date.now() } };
    if (!show && state.proof?.[id]) delete state.proof[id];
    await writeReviewState(state);
    return { ok: true, held: !show };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "kv_error", status: 503 };
  }
}

/**
 * Records the owner's verification status for one restricted video (false positive / awaiting
 * verification / keep restricted) with a change history. Never publishes: a false positive only
 * lifts the keyword lock, and only when the title carries no under-18 claim; Tayangkan stays separate.
 */
export async function verifyDetectorReview(body: {
  id?: unknown;
  status?: unknown;
  note?: unknown;
}): Promise<{ ok: boolean; error?: string; status?: number; reason?: string }> {
  const id = String(body.id || "").trim();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(id)) return { ok: false, error: "bad_id", status: 400 };
  const status = String(body.status || "");
  if (!VERIFICATION_STATUSES.includes(status)) return { ok: false, error: "bad_status", status: 400 };
  const cache = (await loadItemsRaw()) as unknown as { raw?: AnyItem[]; items: AnyItem[] };
  const it = (cache.raw || cache.items).find((x) => x?.id === id);
  if (!it) return { ok: false, error: "not_found", status: 404 };
  const edits = await readOwnerEditState().catch(() => ({ ids: {} as Record<string, { title?: string }> }));
  const title = String(edits.ids[id]?.title || it.title || "");
  const note = String(body.note ?? "");
  if (status === "false_positive") {
    const block = releaseBlock(title);
    if (block) return { ok: false, error: "hard_block", status: 403, reason: block };
    if (note.replace(/\s+/g, " ").trim().length < 5)
      return { ok: false, error: "note_required", status: 400 };
  }
  try {
    const state = await readReviewState(true);
    state.verification = recordVerification(state.verification, id, status, { note, title });
    await writeReviewState(state);
    const released = Object.entries(state.verification)
      .filter(([, e]) => e.status === "false_positive")
      .map(([k]) => k);
    applyUnhidden(Object.keys((await readUnhideState()).ids), null, null, null, released);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "kv_error", status: 503 };
  }
}

