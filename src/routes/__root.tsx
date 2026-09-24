import { createRootRoute, HeadContent, Outlet, Scripts, redirect } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { PresencePing } from "@/components/presence-ping";
import { DEFAULT_OG } from "@/lib/seo";
import appCss from "../styles.css?url";

const UMAMI_WEBSITE_ID = "b952a905-cb5b-419d-8aa4-534435e5cc8b";
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
      // Always send site origin to embed hosts (IndoAV / UserBokep) from both domains
      { name: "referrer", content: "origin" },
      { title: "Koleksi Dr. Pinguin | DR. PINGUIN" },
      {
        name: "description",
        content: "Katalog video dewasa 18+ Dr. Pinguin. Streaming embed, update koleksi Indo.",
      },
      { name: "theme-color", content: "#09090b" },
      { name: "robots", content: "index,follow,max-image-preview:large" },
      { name: "rating", content: "adult" },
      { property: "og:site_name", content: "DR. PINGUIN" },
      { property: "og:image", content: DEFAULT_OG },
      { property: "og:image:secure_url", content: DEFAULT_OG },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "1280" },
      { property: "og:image:height", content: "720" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: DEFAULT_OG },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "image_src", href: DEFAULT_OG },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://tv1.indoav.app" },
      { rel: "preconnect", href: "https://tv1.userbokep.com" },
      { rel: "dns-prefetch", href: "https://tv1.indoav.app" },
      { rel: "dns-prefetch", href: "https://tv1.userbokep.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Instrument+Serif:ital@0;1&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
    ],
    scripts: [
      {
        defer: true,
        src: "https://cloud.umami.is/script.js",
        "data-website-id": UMAMI_WEBSITE_ID,
      },
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
