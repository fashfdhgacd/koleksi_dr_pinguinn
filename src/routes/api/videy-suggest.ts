import { createFileRoute } from "@tanstack/react-router";
import { getD1, type D1DatabaseLike } from "@/lib/analytics-d1";
import { isOwnerRequest } from "@/lib/owner-auth";

/**
 * Public intake for Videy video suggestions sent from videyy.icu.
 * POST { url, note? }  → anonymous submit (videy.co / cdn.videy.co links only).
 * GET                  → owner-only pending list.
 * POST { action:"decide", id, decision:"approved"|"rejected" } → owner-only.
 * Suggestions never publish automatically — the owner reviews them in /pemilik.
 */

const SCHEMA = [
  `create table if not exists videy_suggestions (
     id integer primary key autoincrement,
     video_id text not null,
     url text not null,
     note text not null default '',
     status text not null default 'pending',
     created_at integer not null,
     decided_at integer
   )`,
  `create unique index if not exists videy_suggestions_video_id on videy_suggestions(video_id)`,
];

const g = globalThis as typeof globalThis & { __videySuggestSchema__?: Promise<void> };

async function db(): Promise<D1DatabaseLike | null> {
  const d1 = await getD1().catch(() => null);
  if (!d1) return null;
  g.__videySuggestSchema__ ??= d1
    .batch(SCHEMA.map((s) => d1.prepare(s)))
    .then(() => undefined)
    .catch((err) => {
      g.__videySuggestSchema__ = undefined;
      throw err;
    });
  await g.__videySuggestSchema__;
  return d1;
}

const VIDEY_ID = /^[A-Za-z0-9_-]{6,24}$/;

function extractVideyId(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s || s.length > 300) return null;
  // cdn.videy.co/<id>.mp4 (cdn2, cdn3, ... too)
  const cdn = s.match(/^(?:https?:\/\/)?(?:cdn\d*\.videy\.co)\/([A-Za-z0-9_-]{6,24})\.mp4(?:[?#].*)?$/i);
  if (cdn) return cdn[1];
  // videy.co/v/?id=<id> or videy.co/<id>
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    if (!/(^|\.)videy\.co$/i.test(u.hostname)) return null;
    const id = u.searchParams.get("id") || u.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
    return id && VIDEY_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

export const Route = createFileRoute("/api/videy-suggest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { url?: unknown; note?: unknown; action?: unknown; id?: unknown; decision?: unknown; key?: unknown } = {};
        try {
          body = ((await request.json()) as typeof body) || {};
        } catch {
          return json({ ok: false, error: "bad_json" }, 400);
        }

        // Owner decision path
        if (body.action === "decide") {
          if (!(await isOwnerRequest(request, typeof body.key === "string" ? body.key : undefined)))
            return json({ ok: false, error: "forbidden" }, 403);
          const id = Number(body.id);
          const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : null;
          if (!Number.isInteger(id) || id < 1 || !decision) return json({ ok: false, error: "bad_request" }, 400);
          const d1 = await db().catch(() => null);
          if (!d1) return json({ ok: false, error: "db_unavailable" }, 503);
          await d1
            .prepare(`update videy_suggestions set status = ?, decided_at = ? where id = ?`)
            .bind(decision, Date.now(), id)
            .run();
          return json({ ok: true });
        }

        // Public submit path
        const videoId = extractVideyId(typeof body.url === "string" ? body.url : "");
        if (!videoId) return json({ ok: false, error: "Link Videy tidak valid. Gunakan link videy.co atau cdn.videy.co." }, 400);
        const note = String(body.note || "").slice(0, 200);
        const d1 = await db().catch(() => null);
        if (!d1) return json({ ok: false, error: "server_error" }, 503);

        // Rate limit sederhana: maks 5 pending per video_id sudah di-cover unique index;
        // batasi total pending agar tidak dibanjiri.
        const pending = await d1
          .prepare(`select count(*) as n from videy_suggestions where status = 'pending'`)
          .first<{ n: number }>()
          .catch(() => null);
        if (pending && pending.n >= 500) return json({ ok: false, error: "Antrean penuh, coba lagi nanti." }, 429);

        const url = `https://videy.co/v/?id=${videoId}`;
        await d1
          .prepare(
            `insert into videy_suggestions (video_id, url, note, status, created_at)
             values (?, ?, ?, 'pending', ?)
             on conflict(video_id) do update set note = excluded.note, status = 'pending', created_at = excluded.created_at, decided_at = null`,
          )
          .bind(videoId, url, note, Date.now())
          .run()
          .catch(() => null);
        return json({ ok: true });
      },
      GET: async ({ request }) => {
        if (!(await isOwnerRequest(request))) return json({ ok: false, error: "forbidden" }, 403);
        const d1 = await db().catch(() => null);
        if (!d1) return json({ ok: false, error: "db_unavailable" }, 503);
        const { results } = await d1
          .prepare(
            `select id, video_id, url, note, status, created_at, decided_at
             from videy_suggestions order by created_at desc limit 200`,
          )
          .all();
        return json({ ok: true, items: results || [] });
      },
    },
  },
});
