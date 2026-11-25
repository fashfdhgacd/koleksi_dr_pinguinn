import { usePublicLanguage } from "@/lib/public-ui";
import { collectionLabel } from "@/lib/page-copy";
import { usePublicHref, usePublicText } from "@/lib/public-ui";
import { useCallback, useEffect, useState } from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { Comments } from "@/components/video/comments";
import { VideoPlayer } from "@/components/video/player";
import { PosterIdContext } from "@/components/video/thumb";
import { VideyPlayer } from "@/components/video/videy-player";
import { PopTapLayer } from "@/components/tap-popunder";
import { AdblockGate } from "@/components/adblock-gate";
import { hostLabel } from "@/lib/catalog/embed";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCatalog } from "@/lib/catalog/client";
import type { VideoCard, VideoDetail } from "@/lib/catalog/types";
import { cleanDisplayTitle, editorialWatchDescription, withoutDomainSuffix } from "@/lib/seo";
import { shareIntentUrls, videoShareUrl } from "@/lib/share-url";
import { landingForCategory } from "@/lib/catalog/landing";
import { isSeoBlockedId } from "@/lib/catalog/seo-block";
import { categorySlugFor } from "@/lib/catalog/category-seo";
import { CatalogBackLink } from "@/components/video/catalog-back-link";
import { WatchStats } from "@/components/video/watch-stats";
import { PushButton } from "@/components/video/push-button";
import { ReportSheet } from "@/components/report-sheet";
import { rememberWatched } from "@/components/video/recently-watched";
import { DRP_CATEGORY, DRP_SOURCES, drpKindOfUrl } from "@/lib/catalog/drp-hosts.js";
import deadSources from "@/lib/catalog/dead-sources.json";

const routeApi = getRouteApi("/watch/$id");
function shareUrl(id: string): string {
  return videoShareUrl(id);
}

const VIDEY_LABEL = "drpinguin videy";

/** Videy plays in VideyPlayer (own HTML5 player) and has no "Buka Sumber". Only Videy is adblock-gated. */
function isVideyItem(item: VideoDetail): boolean {
  return item.creator === "Videy" || item.category === "videy";
}

const DRP_LABELS = new Set<string>(Object.values(DRP_SOURCES));

/**
 * Koleksi Dr. Pinguin Bokep (owner's own Byse / DoodStream / LuluStream uploads) has no "Buka Sumber"
 * either: category "bokep", bot ids lu- / dd- / by-, or an embed on one of those hosts.
 */
function isDrpHostItem(item: VideoDetail): boolean {
  if (item.category === DRP_CATEGORY) return true;
  if (/^(?:by|lu|dd)-/i.test(String(item.id || ""))) return true;
  if (DRP_LABELS.has(String(item.creator || ""))) return true;
  return [item.video_url, ...item.qualities.map((q) => q.url)].some((u) => Boolean(u && drpKindOfUrl(u)));
}

type Server = NonNullable<VideoDetail["servers"]>[number];

const GONE_IDS = new Set(Object.keys((deadSources as { gone?: Record<string, unknown> }).gone || {}));

/**
 * Multi-server: the server to play. `?s=` when it is one of this page's servers, else the main
 * copy unless its source is gone (dead-sources.json), else the first live server in order.
 */
function pickServer(item: VideoDetail, wanted: string | undefined): Server | null {
  const list = item.servers;
  if (!list || list.length < 2) return null;
  const asked = wanted ? list.find((sv) => sv.id === wanted) : undefined;
  if (asked) return asked;
  const main = list.find((sv) => sv.id === item.id);
  if (main && !GONE_IDS.has(main.id)) return main;
  return list.find((sv) => !GONE_IDS.has(sv.id)) || main || list[0];
}

/**
 * The item handed to the player for one server: same page data, that copy's id and embed. The
 * player keys logging, the dead-source notice and "coba server lain" on this id; the iframe URL is
 * exactly the one that copy plays on its own.
 */
function itemForServer(item: VideoDetail, server: Server | null): VideoDetail {
  if (!server || server.id === item.id) return item;
  return {
    ...item,
    id: server.id,
    video_url: server.url,
    qualities: [{ label: item.quality, url: server.url, format: "embed" }],
    playable: true,
  };
}

