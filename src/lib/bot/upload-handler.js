import { parseMessage, detectCategory, cleanTitle } from "@/lib/bot/parse.js";
import { toRecord } from "@/lib/bot/store.js";
import { fetchPutarinTitle, fetchStreamtapeTitle, expandPutarinFolder } from "@/lib/bot/providers.js";
import { upsertVideosBatch } from "@/lib/bot/github.js";

function hasUserTitle(raw) {
  const t = cleanTitle(String(raw || ""));
  return Boolean(t && t !== "Video");
}

async function resolveTitleFast(video, givenTitle, env) {
  if (hasUserTitle(givenTitle) || hasUserTitle(video.title)) {
    return cleanTitle(givenTitle || video.title || "") || `Video ${video.id}`;
  }
  try {
    if (video.host === "putarin") {
      const t = await fetchPutarinTitle(video.id, env);
      if (t) return cleanTitle(t);
    }
    if (video.host === "streamtape") {
      const t = await fetchStreamtapeTitle(video.id, env);
      if (t) return cleanTitle(t);
    }
  } catch {
    /* fallback */
  }
  return givenTitle && givenTitle !== "Video" ? givenTitle : `Video ${video.id}`;
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
 * Titles: skip remote fetch when user sent title; else parallel <=5 with short timeout.
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

  const titles = await mapPool(queue, 5, async (video) => {
    const given = cleanTitle(String(video.title || parsedMsg.title || ""));
    return resolveTitleFast(video, given, env);
  });

  const byFile = new Map();
  for (let i = 0; i < queue.length; i++) {
    const video = queue[i];
    const title = titles[i] || `Video ${video.id}`;
    const category =
      parsedMsg.category ||
      (video.host === "putarin" || video.host === "putarin-folder"
        ? "jav"
        : video.host === "streamtape"
          ? "ai-plus"
          : detectCategory(title));
    const record = toRecord({ parsed: video, title, category });
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
        if (createdIds.has(idKey)) lines.push(`✅ ${it.record.id} — ${it.title}`);
        else lines.push(`⏭️ ${it.record.id} — ${it.title} (sudah ada)`);
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

  const summary = `✅ ${createdTotal} dibuat · ⏭️ ${skippedTotal} skip · ⚠️ ${failedTotal} gagal`;
  await tgSendChunks(
    token,
    chatId,
    [summary, "", ...lines].join("\n").trim() || "Tidak ada yang diproses.",
    { reply_markup: MAIN_KEYBOARD },
  );
}
