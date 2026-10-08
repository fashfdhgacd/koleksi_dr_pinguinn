import { createFileRoute } from "@tanstack/react-router";
import { collectSharePool } from "@/lib/bot/share-pool";
import { loadShareUsed, saveShareUsed } from "@/lib/bot/share-used";
import { processUploadBatch } from "@/lib/bot/upload-handler.js";
import {
  cleanPosterId,
  isHttpPoster,
  mergeLatestPosters,
  refreshMissingPosters,
} from "@/lib/bot/posters.js";

import { listHiddenForReview, setReviewMark } from "@/lib/owner-hidden-review";
import { listHiddenCandidates, applyUnhidden, type HiddenCandidate } from "@/lib/catalog/local-cache";
import { sourceLabel, type RawItem } from "@/lib/catalog/local-shared";
import { readUnhideState, setUnhidden, writeUnhideState } from "@/lib/catalog/unhide-store";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Hidden videos (minor/school-flagged, see src/lib/catalog/hidden-ids.js): owner-only list and
// the reversible "Unhide" override (KV "owner:unhide:v1"). Only reachable with the owner key.
// ---------------------------------------------------------------------------

type HiddenListRow = {
  id: string;
  title: string;
  source: string;
  sourceUrl: string | null;
  embedUrl: string | null;
  javCode: string | null;
  reason: string;
  reasonLabel: string;
  unhidden: boolean;
  unhiddenAt: number | null;
  watchUrl: string;
};

const HIDE_REASON_LABELS: Record<string, string> = {
  "masked-school-term": "Kata bertema sekolah disensor (***) di judul sumber",
  school: "Kata sekolah (SMA/SMP/siswi/pelajar/sekolah…)",
  "school-uniform": "Seragam sekolah",
  minor: "Menyiratkan di bawah umur (bocil/loli/anak kecil…)",
  "anime-school": "Anime bertema sekolah (JK/schoolgirl/classroom)",
  "teacher-student": "Guru & murid",
  classroom: "Ruang kelas",
  "incest-child": "Inses dengan anak",
  "bot-flag": "Ditandai bot saat upload",
};

function reasonLabel(reason: string): string {
  return HIDE_REASON_LABELS[reason] || reason;
}

const NOT_JAV =
  /^(?:EPS?|EPISODE|PART|MP|HD|FHD|UHD|SD|VOL|NO|TAHUN|THN|JAM|MENIT|SMA|SMP|SMU|SMK|KELAS|UMUR|USIA|IDR|RP|INDO|BOKEP|VIRAL|TIKTOK|VIDEO|VID|IMG|DSC|MOV|PIC|TOP|NEW|LIVE|COL|SET|TER|BIGO|ONLY|OF|PAP|PJS|FULL)$/;

/** JAV code like "SSIS-123", "IPX456", "ABP 123" (uppercase), "FC2-PPV-1234567"; null when none. */
function javCodeOf(title: string): string | null {
  const t = String(title || "");
  const fc2 = t.match(/\bFC2[-_ ]?(?:PPV[-_ ]?)?(\d{6,7})\b/i);
  if (fc2) return `FC2-PPV-${fc2[1]}`;
  for (const m of t.matchAll(/\b([A-Za-z]{2,6})([-_ ]?)(\d{3,5})\b/g)) {
    const prefix = m[1].toUpperCase();
    if (NOT_JAV.test(prefix)) continue;
    const sep = m[2];
    // Without a hyphen, only accept an all-caps prefix ("ABP123", "ABP 123") and not a year.
    if (sep !== "-" && m[1] !== prefix) continue;
    if (sep !== "-" && /^(?:19|20)\d\d$/.test(m[3])) continue;
    return `${prefix}-${m[3]}`;
  }
  return null;
}

function httpUrl(v: unknown): string | null {
  const s = String(v || "").trim();
  return /^https?:\/\//i.test(s) ? s : null;
}

