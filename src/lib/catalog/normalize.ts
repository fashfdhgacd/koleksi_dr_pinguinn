import type { VideoCard, VideoDetail, VideoQuality } from "./types";

const ADULT_RE =
  /\b(porn|xxx|nsfw|erotic|nudist|hentai|hardcore|adults?\s*only|exploitation|sexploitation|stag\s*film)\b/i;

const PLAYABLE_EXT = [".mp4", ".m4v", ".webm", ".ogv"];

const FORMAT_PRIORITY: Record<string, number> = {
  "512kb mpeg4": 100,
  mpeg4: 90,
  "h.264": 80,
  "h.264 hd": 78,
  "h.264 720p": 76,
  "720p": 74,
  "1080p": 70,
  webm: 60,
  "ogg video": 50,
};

export function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const s = asString(item);
      if (s) return s;
    }
  }
  return "";
}

export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asString).filter(Boolean);
  }
  const single = asString(value);
  if (!single) return [];
  return single
    .split(/[|;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function parseRuntime(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw > 10000 ? Math.round(raw) : Math.round(raw * (raw < 300 ? 60 : 1));
  }
  const text = asString(raw).toLowerCase();
  if (!text) return null;

  const clock = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (clock) {
    const h = clock[3] ? Number(clock[1]) : 0;
    const m = clock[3] ? Number(clock[2]) : Number(clock[1]);
    const s = clock[3] ? Number(clock[3]) : Number(clock[2]);
    const total = h * 3600 + m * 60 + s;
    return total > 0 ? total : null;
  }

  let seconds = 0;
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(h|j|jam|hours?|hrs?)\b/);
  const mins = text.match(/(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|menit)\b/);
  const secs = text.match(/(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|detik)\b/);
  if (hours) seconds += Number(hours[1]) * 3600;
  if (mins) seconds += Number(mins[1]) * 60;
  if (secs) seconds += Number(secs[1]);
  if (seconds > 0) return Math.round(seconds);

  const n = asNumber(text);
  if (n && n > 0) return n < 300 ? Math.round(n * 60) : Math.round(n);
  return null;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h} j ${m} m`;
  if (m > 0) return `${m} m`;
  return `${total} d`;
}

export function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function truncate(value: string, max = 220): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

export function isAdultItem(title: string, subjects: string[]): boolean {
  if (ADULT_RE.test(title)) return true;
  return subjects.some((s) => ADULT_RE.test(s));
}

export function thumbnailUrl(id: string): string {
  return `https://archive.org/services/img/${encodeURIComponent(id)}`;
}

export function formatQualityLabel(format: string, name: string): string {
  const lower = `${format} ${name}`.toLowerCase();
  if (lower.includes("1080")) return "1080p";
  if (lower.includes("720")) return "720p";
  if (lower.includes("512")) return "512K";
  if (lower.includes("256")) return "256K";
  if (lower.includes("h.264") || lower.includes("mpeg4") || name.endsWith(".mp4")) return "SD";
  if (name.endsWith(".webm")) return "WebM";
  if (name.endsWith(".ogv")) return "Ogg";
  return format || "Video";
}

type ArchiveDoc = {
  identifier?: unknown;
  title?: unknown;
  description?: unknown;
  year?: unknown;
  creator?: unknown;
  subject?: unknown;
  runtime?: unknown;
  downloads?: unknown;
};

export function docToCard(doc: ArchiveDoc): VideoCard | null {
  const id = asString(doc.identifier);
  if (!id) return null;
  const title = asString(doc.title) || id;
  const subjects = asStringList(doc.subject);
  if (isAdultItem(title, subjects)) return null;
  const duration = parseRuntime(doc.runtime);
  const description = truncate(stripHtml(asString(doc.description)));
  const category = subjects[0] || "Film";
  const year = asString(doc.year) || null;
  return {
    id,
    title,
    thumbnail: thumbnailUrl(id),
    description: description || "Tidak ada sinopsis.",
    category,
    duration,
    durationLabel: formatDuration(duration),
    quality: "SD",
    year,
    creator: asString(doc.creator) || null,
    views: asNumber(doc.downloads),
  };
}

type ArchiveFile = {
  name?: unknown;
  format?: unknown;
  size?: unknown;
  length?: unknown;
};

export function pickQualities(id: string, files: ArchiveFile[]): VideoQuality[] {
  const seen = new Set<string>();
  const found: Array<VideoQuality & { rank: number; size: number }> = [];

  for (const file of files) {
    const name = asString(file.name);
    if (!name) continue;
    const lower = name.toLowerCase();
    if (lower.includes("__ia") || lower.endsWith(".jpg") || lower.endsWith(".png")) continue;
    const format = asString(file.format);
    const extOk = PLAYABLE_EXT.some((ext) => lower.endsWith(ext));
    const formatRank = FORMAT_PRIORITY[format.toLowerCase()];
    if (!extOk && formatRank == null) continue;
    const url = `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(name)}`;
    if (seen.has(url)) continue;
    seen.add(url);
    found.push({
      label: formatQualityLabel(format, name),
      url,
      format: format || name.split(".").pop()?.toUpperCase() || "Video",
      rank: formatRank ?? (lower.endsWith(".mp4") ? 85 : 40),
      size: asNumber(file.size) ?? Number.MAX_SAFE_INTEGER,
    });
  }

  found.sort((a, b) => b.rank - a.rank || a.size - b.size);
  return found.map(({ label, url, format }) => ({ label, url, format }));
}

export function toDetail(card: VideoCard, files: ArchiveFile[], extraRuntime?: unknown): VideoDetail {
  const qualities = pickQualities(card.id, files);
  const duration = card.duration ?? parseRuntime(extraRuntime);
  return {
    ...card,
    duration,
    durationLabel: formatDuration(duration),
    video_url: qualities[0]?.url ?? null,
    qualities,
    subjects: card.category ? [card.category] : [],
    playable: qualities.length > 0,
    quality: qualities[0]?.label ?? "—",
  };
}

export function isSafeId(id: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(id);
}

export function sanitizeSearch(q: string): string {
  return q
    .replace(/[()[\]{}"':*~^\\]/g, " ")
    .replace(/\b(AND|OR|NOT)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
