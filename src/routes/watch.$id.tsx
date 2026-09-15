import { useCallback, useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { VideoPlayer } from "@/components/video/player";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCatalog } from "@/lib/catalog/client";
import { queryCatalog } from "@/lib/catalog/service";
import type { VideoCard, VideoDetail } from "@/lib/catalog/types";

const SITE_ORIGIN = "https://koleksidrpinguin.com";
const FALLBACK_OG = `${SITE_ORIGIN}/og.jpg`;

export const Route = createFileRoute("/watch/$id")({
  loader: async ({ params }) => {
    const id = (params.id || "").trim();
    if (!id) return { ok: false as const, error: "ID kosong", code: "bad_request" as const };
    return queryCatalog({ type: "detail", id });
  },
  head: ({ loaderData }) => {
    const ok = loaderData && loaderData.ok === true && loaderData.type === "detail";
    const item = ok ? loaderData.item : null;
    const title = item?.title ? `${item.title} | DR. PINGUIN` : "DR. PINGUIN";
    const description =
      item?.description?.trim() ||
      item?.title ||
      "Dr. Pinguin Bokep, M.S.B. Konten 18+. Koleksi video — masuk hanya jika dewasa.";
    const image = item?.thumbnail?.startsWith("http") ? item.thumbnail : FALLBACK_OG;
    const url = item ? `${SITE_ORIGIN}/watch/${item.id}` : SITE_ORIGIN;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "video.other" },
        { property: "og:site_name", content: "DR. PINGUIN" },
        { property: "og:title", content: item?.title || "DR. PINGUIN" },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: item?.title || "DR. PINGUIN" },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
        { name: "robots", content: "index,follow,max-video-preview:120" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: WatchPage,
});

function shareUrl(id: string): string {
  if (typeof window === "undefined") return `${SITE_ORIGIN}/watch/${id}`;
  return `${window.location.origin}/watch/${id}`;
}

function sourceUrl(item: VideoDetail): string {
  return item.video_url || item.qualities[0]?.url || "";
}

function xIntentUrl(title: string, url: string): string {
  const text = `${title}\n\n${url}`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

function ShareSheet({
  open,
  title,
  id,
  onClose,
}: {
  open: boolean;
  title: string;
  id: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = shareUrl(id);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Salin link ini:", url);
    }
  }

  async function nativeShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title, url, text: title });
        onClose();
      }
    } catch {
      /* user cancel */
    }
  }

  function shareToX() {
    window.open(xIntentUrl(title, url), "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Bagikan video"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-label="Tutup"
      />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-border bg-background p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Bagikan</p>
            <p className="mt-1 line-clamp-2 text-base font-medium text-foreground">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-sm text-muted hover:bg-secondary"
          >
            Tutup
          </button>
        </div>

        <div className="grid gap-3">
          <button
            type="button"
            onClick={shareToX}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#1d9bf0] px-4 text-base font-semibold text-white active:scale-[0.98]"
          >
            <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Bagikan ke X
          </button>

          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-base font-medium text-foreground active:scale-[0.98]"
          >
            {copied ? "✓ Link disalin" : "Salin link"}
          </button>

          {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
            <button
              type="button"
              onClick={() => void nativeShare()}
              className="flex h-14 w-full items-center justify-center rounded-xl border border-border px-4 text-base font-medium text-foreground active:scale-[0.98]"
            >
              Bagikan via sistem
            </button>
          ) : null}
        </div>

        <p className="mt-4 break-all text-center text-xs text-muted">{url}</p>
      </div>
    </div>
  );
}

function WatchPage() {
  const { id } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const [item, setItem] = useState<VideoDetail | null>(() =>
    loaderData && loaderData.ok && loaderData.type === "detail" ? loaderData.item : null,
  );
  const [related, setRelated] = useState<VideoCard[]>(() =>
    loaderData && loaderData.ok && loaderData.type === "detail"
      ? loaderData.related.filter((v) => v.id !== loaderData.item.id)
      : [],
  );
  const [status, setStatus] = useState<"loading" | "success" | "error" | "empty">(() => {
    if (!loaderData) return "loading";
    if (loaderData.ok && loaderData.type === "detail") return "success";
    if (!loaderData.ok && loaderData.code === "not_found") return "empty";
    return "error";
  });
  const [error, setError] = useState<string | null>(() =>
    loaderData && !loaderData.ok ? loaderData.error : null,
  );
  const [reload, setReload] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);

  const retry = useCallback(() => setReload((n) => n + 1), []);
  const closeShare = useCallback(() => setShareOpen(false), []);

  useEffect(() => {
    // Jika loader sudah sukses dan belum ada reload manual, skip client fetch
    if (reload === 0 && loaderData && loaderData.ok && loaderData.type === "detail") {
      return;
    }

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
  }, [id, reload, loaderData]);

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
                className="h-12 min-w-[140px] rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground active:scale-[0.98]"
                onClick={() => setShareOpen(true)}
              >
                Bagikan
              </button>
              <Link
                to="/"
                search={{ q: undefined, category: undefined }}
                className="flex h-12 items-center rounded-xl bg-secondary px-5 text-base text-foreground"
              >
                Kembali ke katalog
              </Link>
              {sourceUrl(item) ? (
                <a
                  href={sourceUrl(item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 items-center rounded-xl bg-secondary px-5 text-base text-foreground"
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

          <ShareSheet open={shareOpen} title={item.title} id={item.id} onClose={closeShare} />
        </article>
      )}
    </Shell>
  );
}
