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
import {
  listHiddenCandidates,
  applyUnhidden,
  isLockedMinor,
  loadItemsRaw,
  type HiddenCandidate,
} from "@/lib/catalog/local-cache";
import { isDrpBokep, PLACEHOLDER_IMAGE_RE, slugOf, sourceLabel, type RawItem } from "@/lib/catalog/local-shared";
import deadSources from "@/lib/catalog/dead-sources.json";
import rankMeta from "@/lib/catalog/rank-periods-meta.json";
import latestPosters from "../../../data/latest-posters.json";
import thumbsDeploy from "../../../data/.thumbs-deploy.json";
import { findCategory } from "@/lib/catalog/categories";
import { minorContentReason } from "@/lib/catalog/hidden-ids.js";
import { isLockedMinorId, lockedMinorReason } from "@/lib/catalog/minor-lock.js";
import { reviewPriority as detectorPriority } from "@/lib/catalog/minor-detector.js";
import itemOverrides from "@/lib/catalog/overrides.json";
import { readUnhideState, setUnhidden, writeUnhideState } from "@/lib/catalog/unhide-store";
import { readOwnerHideState } from "@/lib/catalog/owner-hide-store";
import { MAX_EXTRA_CATEGORIES, readOwnerEditState, setOwnerEdit } from "@/lib/catalog/owner-edit-store";
import { isOwnerRequest, ownerSecret } from "@/lib/owner-auth";
import {
  getWebhookInfo,
  lastSetupAt,
  lastVerifiedUpdateAt,
  setupWebhook,
  WEBHOOK_URL,
} from "@/lib/telegram-webhook";

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
  "minor-lock": "Terkunci (ID/judul jelas bertema minor/sekolah), tidak bisa di-Unhide",
  "owner-hide": "Disembunyikan manual dari kartu Player error",
  "masked-school-term": "Kata bertema sekolah disensor (***) di judul sumber",
  school: "Kata sekolah (SMA/SMP/siswi/pelajar/sekolah…)",
  "school-uniform": "Seragam sekolah",
  minor: "Menyiratkan di bawah umur (bocil/loli/anak kecil…)",
  "anime-school": "Anime bertema sekolah (JK/schoolgirl/classroom)",
  "teacher-student": "Guru & murid",
  classroom: "Ruang kelas",
  "incest-child": "Inses dengan anak",
  "bot-flag": "Ditandai bot saat upload",
  "locked:minor-detector": "Detector minor: judul jelas di bawah umur (diblokir)",
  "detector-review": "Perlu dicek: konteks sekolah/keluarga + kata umur (detector minor)",
  "source-gone": "Dihapus di sumber",
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

/**
 * Several posters in ONE merge (one commit of data/latest-posters.json, so one deploy) for the
 * "Thumbnail kosong" card, instead of one commit per pasted link. At most 50 per call.
 */
async function handleSetPosters(body: { posters?: unknown }) {
  const input = body.posters && typeof body.posters === "object" && !Array.isArray(body.posters) ? body.posters : null;
  if (!input) return json({ ok: false, error: "no_posters" }, 400);
  const entries: Record<string, string> = {};
  const rejected: string[] = [];
  for (const [rawId, rawUrl] of Object.entries(input as Record<string, unknown>).slice(0, 50)) {
    const id = cleanPosterId(rawId);
    const url = String(rawUrl || "").trim();
    if (id && isHttpPoster(url)) entries[id] = url;
    else rejected.push(String(rawId).slice(0, 64));
  }
  if (!Object.keys(entries).length) return json({ ok: false, error: "bad_url", rejected }, 400);
  const merged = await mergeLatestPosters(process.env, entries);
  if (!merged.ok) return json({ ok: false, error: merged.error || "merge_failed", rejected }, 502);
  return json({
    ok: true,
    saved: Object.keys(entries),
    rejected,
    added: merged.added,
    updated: merged.updated,
    total: merged.total,
    text: `${Object.keys(entries).length} poster tersimpan. Tampil setelah deploy berikutnya (±2-3 menit).`,
  });
}

