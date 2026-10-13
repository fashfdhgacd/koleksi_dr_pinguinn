import { createFileRoute } from "@tanstack/react-router";
import { applyUnhidden, hiddenReasonRaw, loadItemsRaw } from "@/lib/catalog/local-cache";
import { isVidey, type RawItem } from "@/lib/catalog/local-shared";
import { minorContentReason } from "@/lib/catalog/hidden-ids.js";
import { isLockedMinorId, lockedMinorReason } from "@/lib/catalog/minor-lock.js";
import itemOverrides from "@/lib/catalog/overrides.json";
import { readUnhideState } from "@/lib/catalog/unhide-store";
import { readOwnerHideState } from "@/lib/catalog/owner-hide-store";
import { readOwnerEditState, setOwnerEdit } from "@/lib/catalog/owner-edit-store";
import { isOwnerRequest } from "@/lib/owner-auth";
import { brandUploadTitle, BRAND_SUFFIX } from "@/lib/bot/title-brand.js";

/**
 * /pemilik "Videy belum dikasih judul": Videy videos whose title was given automatically by the
 * bot (titleAuto) and not yet replaced by the owner. Saving stores the title in KV owner:edit:v1,
 * the same path as "Edit" in owner-tools.ts; an item with an owner title is no longer auto, so it
 * leaves this list. A typed title gets exactly one " - koleksidrpinguin.com" (other site/Telegram
 * branding at the end is removed first), like bot uploads. The minor-lock is checked here on the server exactly like owner-tools.ts.
 */

const AUTO_TITLE_RE =
  /^(?:Video Viral Videy Indo Terbaru|Link Videy Viral Hari Ini|Bokep Videy Indo Viral|Videy Viral Terbaru|Video Videy Indo Lagi Rame|Link Videy Bokep Indo|Video Viral) \d+(?: - koleksidrpinguin\.com)?$/i;

type Row = { id: string; title: string; thumb: string; createdAt: number };

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

function createdMs(it: RawItem): number {
  const rec = it as RawItem & { updated_at?: unknown; updatedAt?: unknown };
  const v = it.createdAt ?? rec.updated_at ?? rec.updatedAt ?? it.date;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  const n = Date.parse(String(v || ""));
  return Number.isFinite(n) ? n : 0;
}

function isLockedItem(it: RawItem): boolean {
  if (isLockedMinorId(it.id)) return true;
  const ov = (itemOverrides as Record<string, { title?: string }>)[it.id];
  return Boolean(lockedMinorReason(String(it.title || "")) || lockedMinorReason(String(ov?.title || "")));
}

function isAutoTitled(it: RawItem): boolean {
  const rec = it as RawItem & { titleAuto?: unknown };
  if (rec.titleAuto === true) return true;
  return AUTO_TITLE_RE.test(String(it.title || "").trim());
}

async function rawItems(): Promise<RawItem[]> {
  const cache = (await loadItemsRaw()) as unknown as { items: RawItem[]; raw?: RawItem[] };
  return cache.raw || cache.items || [];
}

async function listUntitled() {
  const [raw, edits] = await Promise.all([rawItems(), readOwnerEditState().catch(() => ({ ids: {} }))]);
  // Owner titles saved here before the brand suffix existed: add it once (one KV write each).
  for (const it of raw) {
    const e = (edits.ids as Record<string, { title?: string }>)[it?.id];
    if (!e?.title || e.title.endsWith(BRAND_SUFFIX) || !isVidey(it) || !isAutoTitled(it)) continue;
    const branded = brandUploadTitle(e.title);
    if (branded && branded !== e.title && branded.length <= 200) {
      await setOwnerEdit(it.id, { title: branded }).catch(() => undefined);
    }
  }
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const it of raw) {
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    if (!isVidey(it) || !isAutoTitled(it)) continue;
    if ((edits.ids as Record<string, { title?: string }>)[it.id]?.title) continue;
    if (isLockedItem(it) || hiddenReasonRaw(it)) continue;
    rows.push({
      id: it.id,
      title: String(it.title || ""),
      thumb: `/videy-thumbs/${it.id.replace(/[^A-Za-z0-9_-]/g, "")}.jpg`,
      createdAt: createdMs(it),
    });
  }
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return json({ ok: true, items: rows });
}

async function saveTitle(body: { id?: unknown; title?: unknown }) {
  const id = String(body.id || "").trim();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(id)) return json({ ok: false, error: "ID video tidak valid." }, 400);
  const typed = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim() : "";
  if (typed.length < 4) return json({ ok: false, error: "Judul harus 4–200 karakter." }, 400);
  const title = brandUploadTitle(typed);
  if (title.length - BRAND_SUFFIX.length < 4 || title.length > 200) {
    return json({ ok: false, error: "Judul harus 4–200 karakter." }, 400);
  }

  const item = (await rawItems()).find((it) => it?.id === id);
  if (!item || !isVidey(item)) return json({ ok: false, error: "Video tidak ditemukan di katalog." }, 404);
  // Minor-lock, same rules as owner-tools.ts handleEditVideo.
  if (isLockedItem(item)) return json({ ok: false, error: "Video ini terkunci (minor-lock), tidak bisa diedit." }, 403);
  if (hiddenReasonRaw(item)) return json({ ok: false, error: "Video ini ditandai/tersembunyi, tidak bisa diedit." }, 403);
  if (lockedMinorReason(typed) || minorContentReason(typed) || lockedMinorReason(title) || minorContentReason(title)) {
    return json({ ok: false, error: "Judul ditolak: bertema sekolah/di bawah umur." }, 403);
  }

  let saved;
  try {
    saved = await setOwnerEdit(id, { title });
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    return json(
      { ok: false, error: msg === "kv_unavailable" ? "Penyimpanan KV tidak tersedia." : `Gagal menyimpan: ${msg.slice(0, 120)}` },
      503,
    );
  }
  try {
    const [unhide, hiddenState, edits] = await Promise.all([
      readUnhideState(),
      readOwnerHideState().catch(() => null),
      readOwnerEditState(),
    ]);
    applyUnhidden(Object.keys(unhide.ids), hiddenState ? Object.keys(hiddenState.ids) : null, edits.ids);
  } catch {
    /* the regular 30 s sync applies it */
  }
  return json({ ok: true, id, title: saved.title || null });
}

export const Route = createFileRoute("/api/owner-videy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { action?: unknown; id?: unknown; title?: unknown; key?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }
        if (!(await isOwnerRequest(request, body.key))) return json({ ok: false, error: "forbidden" }, 403);
        if (body.action === "list") return listUntitled();
        if (body.action === "save") return saveTitle(body);
        return json({ ok: false, error: "unknown_action" }, 400);
      },
    },
  },
});
