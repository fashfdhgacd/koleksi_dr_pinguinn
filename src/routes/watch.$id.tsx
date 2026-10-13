import { createFileRoute, notFound } from "@tanstack/react-router";
import { queryCatalog } from "@/lib/catalog/service";
import { jsonLdString } from "@/lib/json-ld";
import {
  DEFAULT_OG,
  OG_SITE_NAME,
  SITE_ORIGIN,
  categoryKeywords,
  cleanDisplayTitle,
  resolveVideoSeoDescription,
  videoJsonLd,
  videoSeoTitle,
} from "@/lib/seo";
import { WatchPage } from "@/lib/watch/watch-page";

/** Absolute https image for share cards. Never a page or a stream. */
function shareCardImage(thumbnail: string | null | undefined): string {
  const raw = String(thumbnail || "").trim();
  const absolute = raw.startsWith("/")
    ? `${SITE_ORIGIN}${raw}`
    : /^https:\/\//i.test(raw)
      ? raw
      : "";
  if (!absolute) return DEFAULT_OG;
  if (/\.(mp4|webm|m3u8|mov)(?:$|\?)/i.test(absolute)) return DEFAULT_OG;
  return absolute;
}

/** ExoClick (VAST pre-roll on Videy pages) may read these client hints. */
const EXO_DELEGATE_CH = [
  "Sec-CH-UA",
  "Sec-CH-UA-Mobile",
  "Sec-CH-UA-Arch",
  "Sec-CH-UA-Model",
  "Sec-CH-UA-Platform",
  "Sec-CH-UA-Platform-Version",
  "Sec-CH-UA-Bitness",
  "Sec-CH-UA-Full-Version-List",
  "Sec-CH-UA-Full-Version",
]
  .map((h) => `${h} https://s.magsrv.com`)
  .join("; ");

export const Route = createFileRoute("/watch/$id")({
  loader: async ({ params }) => {
    const id = (params.id || "").trim();
    if (!id) return { ok: false as const, error: "ID kosong", code: "bad_request" as const };
    const res = await queryCatalog({ type: "detail", id });
    // ID tidak dikenal, video tersembunyi (minor/sekolah) atau 'Tidak publish' → 404 sungguhan
    // (+ noindex, lihat head di bawah dan server/middleware/cache-headers.ts). Error lain (sumber
    // sedang gangguan) tetap tampil sebagai halaman error biasa, bukan 404.
    if (!res.ok && res.code === "not_found") throw notFound();
    return res;
  },
  head: ({ loaderData }) => {
    const ok = loaderData && loaderData.ok === true && loaderData.type === "detail";
    const item = ok ? loaderData.item : null;
    const title = item ? videoSeoTitle(item.title, item.category) : "Video tidak ditemukan | koleksidrpinguin.com";
    const ogTitle = item ? cleanDisplayTitle(item.title) : title;
    const description = item
      ? resolveVideoSeoDescription(item)
      : "Koleksi bokep Indo Dr. Pinguin. Konten 18+.";
    const image = item ? shareCardImage(item.thumbnail) : DEFAULT_OG;
    const url = item ? `${SITE_ORIGIN}/watch/${item.id}` : SITE_ORIGIN;
    const embedUrl = item
      ? (item.video_url || item.qualities?.[0]?.url || "").trim() || null
      : null;
    const contentUrl =
      embedUrl && /\.(mp4|webm|mov)($|\?)/i.test(embedUrl) ? embedUrl : null;
    const jsonLd = item
      ? videoJsonLd({
          id: item.id,
          title: cleanDisplayTitle(item.title),
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
        { property: "og:site_name", content: OG_SITE_NAME },
        { property: "og:title", content: ogTitle },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { property: "og:image:secure_url", content: image },
        { property: "og:image:type", content: "image/jpeg" },
        { property: "og:image:width", content: "1280" },
        { property: "og:image:height", content: "720" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: ogTitle },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
        { name: "twitter:image:alt", content: OG_SITE_NAME },
        { name: "robots", content: item ? "index,follow,max-video-preview:120" : "noindex,follow" },
        { name: "rating", content: "adult" },
        ...(item && (item.creator === "Videy" || item.category === "videy")
          ? [{ httpEquiv: "Delegate-CH", content: EXO_DELEGATE_CH }]
          : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: jsonLd
        ? [{ type: "application/ld+json", children: jsonLdString(jsonLd) }]
        : [],
    };
  },
  component: WatchPage,
});
