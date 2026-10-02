import { parseMessage, detectCategory, cleanTitle } from "@/lib/bot/parse.js";
import { toRecord } from "@/lib/bot/store.js";
import { fetchPutarinMeta, fetchStreamtapeMeta, expandPutarinFolder } from "@/lib/bot/providers.js";
import { upsertVideosBatch } from "@/lib/bot/github.js";
import { mergeLatestPosters, isHttpPoster } from "@/lib/bot/posters.js";

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
    }
  } catch {
    /* fallback */
  }

  if (!title) {
    title = givenTitle && givenTitle !== "Video" ? givenTitle : `Video ${video.id}`;
  }
  return { title, thumb };
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
      "❌ Tidak ada link IndoAV / UserBokep / Puterin / Streamtape / Lulu / Videy yang valid.\n\nKirim link lengkap, atau pakai tombol menu.",
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

  const byFile = new Map();
  for (let i = 0; i < queue.length; i++) {
    const video = queue[i];
    const meta = metas[i] || { title: `Video ${video.id}`, thumb: "" };
    const title = meta.title || `Video ${video.id}`;
    const category =
      parsedMsg.category ||
      (video.host === "putarin" || video.host === "putarin-folder"
        ? "jav"
        : video.host === "streamtape"
          ? "ai-plus"
          : detectCategory(title));
    const withPoster = isHttpPoster(meta.thumb)
      ? { ...video, poster: meta.thumb, thumbnail: meta.thumb }
      : video;
    const record = toRecord({ parsed: withPoster, title, category });
    const fileName = video.file || "videos.json";
    const list = byFile.get(fileName) || [];
    list.push({ video, title, record });
    byFile.set(fileName, list);
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
          lines.push(`✅ ${it.record.id} — ${it.title}${isHttpPoster(poster) ? " · poster" : ""}`);
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

  const summary = `✅ ${createdTotal} dibuat · ⏭️ ${skippedTotal} skip · ⚠️ ${failedTotal} gagal`;
  await tgSendChunks(
    token,
    chatId,
    [summary, "", ...lines].join("\n").trim() || "Tidak ada yang diproses.",
    { reply_markup: MAIN_KEYBOARD },
  );
}