/** Link to the video's page at the source (falls back to the embed URL). */
function sourceLinkOf(it: RawItem): { page: string | null; embed: string | null } {
  const embed = httpUrl(it.embed) || httpUrl(it.direct);
  const direct = httpUrl(it.direct);
  const any = embed || direct || "";
  const host = any.match(/^(https?:\/\/[^/]+)\/e\/([A-Za-z0-9_-]+)/i);
  if (host && /indoav|userbokep/i.test(host[1])) return { page: `${host[1]}/d/${host[2]}`, embed };
  const st = any.match(/^https?:\/\/(?:www\.)?streamtape\.[a-z]+\/e\/([A-Za-z0-9]+)/i);
  if (st) return { page: `https://streamtape.com/v/${st[1]}`, embed };
  if (direct && /\/v\//.test(direct)) return { page: direct, embed };
  return { page: embed || direct, embed };
}

function toHiddenRow(c: HiddenCandidate): HiddenListRow {
  const it = c.item;
  const title = String(it.title || "");
  const link = sourceLinkOf(it);
  return {
    id: it.id,
    title,
    source: sourceLabel(it),
    sourceUrl: link.page,
    embedUrl: link.embed,
    javCode: javCodeOf(title),
    reason: c.reason,
    reasonLabel: reasonLabel(c.reason),
    unhidden: c.unhidden,
    unhiddenAt: c.unhiddenAt || null,
    watchUrl: `/watch/${it.id}`,
  };
}

async function listHiddenVideos(): Promise<HiddenListRow[]> {
  let at: Record<string, number> = {};
  try {
    const st = await readUnhideState();
    at = Object.fromEntries(Object.entries(st.ids).map(([k, v]) => [k, v.at]));
  } catch {
    at = {};
  }
  const rows = (await listHiddenCandidates(at)).map(toHiddenRow);
  return rows.sort((a, b) => a.title.localeCompare(b.title));
}

/** unhide=true → public again; unhide=false → hidden again (default). */
async function setHiddenOverride(body: {
  id?: unknown;
  unhide?: unknown;
}): Promise<{ ok: boolean; error?: string; status?: number; unhidden?: boolean; total?: number }> {
  const id = String(body.id || "").trim();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(id)) return { ok: false, error: "bad_id", status: 400 };
  if (typeof body.unhide !== "boolean") return { ok: false, error: "bad_unhide", status: 400 };
  const candidates = await listHiddenCandidates();
  if (!candidates.some((c) => c.item.id === id)) return { ok: false, error: "not_hidden_item", status: 404 };
  try {
    const state = await setUnhidden(id, body.unhide);
    applyUnhidden(Object.keys(state.ids));
    return { ok: true, unhidden: body.unhide, total: Object.keys(state.ids).length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "kv_error", status: 503 };
  }
}

/**
 * Bulk Unhide / hide again: one KV read-modify-write of owner:unhide:v1. Every id must be a
 * flagged (hidden-by-default) item; unknown ids are rejected and reported, nothing is deleted.
 */
async function setHiddenOverrideBulk(body: {
  ids?: unknown;
  unhide?: unknown;
}): Promise<{
  ok: boolean;
  error?: string;
  status?: number;
  unhidden?: boolean;
  changed?: number;
  applied?: string[];
  rejected?: string[];
  total?: number;
}> {
  if (typeof body.unhide !== "boolean") return { ok: false, error: "bad_unhide", status: 400 };
  if (!Array.isArray(body.ids) || !body.ids.length) return { ok: false, error: "no_ids", status: 400 };
  if (body.ids.length > 2000) return { ok: false, error: "too_many_ids", status: 400 };
  const ids = [...new Set(body.ids.map((x) => String(x || "").trim()))];
  const flagged = new Set((await listHiddenCandidates()).map((c) => c.item.id));
  const applied = ids.filter((id) => /^[A-Za-z0-9_-]{3,64}$/.test(id) && flagged.has(id));
  const rejected = ids.filter((id) => !applied.includes(id));
  if (!applied.length) return { ok: false, error: "not_hidden_item", status: 404, rejected };
  try {
    const state = await readUnhideState();
    let changed = 0;
    const now = Date.now();
    for (const id of applied) {
      if (body.unhide) {
        if (!state.ids[id]) changed++;
        state.ids[id] = { at: now };
      } else if (state.ids[id]) {
        delete state.ids[id];
        changed++;
      }
    }
    await writeUnhideState(state);
    applyUnhidden(Object.keys(state.ids));
    return { ok: true, unhidden: body.unhide, changed, applied, rejected, total: Object.keys(state.ids).length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "kv_error", status: 503 };
  }
}

const HOST = "https://koleksidrpinguin.com";

function viewSecret(): string {
  const a = (process.env.ONLINE_VIEW_SECRET || "").trim();
  if (a) return a;
  return (process.env.OWNER_SECRET || process.env.PEMILIK_SECRET || "").trim();
}

