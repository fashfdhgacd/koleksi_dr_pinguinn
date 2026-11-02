import { useEffect, useState } from "react";
import type { VideoCard } from "@/lib/catalog/types";
import { VideoCard as VideoCardItem } from "./video-card";

/**
 * "Baru ditonton": the last 12 videos opened on this browser. localStorage only, never sent to
 * the server (no KV/D1 writes). Read after mount, so SSR/crawler HTML never contains it.
 */
const KEY = "drp:recent-watched";
const MAX = 12;

type StoredCard = Pick<VideoCard, "id" | "title" | "thumbnail" | "category" | "duration" | "durationLabel" | "quality" | "creator">;

function readStored(): StoredCard[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (v): v is StoredCard =>
          Boolean(v) && typeof v.id === "string" && v.id.length > 0 && typeof v.title === "string",
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

/** Called from the watch page once a video has loaded. Newest first, de-duplicated, max 12. */
export function rememberWatched(video: VideoCard): void {
  if (typeof window === "undefined" || !video?.id) return;
  try {
    const entry: StoredCard = {
      id: video.id,
      title: video.title,
      thumbnail: typeof video.thumbnail === "string" ? video.thumbnail : "",
      category: video.category,
      duration: video.duration,
      durationLabel: video.durationLabel,
      quality: video.quality,
      creator: video.creator,
    };
    const next = [entry, ...readStored().filter((v) => v.id !== video.id)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full / disabled (private mode): skip silently */
  }
}

export function RecentlyWatched() {
  const [items, setItems] = useState<VideoCard[]>([]);

  useEffect(() => {
    setItems(
      readStored().map((v) => ({
        ...v,
        description: "",
        year: null,
        views: null,
        likes: null,
        siteLikes: null,
      })),
    );
  }, []);

  if (!items.length) return null;

  function clear() {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setItems([]);
  }

  return (
    <section aria-labelledby="recent-watched-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="recent-watched-title" className="text-lg font-semibold tracking-tight text-zinc-100">
          Baru ditonton
        </h2>
        <button
          type="button"
          onClick={clear}
          className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
        >
          Hapus riwayat
        </button>
      </div>
      {/* One swipeable row (not a grid) so it never pushes the main feed far down. */}
      <ul className="-mx-1 flex snap-x gap-1 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {items.map((video) => (
          <li key={video.id} className="w-44 shrink-0 snap-start sm:w-56">
            <VideoCardItem video={video} />
          </li>
        ))}
      </ul>
    </section>
  );
}
