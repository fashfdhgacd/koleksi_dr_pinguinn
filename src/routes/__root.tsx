import { createRootRoute, HeadContent, Outlet, Scripts, redirect } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { PresencePing } from "@/components/presence-ping";
import { SwCleanup } from "@/components/sw-cleanup";
import { DEFAULT_OG, HOME_TITLE, OG_SITE_NAME } from "@/lib/seo";
import appCss from "../styles.css?url";

const CANONICAL_HOST = "koleksidrpinguin.com";

function shouldRedirectHost(host: string) {
  const h = host.split(":")[0].toLowerCase();
  return (
    h === `www.${CANONICAL_HOST}` ||
    h === "koleksidrpinguin.site" ||
    h === "www.koleksidrpinguin.site"
  );
}

export const Route = createRootRoute({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!shouldRedirectHost(window.location.hostname)) return;
    throw redirect({
      href: `https://${CANONICAL_HOST}${window.location.pathname}${window.location.search}`,
      statusCode: 301,
    });
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "referrer", content: "origin" },
      { title: HOME_TITLE },
      {
        name: "description",
        content:
          "Koleksi Dr. Pinguin Bokep, M.S.B., katalog video dewasa 18+ di koleksidrpinguin.com.",
      },
      { name: "theme-color", content: "#09090b" },
      // TrafficStars Client Hints (blog "Boost Earnings with Existing Ad Formats"): delegate UA hints
      // to the TrafficStars ad servers (tsyndicate.com + our direct-link/VAST domain) for better mobile targeting.
      { httpEquiv: "Accept-CH", content: "Sec-CH-UA, Sec-CH-UA-Mobile, Sec-CH-UA-Platform, Sec-CH-UA-Model, Sec-CH-UA-Platform-Version, Sec-CH-UA-Full-Version-List" },
      { httpEquiv: "delegate-ch", content: "sec-ch-ua https://tsyndicate.com https://fozekikikiminu.com; sec-ch-ua-bitness https://tsyndicate.com https://fozekikikiminu.com; sec-ch-ua-arch https://tsyndicate.com https://fozekikikiminu.com; sec-ch-ua-model https://tsyndicate.com https://fozekikikiminu.com; sec-ch-ua-platform https://tsyndicate.com https://fozekikikiminu.com; sec-ch-ua-platform-version https://tsyndicate.com https://fozekikikiminu.com; sec-ch-ua-full-version https://tsyndicate.com https://fozekikikiminu.com; sec-ch-ua-full-version-list https://tsyndicate.com https://fozekikikiminu.com; sec-ch-ua-mobile https://tsyndicate.com https://fozekikikiminu.com" },
      { name: "robots", content: "index,follow,max-image-preview:large" },
      { name: "rating", content: "adult" },
      // RTA label (rtalabel.org). Uppercase key so HeadContent does not dedupe it with "rating".
      { name: "RATING", content: "RTA-5042-1996-1400-1577-RTA" },
      { name: "googlebot", content: "index,follow,max-image-preview:large" },
      // TrafficStars site verification (publisher account).
      { name: "Trafficstars", content: "91976" },
      { property: "og:site_name", content: OG_SITE_NAME },
      { property: "og:title", content: HOME_TITLE },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "id_ID" },
      { property: "og:image", content: DEFAULT_OG },
      { property: "og:image:secure_url", content: DEFAULT_OG },
      { property: "og:image:type", content: "image/jpeg" },
      // og-v2.jpg is 1200x630.
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: DEFAULT_OG },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico?v=3", sizes: "16x16 32x32 48x48" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png?v=3" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png?v=3" },
      { rel: "image_src", href: DEFAULT_OG },
      { rel: "alternate", type: "application/rss+xml", title: "Koleksi Dr. Pinguin - Video Terbaru", href: "https://koleksidrpinguin.com/rss.xml" },
      // Poster/thumbnail host (cards + preloaded hero images): open the connection with the HTML.
      { rel: "preconnect", href: "https://img.koleksidrpinguin.com" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://tv1.indoav.app" },
      { rel: "preconnect", href: "https://tv1.userbokep.com" },
      { rel: "dns-prefetch", href: "https://tv1.indoav.app" },
      { rel: "dns-prefetch", href: "https://tv1.userbokep.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Instrument+Serif:ital@0;1&family=Silkscreen:wght@400;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png?v=3" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="id" suppressHydrationWarning className="antialiased">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <SwCleanup />
        <PreviewHostBridge />
        <PresencePing />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
