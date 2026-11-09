"use client";

import { useCallback, useEffect, useState } from "react";

type AdminComment = {
  id: number;
  video_id: string;
  video_title: string;
  author: string;
  body: string;
  status: string;
  created_at: number;
};

const FILTERS = [
  { key: "pending", label: "Menunggu" },
  { key: "approved", label: "Disetujui" },
  { key: "hidden", label: "Disembunyikan" },
  { key: "all", label: "Semua" },
] as const;

function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Comment moderation for /pemilik: approve / hide / delete rows in D1. */
export function OwnerComments({ secret }: { secret: string }) {
  const [status, setStatus] = useState<string>("pending");
  const [items, setItems] = useState<AdminComment[] | null>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await fetch(`/api/comments-admin?status=${status}&limit=100`, {
        headers: { "x-online-key": secret },
        cache: "no-store",
      });
      const j = (await r.json()) as { ok?: boolean; comments?: AdminComment[]; pending?: number; error?: string };
      if (j.ok) setItems(j.comments || []);
      else setError(j.error === "unauthorized" ? "Kunci owner salah" : "Gagal memuat komentar");
    } catch {
      setError("Gagal memuat komentar");
    }
  }, [secret, status]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  async function act(action: string, id: number) {
    if (busy) return;
    setBusy(id);
    setError("");
    try {
      const r = await fetch("/api/comments-admin", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action, id }),
      });
      const j = (await r.json()) as { ok?: boolean };
      if (j.ok) {
        await load();
        // Let the Ringkasan preview and the "Perlu dicek" badge refresh without polling.
        window.dispatchEvent(new Event("drp-comments-changed"));
      } else setError("Aksi gagal");
    } catch {
      setError("Aksi gagal");
    } finally {
      setBusy(0);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatus(f.key)}
            className={`rounded-full border px-3 py-1 text-xs ${
              status === f.key
                ? "border-zinc-200 bg-zinc-200 text-zinc-900"
                : "border-white/15 text-zinc-300 hover:border-white/40"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      {items === null ? (
        <p className="text-xs text-zinc-500">Memuat…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-zinc-500">Tidak ada komentar.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className="rounded-lg border border-white/[0.08] bg-black/30 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium text-zinc-100">
                  {c.author}
                  <span className="ml-2 font-normal text-zinc-500">{fmtDate(c.created_at)}</span>
                </p>
                <p className="max-w-full truncate text-[11px] text-zinc-500" title={c.video_title}>
                  {c.video_title || c.video_id}
                </p>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-300">{c.body}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.status !== "approved" ? (
                  <button
                    type="button"
                    disabled={busy === c.id}
                    onClick={() => void act("approve", c.id)}
                    className="rounded-md border border-emerald-400/40 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-40"
                  >
                    Setujui
                  </button>
                ) : null}
                {c.status !== "hidden" ? (
                  <button
                    type="button"
                    disabled={busy === c.id}
                    onClick={() => void act("hide", c.id)}
                    className="rounded-md border border-amber-400/40 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-400/10 disabled:opacity-40"
                  >
                    Sembunyikan
                  </button>
                ) : null}
                {c.status !== "pending" ? (
                  <button
                    type="button"
                    disabled={busy === c.id}
                    onClick={() => void act("restore", c.id)}
                    className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                  >
                    Kembalikan
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy === c.id}
                  onClick={() => void act("delete", c.id)}
                  className="rounded-md border border-red-400/40 px-2.5 py-1 text-xs text-red-300 hover:bg-red-400/10 disabled:opacity-40"
                >
                  Hapus
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Ringkasan teaser: the 3 newest pending comments with a jump into the moderation
 * collapse. Hidden entirely when nothing waits, so an empty queue costs no space.
 * Refreshes on mount and whenever a moderation action fires drp-comments-changed.
 */
export function OwnerCommentsPreview({ secret, onOpen }: { secret: string; onOpen: () => void }) {
  const [items, setItems] = useState<AdminComment[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/comments-admin?status=pending&limit=3", {
        headers: { "x-online-key": secret },
        cache: "no-store",
      });
      const j = (await r.json()) as { ok?: boolean; comments?: AdminComment[] };
      setItems(j.ok ? j.comments || [] : []);
    } catch {
      setItems([]);
    }
  }, [secret]);

  useEffect(() => {
    void load();
    window.addEventListener("drp-comments-changed", load);
    return () => window.removeEventListener("drp-comments-changed", load);
  }, [load]);

  if (!items || items.length === 0) return null;
  return (
    <div className="rounded-xl border border-[#2dd4bf]/25 bg-[#2dd4bf]/[0.06] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[#5eead4]">
          {items.length >= 3 ? "3+" : items.length} komentar menunggu
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="text-xs font-medium text-[#5eead4] hover:underline"
        >
          Buka moderasi ›
        </button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((c) => (
          <li key={c.id} className="truncate text-[13px] text-zinc-300">
            <span className="font-medium text-zinc-100">{c.author}</span>
            <span className="text-zinc-500"> · {fmtDate(c.created_at)} · </span>
            {c.body}
          </li>
        ))}
      </ul>
    </div>
  );
}
