"use client";

import { useState } from "react";

const SITE_ORIGIN = "https://koleksidrpinguin.com";

export type TopVideo = {
  id: string;
  path: string;
  views: number;
  unique?: number;
  title?: string;
  category?: string;
};

function fmt(n: number | null | undefined): string {
  return Math.max(0, Number(n) || 0).toLocaleString("id-ID");
}

function videoUrl(v: TopVideo): string {
  return `${SITE_ORIGIN}${v.path}`;
}

/** "Title\nhttps://koleksidrpinguin.com/watch/…" — falls back to id when title is missing. */
function entryText(v: TopVideo): string {
  const label = String(v.title || "").trim() || v.id;
  return `${label}\n${videoUrl(v)}`;
}

export function TopVideosSection({ videos }: { videos: TopVideo[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const total = videos.reduce((s, v) => s + v.views, 0);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  function allEntries() {
    return videos.map(entryText).join("\n\n");
  }

  async function copyLink(v: TopVideo) {
    const text = entryText(v);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(v.id);
      window.setTimeout(() => setCopied((c) => (c === v.id ? null : c)), 1500);
    } catch {
      window.prompt("Salin link:", text);
    }
  }

  async function copyAll() {
    const text = allEntries();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      window.prompt("Salin semua link:", text);
    }
  }

  async function shareAll() {
    if (!videos.length || !canShare) return;
    const entries = allEntries();
    const count = videos.length;
    const title = "Video terpopuler hari ini";
    const text =
      count === 1
        ? entries
        : `${count} video terpopuler hari ini:\n\n${entries}`;
    try {
      // No separate `url` field: links are already in `text`, and some share
      // targets append `url` to `text`, which would duplicate the first link.
      await navigator.share({ title, text });
    } catch (err) {
      // User cancel or share unsupported payload — fall back to copy
      if (err instanceof DOMException && err.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(entries);
        setCopiedAll(true);
        window.setTimeout(() => setCopiedAll(false), 1500);
      } catch {
        window.prompt("Salin semua link:", entries);
      }
    }
  }

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Video terpopuler hari ini (WIB)</h2>
        <div className="flex flex-wrap items-center gap-2">
          {videos.length ? (
            <span className="text-[11px] tabular-nums text-zinc-600">{fmt(total)} tayang video</span>
          ) : null}
          {videos.length ? (
            <>
              <button
                type="button"
                onClick={() => void copyAll()}
                className="rounded-md border border-white/[0.08] px-2 py-1 text-[11px] text-zinc-500 transition hover:text-zinc-200"
              >
                {copiedAll ? "Tersalin" : "Salin semua"}
              </button>
              {canShare ? (
                <button
                  type="button"
                  onClick={() => void shareAll()}
                  className="rounded-md border border-white/[0.08] px-2 py-1 text-[11px] text-zinc-500 transition hover:text-zinc-200"
                >
                  Bagikan
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      {videos.length ? (
        <ol className="mt-3 space-y-2 text-sm">
          {videos.map((v, i) => (
            <li key={v.id} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-right tabular-nums text-[11px] text-zinc-600">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <a
                  href={v.path}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-zinc-200 transition hover:text-emerald-300"
                  title={v.title || v.path}
                >
                  {v.title || v.id}
                </a>
                <span className="block truncate text-[11px] text-zinc-600">{v.path}</span>
              </div>
              <div className="shrink-0 text-right">
                <span className="block tabular-nums text-zinc-200">{fmt(v.views)}</span>
                {v.unique ? (
                  <span className="block text-[11px] tabular-nums text-zinc-600">{fmt(v.unique)} unik</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void copyLink(v)}
                className="shrink-0 rounded-md border border-white/[0.08] px-2 py-1 text-[11px] text-zinc-500 transition hover:text-zinc-200"
              >
                {copied === v.id ? "Tersalin" : "Salin"}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-xs text-zinc-600">Belum ada video yang ditonton hari ini.</p>
      )}
      <p className="mt-3 text-[11px] text-zinc-600">Hanya halaman /watch/… · urut tayang terbanyak · prioritas untuk di-share.</p>
    </section>
  );
}
