import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { VideoPlayer } from "@/components/video/player";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCatalog } from "@/lib/catalog/client";
import { queryCatalog } from "@/lib/catalog/service";
import type { VideoCard, VideoDetail } from "@/lib/catalog/types";
import {
  DEFAULT_OG,
  SITE_ORIGIN,
  videoJsonLd,
  videoSeoDescription,
  videoSeoTitle,
} from "@/lib/seo";
import { watchDescription } from "@/lib/catalog/watch-description";
import { CatalogBackLink } from "@/components/video/catalog-back-link";

const SHARE_CARD_VERSION = "11";

export const Route = createFileRoute("/watch/$id")({
  loader: async ({ params }) => {
    const id = (params.id || "").trim();
    if (!id) return { ok: false as const, error: "ID kosong", code: "bad_request" as const };
    return queryCatalog({ type: "detail", id });
  },
  head: ({ loaderData }) => {
    const ok = loaderData && loaderData.ok === true && loaderData.type === "detail";
    const item = ok ? loaderData.item : null;
    const title = item ? videoSeoTitle(item.title, item.category) : "Dr. Pinguin — Bokep Indo";
    const description = item
      ? item.description?.trim()?.length > 40
        ? item.description.trim().slice(0, 160)
        : videoSeoDescription(item.title, item.category, { creator: item.creator })
      : "Koleksi bokep Indo Dr. Pinguin. Konten 18+.";
    const image = item
      ? `${SITE_ORIGIN}/api/og?id=${encodeURIComponent(item.id)}&v=${SHARE_CARD_VERSION}`
      : DEFAULT_OG;
    const url = item ? `${SITE_ORIGIN}/watch/${item.id}` : SITE_ORIGIN;
    const embedUrl = item
      ? (item.video_url || item.qualities?.[0]?.url || "").trim() || null
      : null;
    const contentUrl =
      embedUrl && /\.(mp4|webm|mov)($|\?)/i.test(embedUrl) ? embedUrl : null;
    const jsonLd = item
      ? videoJsonLd({
          id: item.id,
          title: item.title,
          description,
          thumbnail: item.thumbnail,
          category: item.category,
          embedUrl: contentUrl ? null : embedUrl,
          contentUrl,
          durationSec: item.duration,
        })
      : null;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        {
          name: "keywords",
          content: `bokep indo, ${item?.category || "viral"}, ${item?.title || "bokep terbaru"}, dr pinguin`,
        },
        { property: "og:type", content: "video.other" },
        { property: "og:site_name", content: "DR. PINGUIN" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { property: "og:image:type", content: "image/jpeg" },
        { property: "og:image:width", content: "1280" },
        { property: "og:image:height", content: "720" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
        { name: "twitter:image:alt", content: "DR. PINGUIN" },
        { name: "robots", content: "index,follow,max-video-preview:120" },
        { name: "rating", content: "adult" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: jsonLd
        ? [{ type: "application/ld+json", children: JSON.stringify(jsonLd) }]
        : [],
    };
  },
  component: WatchPage,
});

function cleanWatchUrl(id: string): string {
  if (typeof window === "undefined") return `${SITE_ORIGIN}/watch/${id}`;
  return `${window.location.origin}/watch/${id}`;
}

function shareUrl(id: string): string {
  return `${cleanWatchUrl(id)}?v=${SHARE_CARD_VERSION}`;
}

function xIntentUrl(title: string, url: string): string {
  const text = `${title}\n\n${url}`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

function catalogPlayUrl(item: VideoDetail): string {
  const raw = [item.video_url, ...item.qualities.map((q) => q.url)].filter((u): u is string => Boolean(u));
  const indo = raw.find((u) => /indoav/i.test(u));
  const src = (indo || raw[0] || "").trim();
  try {
    const u = new URL(src);
    u.pathname = u.pathname.replace(/\/(?:v|d|watch)\//, "/e/");
    return u.toString();
  } catch {
    return src;
  }
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
      <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Tutup" />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-border bg-background p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Bagikan</p>
            <p className="mt-1 line-clamp-2 text-base font-medium text-foreground">{title}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-md px-2 py-1 text-sm text-muted hover:bg-secondary">
            Tutup
          </button>
        </div>
        <div className="grid gap-3">
          <button
            type="button"
            onClick={shareToX}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#1d9bf0] px-4 text-base font-semibold text-white active:scale-[0.98]"
          >
            Bagikan ke X
          </button>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-base font-medium text-foreground active:scale-[0.98]"
          >
            {copied ? "\u2713 Link disalin" : "Salin link"}
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
    setShareOpen(false);
    if (reload === 0 && loaderData) {
      if (loaderData.ok && loaderData.type === "detail") {
        if (loaderData.item.id === id) {
          setItem(loaderData.item);
          setRelated(loaderData.related.filter((v) => v.id !== loaderData.item.id));
          setStatus("success");
          setError(null);
          return;
        }
      } else if (!loaderData.ok && loaderData.code === "not_found") {
        setItem(null);
        setRelated([]);
        setStatus("empty");
        setError(loaderData.error);
        return;
      }
    }

    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    setItem((prev) => (prev && prev.id === id ? prev : null));

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

  useEffect(() => {
    if (status !== "success" || !id) return;
    const SLOT = 5 * 60 * 1000;
    let tid = 0;
    let cancelled = false;
    const arm = () => {
      const wait = Math.max(2500, SLOT - (Date.now() % SLOT) + 120);
      tid = window.setTimeout(() => {
        void (async () => {
          try {
            const res = await fetchCatalog({ type: "related", id, limit: 12 });
            if (cancelled || !res.ok || res.type !== "related") return;
            setRelated(res.items.filter((v) => v.id !== id));
          } catch {
            /* biarkan list lama */
          } finally {
            if (!cancelled) arm();
          }
        })();
      }, wait);
    };
    arm();
    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [id, status]);

  const softLoading = status === "loading" && related.length > 0;
  const coldLoading = status === "loading" && related.length === 0;

  return (
    <Shell>
      {coldLoading ? (
        <div className="space-y-8">
          <Skeleton className="aspect-video rounded-2xl" />
          <Skeleton className="h-10 w-2/3 rounded-md" />
          <Skeleton className="h-20 w-full rounded-md" />
          <VideoGridSkeleton count={6} />
        </div>
      ) : status === "error" && !item ? (
        <ErrorState message={error ?? "Gagal memuat video."} onRetry={retry} />
      ) : status === "empty" || (!item && !softLoading) ? (
        <EmptyState title="Video tidak ditemukan" description="Judul ini tidak ada di katalog atau sudah dihapus." />
      ) : (
        <article className="space-y-8">
          {item ? (
            <>
          <div className="-mx-4 bg-background px-4 py-2 sm:mx-0 sm:px-0">
            <VideoPlayer key={item.id} item={item} />
            {(() => {
              const src = catalogPlayUrl(item);
              if (!src || /\.(mp4|webm|mov)($|\?)/i.test(src)) return null;
              return (
                <noscript>
                  <iframe
                    src={src}
                    title={item.title}
                    width="640"
                    height="360"
                    allowFullScreen
                  />
                </noscript>
              );
            })()}
          </div>
          <header className="max-w-3xl space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
              {item.category}
              {item.year ? ` \u00b7 ${item.year}` : ""}
              {item.creator ? ` \u00b7 ${item.creator}` : ""}
            </p>
            <h1 className="font-display text-3xl leading-tight text-foreground sm:text-5xl">{item.title}</h1>
            <p className="text-sm leading-relaxed text-muted">{watchDescription(item)}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="h-12 min-w-[140px] rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground active:scale-[0.98]"
                onClick={() => setShareOpen(true)}
              >
                Bagikan
              </button>
              <button
                type="button"
                className="h-12 min-w-[140px] rounded-xl bg-secondary px-5 text-base font-medium text-foreground active:scale-[0.98] disabled:opacity-50"
                disabled={!catalogPlayUrl(item)}
                onClick={() => {
                  const src = catalogPlayUrl(item);
                  if (src) window.open(src, "_blank", "noopener,noreferrer");
                }}
              >
                Buka Sumber
              </button>
              <CatalogBackLink item={item} />
            </div>
          </header>
            </>
          ) : (
            <div className="space-y-8">
              <Skeleton className="aspect-video rounded-2xl" />
              <Skeleton className="h-10 w-2/3 rounded-md" />
              <Skeleton className="h-20 w-full rounded-md" />
            </div>
          )}
          {related.length ? (
            <section>
              <h2 className="mb-5 font-display text-3xl text-foreground">Tonton juga</h2>
              <VideoGrid items={related} eagerCount={0} />
            </section>
          ) : item ? null : (
            <VideoGridSkeleton count={6} />
          )}
          {item ? (
            <ShareSheet open={shareOpen} title={item.title} id={item.id} onClose={closeShare} />
          ) : null}
        </article>
      )}
    </Shell>
  );
}
