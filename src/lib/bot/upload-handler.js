import { parseMessage, detectCategory, cleanTitle, brandTitle } from "@/lib/bot/parse.js";
import { toRecord } from "@/lib/bot/store.js";
import {
  fetchPutarinMeta,
  fetchStreamtapeMeta,
  fetchEmbedPageMeta,
  expandPutarinFolder,
  fetchByseMeta,
  fetchDrpPageMeta,
} from "@/lib/bot/providers.js";
import { DRP_CATEGORY } from "@/lib/catalog/drp-hosts.js";
import { upsertVideosBatch } from "@/lib/bot/github.js";
import { mergeLatestPosters, isHttpPoster } from "@/lib/bot/posters.js";
import { minorContentReason } from "@/lib/catalog/hidden-ids.js";
import { lockedMinorReason } from "@/lib/catalog/minor-lock.js";

/** Owner's own LuluStream / DoodStream / Byse uploads ("byse-probe" = Byse on a not-yet-listed domain). */
const DRP_HOSTS = new Set(["lulu", "dood", "byse", "byse-probe"]);
function isDrpHost(host) {
  return DRP_HOSTS.has(String(host || ""));
}

/**
 * Title when Lulu/Dood/Byse give none (marked titleAuto so /pemilik lists it for a real title).
 * No "Dr. Pinguin" words here: cleanTitle strips old pinguin branding, brandTitle adds the domain.
 */
function drpAutoTitle(video) {
  return `Bokep Indo Pilihan ${String(video.code || video.id || "").replace(/^(?:lu|dd|by)-/i, "")}`.trim();
}

function hasUserTitle(raw) {
  const t = cleanTitle(String(raw || ""));
  return Boolean(t && t !== "Video");
}

async function resolveMetaFast(video, givenTitle, env) {
  let title =
    hasUserTitle(givenTitle) || hasUserTitle(video.title)
      ? cleanTitle(givenTitle || video.title || "") || `Video ${video.id}`
      : "";
  let thumb = String(video.poster || video.thumbnail || "").trim();
  if (thumb && !isHttpPoster(thumb)) thumb = "";

  try {
    if (video.host === "putarin") {
      const meta = await fetchPutarinMeta(video.id, env);
      if (!title && meta.title) title = cleanTitle(meta.title);
      if (!thumb && isHttpPoster(meta.thumb)) thumb = meta.thumb;
    } else if (video.host === "streamtape") {
      const meta = await fetchStreamtapeMeta(video.id, env);
      if (!title && meta.title) title = cleanTitle(meta.title);
      if (!thumb && isHttpPoster(meta.thumb)) thumb = meta.thumb;
    } else if ((video.host === "indoav" || video.host === "userbokep") && (!thumb || !title)) {
      const meta = await fetchEmbedPageMeta(video.embed, video.id);
      if (!title && meta.title) title = cleanTitle(meta.title);
      if (!thumb && isHttpPoster(meta.thumb)) thumb = meta.thumb;
    } else if (isDrpHost(video.host)) {
      // Best effort, once per upload. Byse (incl. unknown domains) always asks the public details
      // endpoint: it also confirms the link really is Byse and gives the real embed domain.
      let embed = "";
      let byseOk = false;
      let length = 0;
      if (video.host === "byse" || video.host === "byse-probe") {
        const meta = await fetchByseMeta(video.origin, video.code);
        byseOk = Boolean(meta.ok);
        if (!title && meta.title) title = cleanTitle(meta.title);
        if (!thumb && isHttpPoster(meta.thumb)) thumb = meta.thumb;
        if (meta.embed) embed = meta.embed;
        if (meta.length) length = meta.length;
      } else if (!thumb || !title) {
        const meta = await fetchDrpPageMeta(video.host, video.embed, video.code);
        if (!title && meta.title) title = cleanTitle(meta.title);
        if (!thumb && isHttpPoster(meta.thumb)) thumb = meta.thumb;
      }
      const auto = !title || title === "Video";
      return { title: auto ? drpAutoTitle(video) : title, thumb, embed, byseOk, length, titleAuto: auto };
    }
  } catch {
    /* fallback */
  }

  if (isDrpHost(video.host)) {
    const auto = !title || title === "Video";
    return { title: auto ? drpAutoTitle(video) : title, thumb, embed: "", byseOk: false, length: 0, titleAuto: auto };
  }

  if (!title) {
    title = givenTitle && givenTitle !== "Video" ? givenTitle : `Video ${video.id}`;
  }
  return { title, thumb };
}