async function handleRefreshPosters(body: { limit?: number }) {
  const result = await refreshMissingPosters(process.env, { limit: body.limit });
  if (!result.ok) {
    return json({ ok: false, error: result.error || "refresh_failed", text: result.text }, 502);
  }
  return json(result);
}

// ---------------------------------------------------------------------------
// Catalog overview, recent uploads, search and title/category edit for /pemilik.
// Edits are written to src/lib/catalog/overrides.json in the repo (same file the catalog
// reads at build time), so they go live with the next build. The minor-lock is checked on the
// server: locked or flagged items cannot be edited, and a new title cannot carry a minor theme.
// ---------------------------------------------------------------------------

type CatalogRow = {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  extra?: string[];
  source: string;
  createdAt: number;
  hidden: boolean;
  locked: boolean;
  /** Owner's own Byse/Lulu/Dood upload without any poster: the site shows the penguin logo. */
  noThumb: boolean;
};

type BuiltLike = {
  at?: number;
  items: RawItem[];
  raw?: RawItem[];
  hiddenIds?: Set<string>;
  byId: Map<string, RawItem>;
  posters?: Record<string, string>;
};

function realPoster(v: unknown): boolean {
  const s = String(v || "").trim();
  return /^https?:\/\//i.test(s) && !PLACEHOLDER_IMAGE_RE.test(s) && !/brand-poster/i.test(s);
}

/**
 * Same poster sources /thumb/<id> uses for the owner's Byse/LuluStream/DoodStream uploads (item
 * poster/thumbnail, data/latest-posters.json, overrides.json, the catalog poster map). No poster
 * means /thumb redirects to the brand logo. Only these uploads are checked: the other hosts always
 * carry their own thumbnail. Pure in-memory check, no storage read.
 */
function lacksThumb(it: RawItem, posters?: Record<string, string>): boolean {
  if (!isDrpBokep(it)) return false;
  if (realPoster(it.poster) || realPoster(it.thumbnail)) return false;
  if (realPoster(posters?.[it.id]) || realPoster((latestPosters as Record<string, string>)[it.id])) return false;
  const ov = (itemOverrides as Record<string, { poster?: string }>)[it.id];
  return !realPoster(ov?.poster);
}

const WIB_MS = 7 * 3600 * 1000;

/**
 * Upload time. Bot uploads (lib/bot/store.js toRecord) carry no createdAt, only `date`
 * (the UTC calendar day, so anything uploaded 00:00–07:00 WIB looked like "yesterday") and
 * `updated_at` (full ISO time of the upload), which is the better source.
 */
function createdMs(it: RawItem): number {
  const rec = it as RawItem & { updated_at?: unknown; updatedAt?: unknown };
  const v = it.createdAt ?? rec.updated_at ?? rec.updatedAt ?? it.date;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  const n = Date.parse(String(v || ""));
  return Number.isFinite(n) ? n : 0;
}

// Same decision as the catalog (local-cache.ts), so the panel label never disagrees with what is hidden.
function isLockedItem(it: RawItem): boolean {
  return isLockedMinor(it);
}

function toCatalogRow(
  it: RawItem,
  shown: RawItem | undefined,
  hidden: boolean,
  posters?: Record<string, string>,
): CatalogRow {
  const view = shown || it;
  const slug = slugOf(view);
  return {
    id: it.id,
    title: String(view.title || ""),
    category: slug,
    categoryLabel: findCategory(slug)?.label || slug,
    ...(Array.isArray(view.ownerExtraCategories) && view.ownerExtraCategories.length
      ? { extra: (view.ownerExtraCategories as unknown[]).map(String) }
      : {}),
    source: sourceLabel(it),
    createdAt: createdMs(it),
    hidden,
    locked: isLockedItem(it),
    noThumb: lacksThumb(it, posters),
  };
}

