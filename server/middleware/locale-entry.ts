/** Explicit locale URLs always win. Only the bare entry point consults the visitor's preference. */
export default function localeEntry(event: { url: URL; req: { method: string; headers: Headers } }, next: () => unknown) {
  if (event.url.pathname !== "/" || !["GET", "HEAD"].includes(event.req.method)) return next();
  const language = /(?:^|;\s*)dp_lang=(id|en|ms)(?:;|$)/.exec(event.req.headers.get("cookie") || "")?.[1];
  if (!language || language === "ms") return next();
  return new Response(null, {
    status: 302,
    headers: { Location: (language === "id" ? "/id" : language === "en" ? "/en/home" : "/ms") + event.url.search,
      "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
