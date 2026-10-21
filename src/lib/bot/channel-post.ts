/**
 * Auto-post new uploads to the owner's Telegram channel.
 * - The channel id is learned from a `my_chat_member` update (bot promoted to administrator by a
 *   trusted admin) and stored in D1 (`bot_settings`, created on first use, once per isolate).
 * - Posting happens once per upload batch (never per visit). Every error is swallowed so the
 *   upload flow can never break because of the channel.
 */
import { getD1, type D1DatabaseLike } from "@/lib/analytics-d1";
import { redactToken } from "@/lib/telegram-webhook";

const HOST = "https://koleksidrpinguin.com";
const KEY_ID = "tg_channel_id";
const KEY_TITLE = "tg_channel_title";
const MAX_POSTS = 20;
const GAP_MS = 1100;
/** Owner's channel "koleksidrpinguin.com" (private; bot is admin). Used when no valid override is stored. */
const DEFAULT_CHANNEL = "-1004457868656";
/** Old public username that the bot was never admin of; a stored override with it is ignored. */
const STALE_CHANNELS = new Set(["@joswoa", "joswoa"]);

const g = globalThis as typeof globalThis & { __botSettingsSchema__?: Promise<void> };

async function settingsDb(): Promise<D1DatabaseLike | null> {
  const db = await getD1();
  if (!db) return null;
  g.__botSettingsSchema__ ??= db
    .prepare(
      `create table if not exists bot_settings (
         key text primary key,
         value text not null,
         updated_at integer not null
       )`,
    )
    .run()
    .then(() => undefined)
    .catch((err) => {
      g.__botSettingsSchema__ = undefined;
      throw err;
    });
  await g.__botSettingsSchema__;
  return db;
}

export async function saveChannel(id: string, title: string): Promise<boolean> {
  try {
    const db = await settingsDb();
    if (!db) return false;
    const now = Date.now();
    const sql = `insert into bot_settings (key, value, updated_at) values (?, ?, ?)
                 on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`;
    await db.batch([
      db.prepare(sql).bind(KEY_ID, id, now),
      db.prepare(sql).bind(KEY_TITLE, title, now),
    ]);
    return true;
  } catch (err) {
    console.error("saveChannel", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function loadChannel(): Promise<{ id: string; title: string } | null> {
  try {
    const db = await settingsDb();
    if (!db) return null;
    const res = await db
      .prepare(`select key, value from bot_settings where key in (?, ?)`)
      .bind(KEY_ID, KEY_TITLE)
      .all<{ key: string; value: string }>();
    const map = new Map((res.results || []).map((r) => [r.key, r.value]));
    const id = String(map.get(KEY_ID) || "").trim();
    if (STALE_CHANNELS.has(id.toLowerCase())) return null;
    return id ? { id, title: String(map.get(KEY_TITLE) || "") } : null;
  } catch (err) {
    console.error("loadChannel", err instanceof Error ? err.message : err);
    return null;
  }
}

type ChatMemberUpdate = {
  chat?: { id?: number | string; type?: string; title?: string };
  from?: { id?: number | string; is_bot?: boolean };
  new_chat_member?: { status?: string; user?: { is_bot?: boolean } };
};

/**
 * Handle a `my_chat_member` update. Only a channel promotion by a trusted admin is stored.
 * Returns true when the channel was connected.
 */
export async function handleMyChatMember(
  token: string,
  upd: ChatMemberUpdate,
  allowed: Set<string>,
  dm: (chatId: string | number, text: string) => Promise<unknown>,
): Promise<boolean> {
  try {
    const chat = upd?.chat;
    const fromId = upd?.from?.id != null ? String(upd.from.id) : "";
    if (!chat || chat.type !== "channel" || chat.id == null) return false;
    if (upd.new_chat_member?.status !== "administrator") return false;
    if (!fromId || upd.from?.is_bot || allowed.size === 0 || !allowed.has(fromId)) return false;
    const title = String(chat.title || "").slice(0, 200) || String(chat.id);
    const ok = await saveChannel(String(chat.id), title);
    await dm(fromId, ok ? `Channel tersambung: ${title}` : `Gagal menyimpan channel: ${title}`).catch(
      () => undefined,
    );
    return ok;
  } catch (err) {
    console.error("handleMyChatMember", redactToken(err instanceof Error ? err.message : err, token));
    return false;
  }
}

export type CreatedVideo = { id: string; title: string; poster?: string; hidden?: boolean };

type TgResult = { ok: boolean; error: string };

async function tgCall(token: string, method: string, body: Record<string, unknown>): Promise<TgResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const t = await res.text().catch(() => "");
    let desc = "";
    let ok = res.ok;
    try {
      const j = JSON.parse(t) as { ok?: boolean; description?: string };
      if (j && j.ok === false) ok = false;
      desc = String(j?.description || "");
    } catch {
      /* not json */
    }
    if (!ok) {
      const error = redactToken(desc || `HTTP ${res.status} ${t.slice(0, 120)}`, token).slice(0, 200);
      console.error("channel", method, res.status, error);
      return { ok: false, error };
    }
    return { ok: true, error: "" };
  } catch (err) {
    const error = redactToken(err instanceof Error ? err.message : String(err), token).slice(0, 200);
    console.error("channel", method, error);
    return { ok: false, error };
  }
}

/** True when `url` answers 200 with a real jpeg/png/webp (not an SVG placeholder or 404 page). */
async function isImage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { accept: "image/*" }, signal: AbortSignal.timeout(6000) });
    const type = String(res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const len = Number(res.headers.get("content-length") || 0);
    await res.body?.cancel().catch(() => undefined);
    return res.status === 200 && /^image\/(?:jpeg|jpg|png|webp)$/.test(type) && (!len || len >= 1500);
  } catch {
    return false;
  }
}