function isOwner(request: Request): boolean {
  const secret = viewSecret();
  const key = (request.headers.get("x-online-key") || "").trim();
  return Boolean(secret && key && key === secret);
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

async function handleShare(body: { count?: number; category?: string; source?: string }) {
  const usedFile = await loadShareUsed();
  const n = Math.min(100, Math.max(1, Number(body.count) || 100));
  const cat = String(body.category || "").trim();
  const source = String(body.source || "").trim();
  const picked = await collectSharePool({
    count: n,
    category: cat,
    source,
    excludeIds: usedFile.used,
    excludeTitles: usedFile.titles,
  });
  if (!picked.items.length) {
    return json({ ok: true, count: 0, text: "Kosong. Coba kategori lain.", reset: false });
  }
  const take = picked.items;
  await saveShareUsed({
    resetAt: picked.reset ? Date.now() : usedFile.resetAt,
    used: picked.reset
      ? take.map((v) => String(v.id))
      : usedFile.used.concat(take.map((v) => String(v.id))),
    titles: picked.reset
      ? take.map((v) => String(v.title || ""))
      : (usedFile.titles || []).concat(take.map((v) => String(v.title || ""))),
    lastCat: cat,
    lastSource: source,
    lastCount: n,
  });
  const text = take.map((v) => `▶ ${v.title}\n${HOST}/watch/${v.id}`).join("\n\n");
  return json({ ok: true, count: take.length, reset: picked.reset, text });
}

async function handleUpload(body: { text?: string; category?: string }) {
  const raw = String(body.text || "").trim();
  if (!raw) return json({ ok: false, error: "kosong" }, 400);
  const cat = String(body.category || "").trim();
  const text = cat ? `Kategori: ${cat}\n${raw}` : raw;
  const lines: string[] = [];
  await processUploadBatch({
    token: "panel",
    chatId: 0,
    text,
    env: process.env,
    tgSend: async (_token: string, _chat: number, msg: string) => {
      lines.push(msg);
      return true;
    },
    tgSendChunks: async (_token: string, _chat: number, msg: string) => {
      lines.push(msg);
    },
    MAIN_KEYBOARD: {},
  });
  return json({ ok: true, text: lines.filter(Boolean).join("\n\n") || "Selesai." });
}

async function handleSetPoster(body: { id?: string; url?: string }) {
  const id = cleanPosterId(body.id);
  const url = String(body.url || "").trim();
  if (!id) return json({ ok: false, error: "bad_id" }, 400);
  if (!isHttpPoster(url)) return json({ ok: false, error: "bad_url" }, 400);
  const merged = await mergeLatestPosters(process.env, { [id]: url });
  if (!merged.ok) return json({ ok: false, error: merged.error || "merge_failed" }, 502);
  return json({
    ok: true,
    id,
    url,
    added: merged.added,
    updated: merged.updated,
    total: merged.total,
    text:
      merged.added || merged.updated
        ? `Poster ${id} tersimpan. Map: ${merged.total} entri.`
        : `Poster ${id} sudah sama. Map: ${merged.total} entri.`,
  });
}

async function handleRefreshPosters(body: { limit?: number }) {
  const result = await refreshMissingPosters(process.env, { limit: body.limit });
  if (!result.ok) {
    return json({ ok: false, error: result.error || "refresh_failed", text: result.text }, 502);
  }
  return json(result);
}

type OwnerBody = {
  action?: string;
  count?: number;
  category?: string;
  source?: string;
  text?: string;
  id?: string;
  url?: string;
  limit?: number;
  unhide?: boolean;
  ids?: string[];
};

export const Route = createFileRoute("/api/owner-tools")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!viewSecret()) return json({ ok: false, error: "not_configured" }, 503);
        if (!isOwner(request)) return json({ ok: false, error: "forbidden" }, 403);
        let body: OwnerBody = {};
        try {
          body = (await request.json()) as OwnerBody;
        } catch {
          return json({ ok: false, error: "bad_json" }, 400);
        }
        if (body.action === "hidden-review") {
          const items = await listHiddenForReview();
          return json({ ok: true, count: items.length, items });
        }
        // Hidden videos (minor/school-flagged): owner-only list + reversible Unhide override.
        if (body.action === "hidden-list") {
          const items = await listHiddenVideos();
          return json({
            ok: true,
            count: items.length,
            unhidden: items.filter((r) => r.unhidden).length,
            items,
          });
        }
        if (body.action === "unhide") {
          const r = await setHiddenOverride(body);
          return json(r, r.status || 200);
        }
        if (body.action === "unhide-bulk") {
          const r = await setHiddenOverrideBulk(body);
          return json(r, r.status || 200);
        }
        if (body.action === "review-mark") {
          const r = await setReviewMark(body as never);
          return json(r, r.status || 200);
        }
        if (body.action === "share") return handleShare(body);
        if (body.action === "upload") return handleUpload(body);
        if (body.action === "set-poster") return handleSetPoster(body);
        if (body.action === "refresh-posters") return handleRefreshPosters(body);
        return json({ ok: false, error: "bad_action" }, 400);
      },
    },
  },
});