/** Server buttons under the player (outside it). Plain links: ?s=<copy id>, the main copy without. */
function ServerButtons({ item, current }: { item: VideoDetail; current: string }) {
  const localText = usePublicText();
  const list = item.servers || [];
  if (list.length < 2) return null;
  const seen = new Map<string, number>();
  return (
    <nav aria-label={localText("Pilih server")} className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Server</span>
      {list.map((sv) => {
        const n = (seen.get(sv.host) || 0) + 1;
        seen.set(sv.host, n);
        const label = n > 1 ? `${sv.host} ${n}` : sv.host;
        const active = sv.id === current;
        const gone = GONE_IDS.has(sv.id);
        return (
          <Link
            key={sv.id}
            to="/watch/$id"
            params={{ id: item.id }}
            search={sv.id === item.id ? {} : { s: sv.id }}
            replace
            resetScroll={false}
            // Exact search match: the main copy's link (no ?s) is not "active" while ?s=<copy> plays.
            activeOptions={{ exact: true, includeSearch: true }}
            aria-current={active ? "true" : undefined}
            title={gone ? `${label} (${localText("sumber sudah tidak tersedia")})` : label}
            className={
              "inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium " +
              (active
                ? "border-[#2dd4bf] bg-[#2dd4bf] text-[#09090b]"
                : "border-white/20 bg-white/5 text-white/90 hover:border-[#2dd4bf] hover:text-[#2dd4bf]") +
              (gone ? " line-through opacity-60" : "")
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
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
  const publicHref = usePublicHref();
  const localText = usePublicText();
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
      prompt(localText("Salin link ini:"), url);
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

  const intents = shareIntentUrls(title, url);

  const btn =
    "flex h-12 w-full items-center justify-center rounded-xl px-4 text-base font-semibold active:scale-[0.98]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={localText("Bagikan video")}
    >
      <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label={localText("Tutup")} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-border bg-background p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">{localText("Bagikan")}</p>
            <p className="mt-1 line-clamp-2 text-base font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs text-muted">{localText("Link anti blokir / tanpa VPN")}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-md px-2 py-1 text-sm text-muted hover:bg-secondary">
            {localText("Tutup")}
          </button>
        </div>
        <div className="grid gap-2">
          <a
            href={publicHref(intents.telegram)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className={btn + " bg-[#2AABEE] text-white"}
          >
            Telegram
          </a>
          <a
            href={publicHref(intents.x)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className={btn + " bg-[#1d9bf0] text-white"}
          >
            X
          </a>
          <a
            href={publicHref(intents.reddit)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className={btn + " bg-[#FF4500] text-white"}
          >
            Reddit
          </a>
          <button
            type="button"
            onClick={() => void copyLink()}
            className={btn + " bg-secondary font-medium text-foreground"}
          >
            {copied ? "✓ " + localText("Link disalin") : localText("Salin link")}
          </button>
          {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
            <button
              type="button"
              onClick={() => void nativeShare()}
              className={btn + " border border-border font-medium text-foreground"}
            >
              {localText("Bagikan via sistem")}
            </button>
          ) : null}
        </div>
        <p className="mt-4 break-all text-center text-xs text-muted">{url}</p>
        {intents.whatsapp ? (
          <p className="mt-2 text-center text-[11px] text-muted">
            <a href={publicHref(intents.whatsapp)} target="_blank" rel="noopener noreferrer" onClick={onClose} className="underline-offset-2 hover:underline">
              WhatsApp
            </a>
            <span> {localText("(link anti blokir)")}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Tanggal unggah yang bisa dibaca (id-ID, WIB). Kosong kalau tidak valid. */
function uploadDateLabel(raw: string | number | null | undefined, locale: string): string {
  if (raw == null || raw === "") return "";
  const d = new Date(typeof raw === "number" && raw < 1e12 ? raw * 1000 : raw);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2015) return "";
  return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
}

/** Fakta singkat per video (durasi, tanggal, sumber). Kategori sudah tampil sebagai chip di atasnya. */
function VideoFacts({ item }: { item: VideoDetail }) {
  const localText = usePublicText();
  const locale = usePublicLanguage();
  const date = uploadDateLabel(item.uploadDate, locale);
  const host = isVideyItem(item) || isDrpHostItem(item) ? "" : hostLabel(catalogPlayUrl(item)).replace("Puterin", "Putarin");
  const rows: Array<[string, string]> = [];
  if (item.durationLabel) rows.push([localText("Durasi"), item.durationLabel]);
  if (date) rows.push([localText("Diunggah"), date]);
  if (host) rows.push([localText("Sumber"), host]);
  if (!rows.length) return null;
  return (
    <section aria-label={localText("Info video")} className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Info</p>
      <dl className="flex flex-wrap gap-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4">
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function WatchPage() {
  const language = usePublicLanguage();
  const publicHref = usePublicHref();
  const localText = usePublicText();
  const { id } = routeApi.useParams();
  const { s: wantedServer } = routeApi.useSearch();
  const loaderData = routeApi.useLoaderData();
  const [item, setItem] = useState<VideoDetail | null>(() =>
    loaderData && loaderData.ok && loaderData.type === "detail" ? loaderData.item : null,
  );
  const [related, setRelated] = useState<VideoCard[]>(() =>
    loaderData && loaderData.ok && loaderData.type === "detail"
      ? loaderData.related.filter((v: VideoCard) => v.id !== loaderData.item.id && !isSeoBlockedId(v.id))
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
  const [reportOpen, setReportOpen] = useState(false);

  const retry = useCallback(() => setReload((n) => n + 1), []);
  const closeShare = useCallback(() => setShareOpen(false), []);
  const closeReport = useCallback(() => setReportOpen(false), []);

  useEffect(() => {
    setShareOpen(false);
    if (reload === 0 && loaderData) {
      if (loaderData.ok && loaderData.type === "detail") {
        if (loaderData.item.id === id) {
          setItem(loaderData.item);
          setRelated(loaderData.related.filter((v: VideoCard) => v.id !== loaderData.item.id && !isSeoBlockedId(v.id)));
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
        setRelated(res.related.filter((video) => video.id !== res.item.id && !isSeoBlockedId(video.id)));
        setStatus("success");
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Gagal memuat video.");
        setStatus("error");
      }
    })();

    return () => controller.abort();
  }, [id, reload, loaderData]);

  // "Baru ditonton" row on home (browser-only localStorage).
  useEffect(() => {
    if (status === "success" && item && item.id === id) rememberWatched(item);
  }, [status, item, id]);

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
            setRelated(res.items.filter((v) => v.id !== id && !isSeoBlockedId(v.id)));
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

  const category = item?.category?.trim();
  const description = item && (editorialWatchDescription(item) || (category
    ? localText("Bagian dari koleksi {category} di Dr. Pinguin.").replace("{category}", () => localText(category))
    : localText("Video dari koleksi Dr. Pinguin.")));
  const softLoading = status === "loading" && related.length > 0;
  const coldLoading = status === "loading" && related.length === 0;

  return (
    <Shell>
      {coldLoading ? (
        <div className="space-y-8">
          <Skeleton className="aspect-video rounded-none" />
          <Skeleton className="h-10 w-2/3 rounded-md" />
          <Skeleton className="h-20 w-full rounded-md" />
          <VideoGridSkeleton count={6} />
        </div>
      ) : status === "error" && !item ? (
        <ErrorState message={error ?? "Gagal memuat video."} onRetry={retry} />
      ) : status === "empty" || (!item && !softLoading) ? (
        <EmptyState title={localText("Video tidak ditemukan")} description={localText("Judul ini tidak ada di katalog atau sudah dihapus.")} />
      ) : (
        <article className="space-y-3 sm:space-y-8" onContextMenu={(e) => e.preventDefault()}>
          {item ? (() => {
            const server = pickServer(item, wantedServer);
            const playItem = itemForServer(item, server);
            return (
            <>
          <div className="-mx-4 bg-background px-4 py-2 sm:mx-0 sm:px-0 [&_.overflow-hidden:has(>_.aspect-video)]:rounded-none [&_.aspect-video.overflow-hidden]:rounded-none [&_.inset-0.z-20]:rounded-none">
            {isVideyItem(item) ? (
              <AdblockGate key={`gate-${item.id}`} videoId={item.id}>
                <VideyPlayer key={item.id} item={item} />
              </AdblockGate>
            ) : hostLabel(catalogPlayUrl(playItem)) === "IndoAV" ? (
              // IndoAV: never gated (host ads + IndoAV view bonus).
              <div className="relative">
                <VideoPlayer key={playItem.id} item={playItem} />
                <PopTapLayer key={`pop-${item.id}`} videoId={item.id} host="IndoAV" />
              </div>
            ) : (
              // Other hosts (UserBokep, Putarin/Jav, Streamtape, ...): no adblock gate, only Videy is gated.
              <div className="relative">
                {/* Player poster = the card's cached poster (R2 / /thumb), so a down image host
                    (img.lulucdn.com) no longer turns it into the penguin. Iframe URLs unchanged. */}
                <PosterIdContext.Provider value={item.id}>
                  <VideoPlayer key={playItem.id} item={playItem} />
                </PosterIdContext.Provider>
                <PopTapLayer key={`pop-${item.id}`} videoId={item.id} host={hostLabel(catalogPlayUrl(playItem)).replace("Puterin", "Putarin")} />
              </div>
            )}
            {server ? <ServerButtons item={item} current={server.id} /> : null}
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
          <header className="max-w-3xl space-y-2 sm:space-y-3">
            <h1 className="break-words font-display text-2xl leading-tight text-foreground sm:text-5xl">{cleanDisplayTitle(withoutDomainSuffix(item.title))}</h1>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
              {isVideyItem(item) ? (
                <a href={publicHref("/kategori/videy")} className="hover:text-foreground hover:underline">
                  {VIDEY_LABEL}
                </a>
              ) : (() => {
                const slug = categorySlugFor(item.category);
                return slug ? (
                  <a href={publicHref(`/kategori/${slug}`)} className="hover:text-foreground hover:underline">
                    {localText(item.category || "")}
                  </a>
                ) : (
                  item.category
                );
              })()}
              {item.year ? ` \u00b7 ${item.year}` : ""}
              {item.creator && !isVideyItem(item) ? ` \u00b7 ${item.creator}` : ""}
              <span className="ml-3 align-middle text-muted">
                <WatchStats
                  id={item.id}
                  views={item.views}
                  durationLabel={item.durationLabel}
                  sourceLikes={item.likes}
                />
              </span>
            </p>
            {item.episodes && item.episodes.length > 1 ? <EpisodeStrip episodes={item.episodes} currentId={item.id} /> : null}
            {description && <p className="text-sm leading-relaxed text-muted">{description}</p>}
            <nav aria-label={localText("Kategori dan pencarian")} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {(() => {
                const slug = categorySlugFor(item.category);
                const landing = slug ? landingForCategory(slug) : undefined;
                return (
                  <>
                    {slug ? (
                      <a href={publicHref(`/kategori/${slug}`)} className="underline underline-offset-2 hover:text-foreground">
                        {localText("Kategori")} {localText(item.category || "")}
                      </a>
                    ) : null}
                    <a href={publicHref(landing ? `/cari/${landing.slug}` : "/cari")} className="underline underline-offset-2 hover:text-foreground">
                      {landing ? (language === "id" ? landing.h1 : collectionLabel(landing.slug, language)) : localText("Pencarian populer")}
                    </a>
                  </>
                );
              })()}
            </nav>
            <PushButton />
            {item.categories && item.categories.length ? (
              <nav aria-label={localText("Kategori")} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">{localText("Kategori")}</p>
                <ul className="flex flex-wrap gap-2">
                  {item.categories.map((c) => (
                    <li key={c.slug}>
                      <a
                        href={publicHref(`/kategori/${c.slug}`)}
                        className="inline-flex h-10 items-center rounded-full bg-secondary px-4 text-sm font-medium text-foreground hover:bg-primary hover:text-primary-foreground"
                      >
                        {localText(c.label)}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
            {item.sameCategory && item.sameCategory.length ? (
              <nav aria-label={localText("Video lain di kategori ini")} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                  {localText("Lainnya di")} {localText(item.category || "kategori ini")}
                </p>
                <ul className="space-y-1 text-sm">
                  {item.sameCategory.filter((v) => !isSeoBlockedId(v.id)).map((v) => (
                    <li key={v.id}>
                      <a href={publicHref(`/watch/${v.id}`)} className="text-foreground/80 underline-offset-2 hover:text-primary hover:underline">
                        {cleanDisplayTitle(v.title)}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
            <VideoFacts item={playItem} />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="h-12 min-w-[140px] rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground active:scale-[0.98]"
                onClick={() => setShareOpen(true)}
              >
                {localText("Bagikan")}
              </button>
              {isVideyItem(playItem) || isDrpHostItem(playItem) ? null : <button
                type="button"
                className="h-12 min-w-[140px] rounded-xl bg-secondary px-5 text-base font-medium text-foreground active:scale-[0.98] disabled:opacity-50"
                disabled={!catalogPlayUrl(playItem)}
                onClick={() => {
                  const src = catalogPlayUrl(playItem);
                  if (src) window.open(src, "_blank", "noopener"); // keep referrer so hoster sees koleksidrpinguin.com
                }}
              >
                {localText("Buka Sumber")}
              </button>}
              <CatalogBackLink item={item} />
              <a href={publicHref("/#terbaru")} className="inline-flex min-h-12 items-center rounded-xl px-4 text-base font-medium text-teal-300 underline-offset-2 hover:underline">
                {localText("Lihat unggahan terbaru")}
              </a>
              <button
                type="button"
                className="h-12 min-w-[120px] rounded-xl border border-border px-5 text-base font-medium text-muted active:scale-[0.98]"
                onClick={() => setReportOpen(true)}
              >
                {localText("Laporkan")}
              </button>
            </div>
          </header>
            </>
            );
          })() : (
            <div className="space-y-8">
              <Skeleton className="aspect-video rounded-none" />
              <Skeleton className="h-10 w-2/3 rounded-md" />
              <Skeleton className="h-20 w-full rounded-md" />
            </div>
          )}
          {related.length ? (
            <section>
              <h2 className="mb-5 font-display text-3xl text-foreground">{localText("Tonton juga")}</h2>
              <VideoGrid items={related} eagerCount={0} />
            </section>
          ) : item ? null : (
            <VideoGridSkeleton count={6} />
          )}
          {item ? <Comments videoId={item.id} /> : null}
          {item ? (
            <ShareSheet open={shareOpen} title={item.title} id={item.id} onClose={closeShare} />
          ) : null}
          {item ? (
            <ReportSheet open={reportOpen} videoId={item.id} title={item.title} onClose={closeReport} />
          ) : null}
        </article>
      )}
    </Shell>
  );
}

/** Compact episode buttons under the title (series only): plain links, no thumbnails, no requests. */
const EP_ACCENT = "#2dd4bf"; // site teal accent (bg-primary is gray in this theme)
const EP_WINDOW = 24;

function EpisodeLink({ id, ep, label, current }: { id: string; ep: number; label?: string; current: boolean }) {
  const publicHref = usePublicHref();
  return (
    <a
      href={publicHref(`/watch/${id}`)}
      aria-current={current ? "page" : undefined}
      style={current ? { backgroundColor: EP_ACCENT, borderColor: EP_ACCENT, color: "#09090b" } : undefined}
      className={
        "inline-flex h-10 w-[112px] shrink-0 items-center justify-center whitespace-nowrap rounded-md border px-2 text-center text-sm tabular-nums sm:w-auto " +
        (current
          ? "font-semibold"
          : "border-white/20 bg-white/5 font-medium text-white/90 hover:border-[#2dd4bf] hover:text-[#2dd4bf]")
      }
    >
      Episode {label ?? ep}
    </a>
  );
}

const EP_GRID =
  "-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:max-w-3xl sm:grid-cols-[repeat(auto-fill,minmax(112px,1fr))] sm:overflow-visible sm:px-0";

function EpisodeStrip({
  episodes,
  currentId,
}: {
  episodes: Array<{ id: string; ep: number; label?: string }>;
  currentId: string;
}) {
  const publicHref = usePublicHref();
  const localText = usePublicText();
  const at = episodes.findIndex((e) => e.id === currentId);
  const next = at >= 0 && at + 1 < episodes.length ? episodes[at + 1] : null;
  const many = episodes.length > EP_WINDOW;
  let shown = episodes;
  if (many) {
    const half = Math.floor(EP_WINDOW / 2);
    const start = Math.max(0, Math.min((at < 0 ? 0 : at) - half, episodes.length - EP_WINDOW));
    shown = episodes.slice(start, start + EP_WINDOW);
  }
  return (
    <nav aria-label="Episode" className="space-y-2">
      <div className={EP_GRID}>
        {shown.map((e) => (
          <EpisodeLink key={e.id} id={e.id} ep={e.ep} label={e.label} current={e.id === currentId} />
        ))}
      </div>
      {many ? (
        <details className="sm:max-w-3xl">
          <summary className="cursor-pointer select-none text-sm font-medium text-[#2dd4bf]">
            {localText("Semua episode (")}{episodes.length})
          </summary>
          <div className={EP_GRID + " mt-2"}>
            {episodes.map((e) => (
              <EpisodeLink key={e.id} id={e.id} ep={e.ep} label={e.label} current={e.id === currentId} />
            ))}
          </div>
        </details>
      ) : null}
      {next ? (
        <a
          href={publicHref(`/watch/${next.id}`)}
          style={{ backgroundColor: EP_ACCENT, color: "#09090b" }}
          className="inline-flex h-10 w-full items-center justify-center rounded-md px-4 text-sm font-semibold hover:opacity-90 active:scale-[0.98] sm:w-auto"
        >
          {localText("Episode selanjutnya (Episode")} {next.label ?? next.ep}) →
        </a>
      ) : null}
    </nav>
  );
}
