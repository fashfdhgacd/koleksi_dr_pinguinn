import { useCallback, useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { VideoPlayer } from "@/components/video/player";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCatalog } from "@/lib/catalog/client";
import type { VideoCard, VideoDetail } from "@/lib/catalog/types";

export const Route = createFileRoute("/watch/$id")({
  component: WatchPage,
});

function shareUrl(id: string): string {
  if (typeof window === "undefined") return `https://www.koleksidrpinguin.com/watch/${id}`;
  return `${window.location.origin}/watch/${id}`;
}

function sourceUrl(item: VideoDetail): string {
  return item.video_url || item.qualities[0]?.url || "";
}

async function shareVideo(title: string, id: string) {
  const url = shareUrl(id);
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
  } catch {
    /* user cancel */
  }
  try {
    await navigator.clipboard.writeText(url);
    alert("Link disalin.\n" + url);
  } catch {
    prompt("Salin link ini:", url);
  }
}

function WatchPage() {
  const { id } = Route.useParams();
  const [item, setItem] = useState<VideoDetail | null>(null);
  const [related, setRelated] = useState<VideoCard[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error" | "empty">("loading");
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const retry = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    setItem(null);
    setRelated([]);

    void (async () => {
      try {
        const res = await fetchCatalog({ type: "detail", id }, controller.signal);
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setError(res.error);
          setStatus(res.code === "not_found" ? "empty" : "error");
          return;
        }
        if (res.type !== "detail") {
          setError("Respons detail tidak valid.");
          setStatus("error");
          return;
        }
        setItem(res.item);
        setRelated(res.related.filter((video) => video.id !== res.item.id));
        setStatus("success");
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Gagal memuat video.");
        setStatus("error");
      }
    })();

    return () => controller.abort();
  }, [id, reload]);

  return (
    <Shell>
      {status === "loading" ? (
        <div className="space-y-8">
          <Skeleton className="aspect-video rounded-2xl" />
          <Skeleton className="h-10 w-2/3 rounded-md" />
          <Skeleton className="h-20 w-full rounded-md" />
          <VideoGridSkeleton count={6} />
        </div>
      ) : status === "error" ? (
        <ErrorState message={error ?? "Gagal memuat video."} onRetry={retry} />
      ) : status === "empty" || !item ? (
        <EmptyState title="Video tidak ditemukan" description="Judul ini tidak ada di katalog atau sudah dihapus." />
      ) : (
        <article className="space-y-10">
          <VideoPlayer item={item} />
          <header className="max-w-3xl space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
              {item.category}
              {item.year ? ` · ${item.year}` : ""}
            </p>
            <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl">{item.title}</h1>
            <div className="flex flex-wrap gap-3 text-sm text-muted">
              <span>{item.quality}</span>
              {item.creator ? <span>{item.creator}</span> : null}
            </div>
            <p className="text-sm leading-relaxed text-muted">{item.description}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                onClick={() => void shareVideo(item.title, item.id)}
              >
                Bagikan
              </button>
              <Link to="/" search={{ q: undefined, category: undefined }} className="rounded-md bg-secondary px-3 py-2 text-sm text-foreground">
                Kembali ke katalog
              </Link>
              {sourceUrl(item) ? (
                <a
                  href={sourceUrl(item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-secondary px-3 py-2 text-sm text-foreground"
                >
                  Buka sumber
                </a>
              ) : null}
            </div>
          </header>

          {related.length ? (
            <section>
              <h2 className="mb-5 font-display text-3xl text-foreground">Judul terkait</h2>
              <VideoGrid items={related} />
            </section>
          ) : null}
        </article>
      )}
    </Shell>
  );
}
