import { createFileRoute } from "@tanstack/react-router";
import { queryCatalog } from "@/lib/catalog/service";
import {
  DEFAULT_OG,
  SITE_ORIGIN,
  categoryKeywords,
  resolveVideoSeoDescription,
  videoJsonLd,
  videoSeoTitle,
} from "@/lib/seo";
import { WatchPage } from "@/lib/watch/watch-page";

const SHARE_CARD_VERSION = "13";

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
      ? resolveVideoSeoDescription(item)
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
          content: item
            ? `${categoryKeywords(item.category)}, ${item.title}, dr pinguin`
            : "bokep indo, dr pinguin, 18+",
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