/** Auto titles for Videy uploads without a typed title; picked in turn by the running number. */
const VIDEY_AUTO_TITLES = [
  (n) => `Video Viral Videy Indo Terbaru ${n}`,
  (n) => `Link Videy Viral Hari Ini ${n}`,
  (n) => `Bokep Videy Indo Viral ${n}`,
  (n) => `Videy Viral Terbaru ${n}`,
  (n) => `Video Videy Indo Lagi Rame ${n}`,
  (n) => `Link Videy Bokep Indo ${n}`,
];

function videyAutoTitle(n) {
  return VIDEY_AUTO_TITLES[(n - 1) % VIDEY_AUTO_TITLES.length](n);
}

/** Videy videos already in the catalog, for the next auto-title number. */
async function videyCount() {
  try {
    const [{ loadItems }, { isVidey }] = await Promise.all([
      import("@/lib/catalog/local-cache"),
      import("@/lib/catalog/local-shared"),
    ]);
    const bag = await loadItems();
    const list = bag.raw || bag.items || [];
    let n = 0;
    for (const it of list) if (isVidey(it)) n++;
    return n;
  } catch {
    return 0;
  }
}

/**
 * Running Videy number shared across bursts: the bundled catalog only knows deployed videos, so two
 * uploads before the next deploy used to get the same number. KV (existing ANALYTICS_KV binding)
 * keeps the last number handed out; we take the higher of both and reserve the whole block at once.
 */
const VIDEY_N_KEY = "bot:videy:n";
async function reserveVideyNumbers(count) {
  let kv = null;
  try {
    kv = await import("@/lib/owner-analytics-shared");
  } catch {
    kv = null;
  }
  const fromCatalog = await videyCount();
  let fromKv = 0;
  if (kv) fromKv = Math.floor(Number(await kv.optionalKvGet(VIDEY_N_KEY)) || 0);
  const start = Math.max(fromCatalog, fromKv);
  if (kv) await kv.optionalKvPut(VIDEY_N_KEY, String(start + count));
  return start;
}

/** Ids already in the (deployed) catalog, lowercased. */
async function catalogIds() {
  try {
    const { loadItems } = await import("@/lib/catalog/local-cache");
    const bag = await loadItems();
    return new Set((bag.raw || bag.items || []).map((it) => String(it?.id || "").toLowerCase()));
  } catch {
    return new Set();
  }
}

/** Upload-queue mode: KV flag bot:queue:on ("0" off = direct commits, "dry" shadow, "1" queue Videy); default "1". */
const QUEUE_DEFAULT_MODE = "1";
async function queueMode() {
  try {
    const kv = await import("@/lib/owner-analytics-shared");
    const v = String((await kv.optionalKvGet("bot:queue:on")) ?? "").trim();
    return v || QUEUE_DEFAULT_MODE;
  } catch {
    return "0";
  }
}

export const DEAD_VIDEY_REASON = "dead-videy-mp4";

/** Videy file URL as videy.co builds it: 9-char id ending in 2 is .mov, everything else .mp4. */
function videyFileUrl(id) {
  const s = String(id || "");
  return `https://cdn.videy.co/${s}.${s.length === 9 && s.endsWith("2") ? "mov" : "mp4"}`;
}