async function catalogBase(): Promise<{ raw: RawItem[]; cache: BuiltLike; hidden: Set<string> }> {
  const cache = (await loadItemsRaw()) as unknown as BuiltLike;
  const raw = cache.raw || cache.items;
  const shownIds = new Set(cache.items.map((it) => it.id));
  const hidden = new Set<string>();
  for (const it of raw) if (it?.id && !shownIds.has(it.id)) hidden.add(it.id);
  return { raw, cache, hidden };
}

async function handleCatalogOverview(
  body: { limit?: unknown; offset?: unknown; source?: unknown; noThumb?: unknown } = {},
) {
  const limit = Math.min(100, Math.max(1, Math.floor(Number(body.limit) || 50)));
  const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
  const sourceFilter = typeof body.source === "string" ? body.source.trim().slice(0, 40) : "";
  const noThumbFilter = body.noThumb === true;
  const { raw, cache, hidden } = await catalogBase();
  const posters = cache.posters;
  const now = Date.now();
  const dayStart = Math.floor((now + WIB_MS) / 86400000) * 86400000 - WIB_MS;
  const weekStart = dayStart - 6 * 86400000;
  let today = 0;
  let week = 0;
  const todayBySource: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const seen = new Set<string>();
  const uniq: { it: RawItem; t: number; source: string }[] = [];
  for (const it of raw) {
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    const t = createdMs(it);
    const source = sourceLabel(it);
    uniq.push({ it, t, source });
    bySource[source] = (bySource[source] || 0) + 1;
    if (t >= dayStart) {
      today++;
      todayBySource[source] = (todayBySource[source] || 0) + 1;
    }
    if (t >= weekStart) week++;
  }
  // Public catalog per category and the shown uploads still on the logo (in-memory counts only).
  const catCount = new Map<string, number>();
  let noThumb = 0;
  for (const it of cache.items) {
    const slug = slugOf(it);
    catCount.set(slug, (catCount.get(slug) || 0) + 1);
    if (lacksThumb(it, posters)) noThumb++;
  }
  const categories = [...catCount.entries()]
    .map(([slug, count]) => ({ slug, label: findCategory(slug)?.label || slug, count }))
    .sort((a, b) => b.count - a.count);
  // Strictly by upload time (sortByNewest ranks by source first, which is right for the catalog
  // pages but not for "Upload terbaru"). Items without a usable date go last.
  const recent0 = uniq
    .filter((r) => (!sourceFilter || r.source === sourceFilter) && (!noThumbFilter || lacksThumb(r.it, posters)))
    .sort((a, b) => b.t - a.t);
  const page = recent0
    .slice(offset, offset + limit)
    .map(({ it }) => toCatalogRow(it, cache.byId?.get(it.id), hidden.has(it.id), posters));
  // "Perlu dicek": Jav items whose title looks like an episode (maybe hentai). Owner moves them in one tap.
  const EP_RE = /\b(?:episode|ep)\.?\s*\d{1,3}\b/i;
  const checkRows = cache.items
    .filter((it) => slugOf(it) === "jav" && EP_RE.test(String(it.title || "")))
    .slice(0, 40)
    .map((it) => toCatalogRow(it, cache.byId?.get(it.id), hidden.has(it.id), posters));
  const dead = deadSources as { checkedAt?: string | null };
  return json({
    ok: true,
    checkJav: offset === 0 ? checkRows : undefined,
    total: cache.items.length,
    hidden: hidden.size,
    uploadedToday: today,
    uploadedWeek: week,
    todayBySource,
    bySource,
    categories,
    noThumb,
    recent: page,
    recentTotal: recent0.length,
    offset,
    source: sourceFilter || null,
    noThumbOnly: noThumbFilter,
    status: {
      catalogAt: typeof cache.at === "number" ? cache.at : null,
      thumbsAt: (thumbsDeploy as { at?: string }).at || null,
      deadCheckedAt: dead.checkedAt || null,
      statsUpdated: (rankMeta as { updated?: string }).updated || null,
    },
  });
}

