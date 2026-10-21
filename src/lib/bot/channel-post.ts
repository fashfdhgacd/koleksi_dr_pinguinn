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
/** Owner's public channel; used when no channel id was captured via my_chat_member. */
const DEFAULT_CHANNEL = "@joswoa";

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

async function tgCall(token: string, method: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("channel", method, res.status, redactToken(t.slice(0, 200), token));
      return false;
    }
    return true;
  } catch (err) {
    console.error("channel", method, redactToken(err instanceof Error ? err.message : err, token));
    return false;
  }
}

/** Post up to MAX_POSTS new (visible) videos to the stored channel, ~1.1s apart. Never throws. */
export async function postNewVideosToChannel(token: string, videos: CreatedVideo[]): Promise<number> {
  try {
    const list = (Array.isArray(videos) ? videos : []).filter((v) => v && v.id && !v.hidden).slice(0, MAX_POSTS);
    if (!list.length) return 0;
    const ch = (await loadChannel()) || { id: DEFAULT_CHANNEL, title: DEFAULT_CHANNEL };
    let posted = 0;
    for (let i = 0; i < list.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, GAP_MS));
      const v = list[i];
      const caption = `${String(v.title || v.id).slice(0, 900)}\nTonton: ${HOST}/watch/${encodeURIComponent(v.id)}`;
      const poster = String(v.poster || "").trim();
      let ok = false;
      if (/^https?:\/\//i.test(poster)) {
        ok = await tgCall(token, "sendPhoto", { chat_id: ch.id, photo: poster, caption });
      }
      if (!ok) ok = await tgCall(token, "sendMessage", { chat_id: ch.id, text: caption });
      if (ok) posted++;
    }
    return posted;
  } catch (err) {
    console.error("postNewVideosToChannel", redactToken(err instanceof Error ? err.message : err, token));
    return 0;
  }
}
