const CANONICAL_HOST = "koleksidrpinguin.com";

const REDIRECT_HOSTS = new Set([
  `www.${CANONICAL_HOST}`,
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
  const target = `https://${CANONICAL_HOST}${event.url.pathname}${event.url.search}`;
  return new Response(null, {
    status: 301,
    headers: { location: target },
  });
}