/** Shown Byse/Lulu/Dood uploads without a poster, newest first, for "Thumbnail kosong". */
async function handleThumbMissing(body: { limit?: unknown; offset?: unknown } = {}) {
  const limit = Math.min(100, Math.max(1, Math.floor(Number(body.limit) || 20)));
  const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
  const { cache } = await catalogBase();
  const rows = cache.items
    .filter((it) => lacksThumb(it, cache.posters))
    .map((it) => ({ it, t: createdMs(it) }))
    .sort((a, b) => b.t - a.t);
  return json({
    ok: true,
    total: rows.length,
    offset,
    items: rows.slice(offset, offset + limit).map(({ it }) => toCatalogRow(it, it, false, cache.posters)),
  });
}

async function handleCatalogSearch(body: { q?: unknown }) {
  const q = String(body.q || "").trim().toLowerCase();
  if (q.length < 2) return json({ ok: true, items: [] });
  const { raw, cache, hidden } = await catalogBase();
  const out: CatalogRow[] = [];
  const seen = new Set<string>();
  for (const it of raw) {
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    const shown = cache.byId?.get(it.id);
    const hay = `${String(shown?.title || it.title || "").toLowerCase()} ${it.id.toLowerCase()}`;
    if (!hay.includes(q)) continue;
    out.push(toCatalogRow(it, shown, hidden.has(it.id), cache.posters));
    if (out.length >= 20) break;
  }
  return json({ ok: true, items: out });
}

async function handleEditVideo(body: { id?: unknown; title?: unknown; category?: unknown; extra?: unknown }) {
  const id = String(body.id || "").trim();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(id)) return json({ ok: false, error: "ID video tidak valid." }, 400);
  const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  let extra: string[] | undefined;
  if (Array.isArray(body.extra)) {
    extra = [...new Set(body.extra.map((s) => String(s).trim()).filter(Boolean))];
    const bad = extra.find((s) => !findCategory(s));
    if (bad) return json({ ok: false, error: `Kategori tidak dikenal: ${bad}` }, 400);
    if (extra.length > MAX_EXTRA_CATEGORIES) {
      return json({ ok: false, error: `Maksimal ${MAX_EXTRA_CATEGORIES} kategori tambahan.` }, 400);
    }
  }
  if (!title && !category && !extra) return json({ ok: false, error: "Tidak ada perubahan." }, 400);
  // Chinese/Japanese/Korean titles are dense: 2 characters ("龍女") is already a real title.
  const minTitle = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(title) ? 2 : 4;
  if (title && (title.length < minTitle || title.length > 200)) {
    return json({ ok: false, error: `Judul harus ${minTitle}–200 karakter.` }, 400);
  }
  if (category && !findCategory(category)) return json({ ok: false, error: `Kategori tidak dikenal: ${category}` }, 400);

  const { raw } = await catalogBase();
  const item = raw.find((it) => it?.id === id);
  if (!item) return json({ ok: false, error: "Video tidak ditemukan di katalog." }, 404);
  // Locked/hidden items may be edited (metadata correction), but an edit never unhides: local-cache.ts
  // checks the stored title as well as the edit, so the item stays hidden. A new title must not carry
  // a school/minor theme.
  if (title && (lockedMinorReason(title) || minorContentReason(title) || detectorPriority("", title) === "block")) {
    return json({ ok: false, error: "Judul ditolak: bertema sekolah/di bawah umur." }, 403);
  }

  // Ids on the reviewed lock list stay locked whatever the title says, so a title edit would be a silent no-op.
  if (title && isLockedMinorId(id)) {
    return json(
      { ok: false, error: "Video ini dikunci per-ID (hasil review: indikasi di bawah umur). Ganti judul tidak membukanya." },
      403,
    );
  }

  // Stored in KV (owner:edit:v1) and applied by the catalog at load time: no commit, no rebuild,
  // no GitHub token needed in the Worker.
  let saved;
  try {
    saved = await setOwnerEdit(id, { title, category, ...(extra ? { extra } : {}) });
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    return json(
      { ok: false, error: msg === "kv_unavailable" ? "Penyimpanan KV tidak tersedia." : `Gagal menyimpan: ${msg.slice(0, 120)}` },
      503,
    );
  }
  // Rebuild this isolate's catalog now; other isolates pick it up within ~30 s.
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
  return json({
    ok: true,
    id,
    title: saved?.title || null,
    category: saved?.category || null,
    // minor-detector.js verdict for the new title ("review" = owner should double-check it).
    detector: title ? detectorPriority("", title) : null,
    ...(extra ? { extra: saved?.extra || [] } : {}),
  });
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
  key?: string;
  q?: string;
  title?: string;
  extra?: string[];
  offset?: number;
  noThumb?: boolean;
  posters?: Record<string, string>;
};