/**
 * Poster for a just-uploaded video without one: the owner hosts' public thumbnail URL, used only
 * when it really is an image (Byse img-place, LuluStream lulucdn, DoodStream embed og:image).
 * Videy (and anything else) gets none: the post falls back to text. No waiting, no retries.
 */
async function hostPoster(id: string): Promise<string> {
  const m = /^(by|lu|dd)-([A-Za-z0-9]{6,40})$/.exec(id);
  if (!m) return "";
  const [, kind, code] = m;
  let urls: string[] = [];
  if (kind === "by") urls = [`https://img-place.com/${code}_xt.jpg`, `https://img-place.com/${code}_t.jpg`];
  else if (kind === "lu") urls = [`https://img.lulucdn.com/${code}_xt.jpg`, `https://img.lulucdn.com/${code}_t.jpg`];
  else {
    try {
      const res = await fetch(`https://playmogo.com/e/${code}`, {
        headers: { accept: "text/html", "user-agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(6000),
      });
      const html = res.ok ? await res.text() : "";
      const og = html.match(/(?:property|name)=["']og:image["']\s+content=["'](https?:\/\/[^"']+)["']/i);
      if (og) urls = [og[1]];
    } catch {
      urls = [];
    }
  }
  for (const u of urls) if (await isImage(u)) return u;
  return "";
}

export type ChannelReport = { posted: number; total: number; chat: string; error: string };

/**
 * Post up to MAX_POSTS new (visible) videos to the stored channel, ~1.1s apart. Never throws.
 * Returns how many went out plus the last Telegram error description (for the uploader's ACK).
 */
export async function postNewVideosToChannelReport(token: string, videos: CreatedVideo[]): Promise<ChannelReport> {
  const report: ChannelReport = { posted: 0, total: 0, chat: DEFAULT_CHANNEL, error: "" };
  try {
    const list = (Array.isArray(videos) ? videos : []).filter((v) => v && v.id && !v.hidden).slice(0, MAX_POSTS);
    report.total = list.length;
    if (!list.length) return report;
    const ch = (await loadChannel()) || { id: DEFAULT_CHANNEL, title: DEFAULT_CHANNEL };
    report.chat = ch.id;
    for (let i = 0; i < list.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, GAP_MS));
      const v = list[i];
      const caption = `${String(v.title || v.id).slice(0, 900)}\nTonton: ${HOST}/watch/${encodeURIComponent(v.id)}`;
      let poster = String(v.poster || "").trim();
      if (!/^https?:\/\//i.test(poster)) poster = await hostPoster(String(v.id));
      let res: TgResult = { ok: false, error: "" };
      if (/^https?:\/\//i.test(poster)) {
        res = await tgCall(token, "sendPhoto", { chat_id: ch.id, photo: poster, caption });
        if (!res.ok) report.error = res.error;
      }
      if (!res.ok) {
        res = await tgCall(token, "sendMessage", { chat_id: ch.id, text: caption });
        if (!res.ok) report.error = res.error;
      }
      if (res.ok) report.posted++;
    }
    return report;
  } catch (err) {
    report.error = redactToken(err instanceof Error ? err.message : String(err), token).slice(0, 200);
    console.error("postNewVideosToChannel", report.error);
    return report;
  }
}

/** Post new videos to the channel; returns the number posted. Never throws. */
export async function postNewVideosToChannel(token: string, videos: CreatedVideo[]): Promise<number> {
  return (await postNewVideosToChannelReport(token, videos)).posted;
}

/** One ACK line for the uploader, e.g. "📣 Channel: 4 terkirim" or "📣 Channel gagal: <reason>". */
export function channelReportLine(r: ChannelReport): string {
  if (!r.total) return "";
  if (r.posted === r.total) return `📣 Channel: ${r.posted} terkirim`;
  const why = r.error || "tidak diketahui";
  if (r.posted > 0) return `📣 Channel: ${r.posted}/${r.total} terkirim · gagal: ${why}`;
  return `📣 Channel gagal (${r.chat}): ${why}`;
}
