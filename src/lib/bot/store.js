import { promises as fs } from "node:fs";
import path from "node:path";
import { titleTags } from "../catalog/title-tags";

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Ingest-time auto tags: same engine as the site (title-tags.ts + tag-dictionary.js), so a new video
 * carries its category, host, "telegram" and up to 12 theme tags. The site re-derives them at build.
 */
function autoTags(cat, parsed, title) {
  const sourceText = `${parsed.embed || ""} ${parsed.source || ""} ${parsed.direct || ""} ${parsed.host || ""}`;
  const themes = titleTags(title, cat, { indoSource: /indoav|userbokep|putarin|puterin/i.test(sourceText), sourceText });
  return [...new Set([cat, parsed.host, "telegram", ...themes].filter(Boolean))];
}

export function toRecord({ parsed, title, category }) {
  const cat = (category || "umum").toLowerCase();
  const poster = String(parsed.poster || parsed.thumbnail || "").trim();
  return {
    id: parsed.id,
    title,
    embed: parsed.embed,
    direct: parsed.direct,
    source: parsed.source,
    category: cat,
    // Ingest-time auto tags (shared dictionary, tag-dictionary.js); the site re-derives the same at build.
    tags: autoTags(cat, parsed, title),
    date: today(),
    updated_at: new Date().toISOString(),
    ...(poster.startsWith("http") ? { poster, thumbnail: poster } : {}),
  };
}

export async function readJsonArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

export async function writeJsonArray(filePath, items) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(items, null, 2) + "\n", "utf8");
  await fs.rename(tmp, filePath);
}

function videoKey(item) {
  const url = String(item.embed || item.direct || "");
  const m = url.match(/\/(?:e|v|d)\/([A-Za-z0-9_-]+)/i);
  return (item.id || (m ? m[1] : url)).toLowerCase();
}

/** Upsert against a local file (for long-running / local bot). */
export async function upsertVideo(filePath, record) {
  const items = await readJsonArray(filePath);
  const key = videoKey(record);
  const idx = items.findIndex((it) => videoKey(it) === key);

  if (idx >= 0) {
    items[idx] = { ...items[idx], ...record, updated_at: new Date().toISOString() };
    await writeJsonArray(filePath, items);
    return { action: "updated", total: items.length, record: items[idx] };
  }

  items.unshift(record);
  await writeJsonArray(filePath, items);
  return { action: "created", total: items.length, record };
}

/** In-memory upsert (for serverless webhook). Returns new array + action. */
export function upsertInMemory(items, record) {
  const list = Array.isArray(items) ? items.slice() : [];
  const key = videoKey(record);
  const idx = list.findIndex((it) => videoKey(it) === key);

  if (idx >= 0) {
    list[idx] = { ...list[idx], ...record, updated_at: new Date().toISOString() };
    return { action: "updated", total: list.length, record: list[idx], items: list };
  }

  list.unshift(record);
  return { action: "created", total: list.length, record, items: list };
}