/** Telegram webhook status for the owner: registered url, pending updates, last error, last OK. */
async function handleTelegramWebhook(install: boolean) {
  const [result, lastOk, lastSetup] = await Promise.all([
    install ? setupWebhook() : getWebhookInfo(),
    lastVerifiedUpdateAt(),
    lastSetupAt(),
  ]);
  const info = result.info;
  const urlOk = Boolean(info && info.url === WEBHOOK_URL);
  return json(
    {
      ok: result.ok,
      installed: install ? result.ok : undefined,
      error: result.error,
      expectedUrl: WEBHOOK_URL,
      urlOk,
      info: info || null,
      before: "before" in result ? result.before || null : undefined,
      lastSetupAt: install && result.ok ? new Date().toISOString() : lastSetup,
      lastVerifiedUpdateAt: lastOk,
    },
    result.ok ? 200 : 502,
  );
}

export const Route = createFileRoute("/api/owner-tools")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!ownerSecret()) return json({ ok: false, error: "not_configured" }, 503);
        let body: OwnerBody = {};
        try {
          body = ((await request.json()) as OwnerBody) || {};
        } catch {
          body = {};
        }
        // Owner key: header x-online-key (or body.key). Never the URL query.
        if (!(await isOwnerRequest(request, body.key))) return json({ ok: false, error: "forbidden" }, 403);
        if (typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "bad_json" }, 400);
        if (body.action === "telegram-webhook-info") return handleTelegramWebhook(false);
        if (body.action === "telegram-webhook-setup") return handleTelegramWebhook(true);
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
        if (body.action === "catalog-overview" || body.action === "catalog-search" || body.action === "thumb-missing") {
          // Always answer JSON, so the panel can show what went wrong instead of staying empty.
          try {
            if (body.action === "thumb-missing") return await handleThumbMissing(body);
            return body.action === "catalog-overview" ? await handleCatalogOverview(body) : await handleCatalogSearch(body);
          } catch (err) {
            console.error("[owner-tools] catalog", err);
            return json({ ok: false, error: `catalog_failed: ${String((err as Error)?.message || err).slice(0, 160)}` }, 500);
          }
        }
        if (body.action === "edit-video") {
          try {
            return await handleEditVideo(body);
          } catch (err) {
            console.error("[owner-tools] edit-video", err);
            return json({ ok: false, error: `Edit gagal: ${String((err as Error)?.message || err).slice(0, 160)}` }, 500);
          }
        }
        if (body.action === "share") return handleShare(body);
        if (body.action === "upload") return handleUpload(body);
        if (body.action === "set-poster") return handleSetPoster(body);
        if (body.action === "set-posters") return handleSetPosters(body);
        if (body.action === "refresh-posters") return handleRefreshPosters(body);
        return json({ ok: false, error: "bad_action" }, 400);
      },
    },
  },
});
