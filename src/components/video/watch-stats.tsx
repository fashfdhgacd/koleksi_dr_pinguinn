import { useEffect, useState } from "react";
import { Clock, Eye, Heart } from "lucide-react";
import { noteSiteLike } from "@/lib/live-likes";

function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(n);
}

const LS_PREFIX = "dp_like2_";

type LocalLike = { liked: boolean; count: number };

function readLocal(id: string): LocalLike | null {
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + id);
    if (!raw) return null;
    const v = JSON.parse(raw) as LocalLike;
    return typeof v?.liked === "boolean" ? v : null;
  } catch {
    return null;
  }
}

function writeLocal(id: string, v: LocalLike) {
  try {
    if (v.liked) window.localStorage.setItem(LS_PREFIX + id, JSON.stringify(v));
    else window.localStorage.removeItem(LS_PREFIX + id);
  } catch {
    /* ignore */
  }
}

/** Views / duration / likes row on the watch page. Heart = like button (KV-backed). */
export function WatchStats({
  id,
  views,
  durationLabel,
  sourceLikes,
}: {
  id: string;
  views?: number | null;
  durationLabel?: string | null;
  sourceLikes?: number | null;
}) {
  const base = typeof sourceLikes === "number" && sourceLikes > 0 ? sourceLikes : 0;
  const [ours, setOurs] = useState(0);
  const [liked, setLiked] = useState(false);
  const [pop, setPop] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const local = readLocal(id);
    setLiked(Boolean(local?.liked));
    setOurs(local?.count ?? 0);
    fetch(`/api/like?id=${encodeURIComponent(id)}`, { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count?: number } | null) => {
        if (!alive || !d || typeof d.count !== "number") return;
        // Edge GET may be ~15s stale right after our own POST; never show less than we know.
        const known = readLocal(id);
        setOurs(known?.liked ? Math.max(d.count, known.count) : d.count);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  async function toggle() {
    if (busy) return;
    const next = !liked;
    const optimistic = Math.max(0, ours + (next ? 1 : -1));
    setLiked(next);
    setOurs(optimistic);
    writeLocal(id, { liked: next, count: optimistic });
    noteSiteLike(id, optimistic);
    if (next) {
      setPop(true);
      window.setTimeout(() => setPop(false), 350);
    }
    setBusy(true);
    try {
      const r = await fetch("/api/like", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action: next ? "like" : "unlike" }),
      });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; count?: number } | null;
      if (d?.ok && typeof d.count === "number") {
        setOurs(d.count);
        writeLocal(id, { liked: next, count: d.count });
        noteSiteLike(id, d.count);
      }
    } catch {
      /* keep optimistic state */
    } finally {
      setBusy(false);
    }
  }

  const showViews = typeof views === "number" && views > 0;
  const showDuration = Boolean(durationLabel && durationLabel !== "\u2014");
  const total = base + ours;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 normal-case tracking-normal tabular-nums">
      {showViews ? (
        <span className="inline-flex items-center gap-1" aria-label={`${views} kali ditonton`}>
          <Eye className="size-3.5" aria-hidden="true" />
          {compactNumber(views as number)}
        </span>
      ) : null}
      {showDuration ? (
        <span className="inline-flex items-center gap-1" aria-label="Durasi">
          <Clock className="size-3.5" aria-hidden="true" />
          {durationLabel}
        </span>
      ) : null}
      <button
        type="button"
        onClick={toggle}
        aria-pressed={liked}
        aria-label={liked ? "Batal suka" : "Suka video ini"}
        className={`-my-1 inline-flex touch-manipulation items-center gap-1 rounded-full px-2 py-1 transition-colors ${
          liked ? "text-rose-400" : "hover:text-foreground"
        }`}
      >
        <Heart
          className={`size-4 transition-transform duration-300 ${liked ? "fill-current" : ""} ${pop ? "scale-125" : "scale-100"}`}
          aria-hidden="true"
        />
        {total > 0 ? compactNumber(total) : "Suka"}
      </button>
    </span>
  );
}
