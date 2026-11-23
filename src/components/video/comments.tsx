import { usePublicText } from "@/lib/public-ui";
import { useEffect, useState } from "react";

type Comment = {
  id: number;
  author: string;
  body: string;
  created_at: number;
};

const NAME_KEY = "kdp-comment-name";

function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

/**
 * Visitor comments under the watch page. Everything posted lands as 'pending'
 * in D1 and only shows here after owner approval in /pemilik — the section is
 * honest about that ("menunggu moderasi") instead of pretending it is live.
 * Fails soft: if the API/storage is unavailable the section shows nothing
 * rather than an error box.
 */
export function Comments({ videoId }: { videoId: string }) {
  const localText = usePublicText();
  const [items, setItems] = useState<Comment[] | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(NAME_KEY);
      if (saved) setName(saved);
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    let dead = false;
    fetch(`/api/comments?id=${encodeURIComponent(videoId)}`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; comments?: Comment[] }) => {
        if (!dead && j.ok) setItems(j.comments || []);
      })
      .catch(() => {
        if (!dead) setItems([]);
      });
    return () => {
      dead = true;
    };
  }, [videoId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: videoId, name: name.trim(), body: body.trim() }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (j.ok) {
        try {
          window.localStorage.setItem(NAME_KEY, name.trim());
        } catch {
          /* ignore */
        }
        setBody("");
        setNotice("Komentar terkirim — akan tampil setelah disetujui.");
      } else {
        setError(
          j.error === "limit"
            ? localText("Batas komentar harian tercapai, coba lagi besok.")
            : j.error === "captcha"
              ? localText("Verifikasi gagal, coba lagi.")
              : localText("Gagal mengirim, coba lagi."),
        );
      }
    } catch {
      setError(localText("Gagal mengirim, coba lagi."));
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-label={localText("Komentar")} className="space-y-4">
      <h2 className="font-display text-2xl text-foreground sm:text-3xl">
        {localText("Komentar")}{items && items.length ? ` (${items.length})` : ""}
      </h2>

      {items === null ? null : items.length === 0 ? (
        <p className="text-sm text-muted">{localText("Belum ada komentar. Jadilah yang pertama.")}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{c.author}</span>
                <time className="shrink-0 text-xs text-muted" dateTime={new Date(c.created_at).toISOString()}>
                  {fmtDate(c.created_at)}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={localText("Nama")}
          maxLength={40}
          required
          autoComplete="nickname"
          className="h-10 w-full rounded-md border border-white/15 bg-black/40 px-3 text-sm text-foreground placeholder:text-muted focus:border-white/50 focus:outline-none"
          aria-label={localText("Nama")}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={localText("Tulis komentar…")}
          maxLength={1000}
          required
          rows={3}
          className="w-full resize-y rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-white/50 focus:outline-none"
          aria-label={localText("Komentar")}
        />
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        {notice ? <p className="text-xs text-emerald-400">{notice}</p> : null}
        <button
          type="submit"
          disabled={sending || !name.trim() || !body.trim()}
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {sending ? localText("Mengirim…") : localText("Kirim komentar")}
        </button>
      </form>
    </section>
  );
}
