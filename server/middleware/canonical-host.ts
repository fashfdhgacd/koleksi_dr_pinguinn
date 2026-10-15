const COM_HOST = "koleksidrpinguin.com";

/** Host yang wajib 301 ke https://koleksidrpinguin.com (path + query dipertahankan). */
const REDIRECT_HOSTS = new Set([
  `www.${COM_HOST}`,
  "koleksidrpinguin.site",
  "www.koleksidrpinguin.site",
]);

interface HostEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

function requestHost(event: HostEvent): string {
  const raw =
    event.req.headers.get("x-forwarded-host") ??
    event.req.headers.get("host") ??
    event.url.host;
  return raw.split(":")[0].toLowerCase();
}

export default function canonicalHostMiddleware(
  event: HostEvent,
  next: () => unknown | Promise<unknown>,
): unknown | Promise<unknown> {
  const host = requestHost(event);
  if (!REDIRECT_HOSTS.has(host)) return next();
  return new Response(null, {
    status: 301,
    headers: {
      // Strip trailing slash here too so www + "/kategori/" is still a single 301 hop.
      location: `https://${COM_HOST}${event.url.pathname.length > 1 ? event.url.pathname.replace(/\/+$/, "") || "/" : event.url.pathname}${event.url.search}`,
    },
  });
}
