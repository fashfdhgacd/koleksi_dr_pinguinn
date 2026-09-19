import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const APP_NAME = "DR. PINGUIN";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Koleksi Dr. Pinguin Bokep (M.S.B.) | DR. PINGUIN" },
      {
        name: "description",
        content:
          "Koleksi Dr. Pinguin Bokep (M.S.B.) — nonton bokep Indo terbaru di Dr. Pinguin. Amatir, jilbab, tante, viral. Konten 18+.",
      },
      {
        name: "keywords",
        content: "koleksi dr pinguin bokep, m.s.b, msb, dr pinguin bokep, bokep dr pinguin, bokep indo, dr pinguin",
      },
      { name: "theme-color", content: "#09090b" },
      { name: "robots", content: "index,follow,max-image-preview:large" },
      { name: "rating", content: "adult" },
    ],
    scripts: [
      {
        src: "https://cloud.umami.is/script.js",
        defer: true,
        "data-website-id": "b952a905-cb5b-419d-8aa4-534435e5cc8b",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Instrument+Serif:ital@0;1&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
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
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
        <Analytics />
      </body>
    </html>
  );
}