/** True only when cdn.videy.co answers 404/410 on 3 tries (cache-busted, ~1.5 s apart). */
async function isDeadVideyFile(id) {
  if (!/^[A-Za-z0-9]{4,40}$/.test(String(id || ""))) return false;
  for (let t = 0; t < 3; t++) {
    if (t) await new Promise((r) => setTimeout(r, 1500));
    try {
      const r = await fetch(`${videyFileUrl(id)}?cb=${Date.now()}${t}`, {
        headers: { Range: "bytes=0-1", "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
      });
      try {
        await r.body?.cancel();
      } catch {
        /* ignore */
      }
      if (r.status !== 404 && r.status !== 410) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Process upload batch: ACK already sent by caller.
 * Titles/thumbs: skip remote fetch when user sent title; else parallel <=5 with short timeout.
 * When API returns thumb, save poster/thumbnail on record + merge data/latest-posters.json.
 * GitHub: one upsertVideosBatch per feed file.
 */
export async function processUploadBatch({ token, chatId, text, env, tgSend, tgSendChunks, MAIN_KEYBOARD }) {
  const parsedMsg = parseMessage(text);
  if (!parsedMsg.videos.length) {
    await tgSend(
      token,
      chatId,
      "❌ Tidak ada link IndoAV / UserBokep / Puterin / Streamtape / Videy / LuluStream / DoodStream / Byse yang valid.\n\nKirim link lengkap, atau pakai tombol menu.",
      { reply_markup: MAIN_KEYBOARD }
    );
    return;
  }

  await tgSend(token, chatId, `⏳ Menerima ${parsedMsg.videos.length} link. Sedang diproses…`);

  const lines = [];
  let createdTotal = 0;
  let skippedTotal = 0;
  let failedTotal = 0;
  const posterBatch = {};

  const queue = [];
  for (const video of parsedMsg.videos) {
    const folderTitle = cleanTitle(String(video.title || parsedMsg.title || ""));
    if (video.host === "putarin-folder" || video.folder) {
      try {
        const kids = await expandPutarinFolder(video.id, folderTitle);
        if (!kids.length) {
          lines.push(`⚠️ Folder kosong / gagal dibaca: ${video.id}`);
          failedTotal += 1;
          continue;
        }
        lines.push(`📁 Folder ${video.id}: ${kids.length} video`);
        for (const kid of kids) queue.push(kid);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lines.push(`⚠️ Gagal baca folder ${video.id}: ${msg}`);
        failedTotal += 1;
      }
      continue;
    }
    queue.push(folderTitle && folderTitle !== "Video" ? { ...video, title: folderTitle } : video);
  }

  if (!queue.length) {
    await tgSendChunks(
      token,
      chatId,
      [`✅ 0 dibuat · ⏭️ 0 skip · ⚠️ ${failedTotal} gagal`, "", ...lines].join("\n") || "Tidak ada yang diproses.",
      { reply_markup: MAIN_KEYBOARD },
    );
    return;
  }

  const metas = await mapPool(queue, 5, async (video) => {
    const given = cleanTitle(String(video.title || parsedMsg.title || ""));
    return resolveMetaFast(video, given, env);
  });

  // Videy without a typed title: a keyword title with a running number (counts on from the Videy
  // videos already listed). Marked titleAuto so /pemilik can list them for a real title later.
  const autoTitled = new Set();
  if (queue.some((v) => v.host === "videy" && !hasUserTitle(v.title || parsedMsg.title))) {
    // Links already in the catalog are skipped as duplicates later: they get no number.
    const known = await catalogIds();
    const wants = (v) =>
      v.host === "videy" && !hasUserTitle(v.title || parsedMsg.title) && !known.has(String(v.id || "").toLowerCase());
    const need = queue.filter(wants).length;
    let n = await reserveVideyNumbers(need);
    for (let i = 0; i < queue.length; i++) {
      const v = queue[i];
      if (!wants(v)) continue;
      n += 1;
      metas[i] = { ...(metas[i] || {}), title: videyAutoTitle(n), thumb: "" };
      autoTitled.add(i);
    }
  }

  // Videy only: a video whose file is gone on cdn.videy.co (404 on every retry) is stored hidden,
  // never deleted. Network errors or any other status count as alive. Other sources are never checked.
  const deadVidey = new Set();
  await mapPool(
    queue.map((v, i) => [v, i]).filter(([v]) => v.host === "videy"),
    4,
    async ([v, i]) => {
      if (await isDeadVideyFile(v.id)) deadVidey.add(i);
    },
  );

  const byFile = new Map();
  for (let i = 0; i < queue.length; i++) {
    let video = queue[i];
    const meta = metas[i] || { title: `Video ${video.id}`, thumb: "" };
    if (isDrpHost(video.host)) {
      // Byse on a domain not in drp-hosts.js: kept only when Byse's details endpoint knew the code.
      if (video.host === "byse-probe" && !meta.byseOk) {
        failedTotal += 1;
        lines.push(`⚠️ Link tidak dikenal (bukan LuluStream/DoodStream/Byse): ${video.embed}`);
        continue;
      }
      const byseEmbed = (video.host === "byse" || video.host === "byse-probe") && /^https:\/\/[^/]+\/e\/[A-Za-z0-9]+/i.test(String(meta.embed || ""))
        ? String(meta.embed)
        : "";
      if (video.needsEmbedDomain && !byseEmbed) {
        // byse.sx itself does not play embeds; without the account's embed domain the video would not play.
        failedTotal += 1;
        lines.push(`⚠️ ${video.id}: link panel byse.sx — kirim link embed dari tombol Embed (domain akun Byse)`);
        continue;
      }
      video = {
        ...video,
        host: video.host === "byse-probe" ? "byse" : video.host,
        ...(byseEmbed ? { embed: byseEmbed, direct: byseEmbed } : {}),
      };
      if (meta.titleAuto) autoTitled.add(i);
    }
    // Judul dasar (branding situs lain + pinguin lama sudah dibuang) untuk kategori & filter minor;
    // yang disimpan/ditampilkan: judul dasar + tepat satu " - koleksidrpinguin.com" (keputusan pemilik).
    const baseTitle = cleanTitle(meta.title || `Video ${video.id}`);
    const title = brandTitle(baseTitle === "Video" ? `Video ${video.id}` : baseTitle);
    // A specific category from the message wins; a generic one ("amatir"/"umum"/"lainnya",
    // e.g. pasted from the source page) only applies when title detection finds nothing better.
    const given = String(parsedMsg.category || "").toLowerCase().trim();
    const generic = !given || ["amatir", "umum", "lainnya", "bokep"].includes(given);
    const detected = detectCategory(baseTitle);
    const category =
      isDrpHost(video.host)
        ? DRP_CATEGORY
        : video.host === "videy"
        ? "videy"
        : video.host === "putarin" || video.host === "putarin-folder"
        ? parsedMsg.category || "jav"
        : video.host === "streamtape"
          ? parsedMsg.category || "ai-plus"
          : !generic
            ? given
            : detected !== "lainnya"
              ? detected
              : (given && given !== DRP_CATEGORY ? given : "") ||
                (video.host === "indoav" || video.host === "userbokep" ? "amatir" : "lainnya");
    const withPoster = isHttpPoster(meta.thumb)
      ? { ...video, poster: meta.thumb, thumbnail: meta.thumb }
      : video;
    const recordBase = toRecord({ parsed: withPoster, title, category });
    // Lulu/Dood/Byse: keep the host's own file code (meta refresh later) and Byse's duration when known.
    const baseRecord = isDrpHost(video.host)
      ? { ...recordBase, code: video.code, ...(meta.length ? { duration: meta.length } : {}) }
      : recordBase;
    // School/minor-themed titles are stored but flagged hidden (the catalog never shows them).
    const minorText = `${baseTitle} ${String(video.title || parsedMsg.title || "")} ${String(meta.title || "")}`;
    const hiddenReason = minorContentReason(minorText) || lockedMinorReason(minorText);
    const flagged = autoTitled.has(i) ? { ...baseRecord, titleAuto: true } : baseRecord;
    const record = hiddenReason
      ? { ...flagged, hidden: true, hidden_reason: hiddenReason }
      : deadVidey.has(i)
        ? { ...flagged, hidden: true, hidden_reason: DEAD_VIDEY_REASON }
        : flagged;
    const fileName = video.file || "videos.json";
    const list = byFile.get(fileName) || [];
    list.push({ video, title, record });
    byFile.set(fileName, list);
  }

  // Upload queue. Mode from KV flag bot:queue:on (kill switch "0"); default "1".
  //  "1":   Videy records go to KV (bot:q:*); the hourly cron flush commits them in one batch (one
  //         deploy) and sends the final report. Any KV write error -> that item takes the direct path.
  //  "dry": direct commit + shadow copy (bot:qdry:*) for the read-only dry-run flush.
  //  "0":   direct commit only (old path).
  let queuedTotal = 0;
  try {
    const mode = await queueMode();
    if (mode === "1" || mode === "dry") {
      const kv = await import("@/lib/owner-analytics-shared");
      for (const [fileName, items] of byFile) {
        const keep = [];
        for (const it of items) {
          if (String(it.record?.category || "") !== "videy") {
            keep.push(it);
            continue;
          }
          const prefix = mode === "1" ? "bot:q:" : "bot:qdry:";
          const key = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const value = JSON.stringify({ fileName, record: it.record, title: it.title, chatId });
          let ok = false;
          try {
            await kv.optionalKvPut(key, value, 7 * 86400);
            ok = mode !== "1" || (await kv.optionalKvGet(key)) === value;
          } catch {
            ok = false;
          }
          if (mode === "1" && ok) {
            queuedTotal += 1;
            lines.push(
              it.record.hidden_reason === DEAD_VIDEY_REASON
                ? `🕒 ${it.record.id} — ${it.title} · disembunyikan: video mati`
                : `🕒 ${it.record.id} — ${it.title} (antre, tayang saat flush berikutnya)`,
            );
          } else {
            keep.push(it);
          }
        }
        if (keep.length) byFile.set(fileName, keep);
        else byFile.delete(fileName);
      }
    }
  } catch {
    /* fall back to the direct path for everything still in byFile */
  }

  for (const [fileName, items] of byFile) {
    try {
      const result = await upsertVideosBatch(env, fileName, items.map((it) => it.record));
      if (!result.ok) {
        failedTotal += items.length;
        const errMsg = (result.errors || []).join("; ") || "unknown";
        lines.push(`⚠️ Gagal batch ${fileName}: ${errMsg}`);
        for (const it of items) lines.push(`⚠️ ${it.record.id} — ${it.title}`);
        continue;
      }

      createdTotal += result.created || 0;
      skippedTotal += result.skipped || 0;

      const createdIds = new Set((result.records || []).map((r) => String(r.id || "").toLowerCase()));

      for (const it of items) {
        const idKey = String(it.record.id || "").toLowerCase();
        const poster = String(it.record.poster || it.record.thumbnail || "").trim();
        if (isHttpPoster(poster)) posterBatch[it.record.id] = poster;
        if (createdIds.has(idKey)) {
          lines.push(
            `✅ ${it.record.id} — ${it.title}${isHttpPoster(poster) ? " · poster" : ""}${it.record.hidden_reason === DEAD_VIDEY_REASON ? " · disembunyikan: video mati" : it.record.hidden ? " · 🙈 disembunyikan (judul menyiratkan minor/sekolah)" : ""}`,
          );
        } else {
          lines.push(`⏭️ ${it.record.id} — ${it.title} (sudah ada)`);
        }
      }

      if (result.rotated) lines.push(`📦 Chunk penuh → data/${result.rotated}; aktif: data/${result.file}`);
      else if (result.file) lines.push(`📂 JSON: data/${result.file} (total chunk: ${result.total})`);
      if (result.errors?.length) {
        for (const e of result.errors) lines.push(`⚠️ ${e}`);
      }
    } catch (err) {
      failedTotal += items.length;
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`⚠️ Gagal push GitHub (${fileName}): ${msg}`);
      for (const it of items) lines.push(`⚠️ ${it.record.id} — ${it.title}`);
    }
  }

  if (Object.keys(posterBatch).length) {
    try {
      const merged = await mergeLatestPosters(env, posterBatch);
      if (merged.ok) {
        lines.push(`🖼️ Poster map: +${merged.added} baru · ${merged.updated} update · total ${merged.total}`);
      } else {
        lines.push(`⚠️ Poster map gagal: ${merged.error || "unknown"}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`⚠️ Poster map error: ${msg}`);
    }
  }

  const summary = `✅ ${createdTotal} dibuat · ⏭️ ${skippedTotal} skip · ⚠️ ${failedTotal} gagal${queuedTotal ? ` · 🕒 ${queuedTotal} antre` : ""}`;
  await tgSendChunks(
    token,
    chatId,
    [summary, "", ...lines].join("\n").trim() || "Tidak ada yang diproses.",
    { reply_markup: MAIN_KEYBOARD },
  );
}

