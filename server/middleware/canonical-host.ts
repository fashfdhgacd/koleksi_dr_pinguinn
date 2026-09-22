const COM_HOST = "koleksidrpinguin.com";
const SITE_HOST = "koleksidrpinguin.site";

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

function redirect(host: string, event: HostEvent): Response {
  return new Response(null, {
    status: 301,
    headers: {
      location: `https://${host}${event.url.pathname}${event.url.search}`,
    },
  });
}

export default function canonicalHostMiddleware(
  event: HostEvent,
  next: () => unknown | Promise<unknown>,
): unknown | Promise<unknown> {
  const host = requestHost(event);
  if (host === `www.${COM_HOST}`) return redirect(COM_HOST, event);
  if (host === `www.${SITE_HOST}`) return redirect(SITE_HOST, event);
  return next();
}
