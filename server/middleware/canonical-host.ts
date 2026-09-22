const COM_HOST = "koleksidrpinguin.com";

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
  // Hanya rapikan www pada .com. Domain .site diurus Vercel — jangan diutak-atik.
  if (host !== `www.${COM_HOST}`) return next();
  return new Response(null, {
    status: 301,
    headers: {
      location: `https://${COM_HOST}${event.url.pathname}${event.url.search}`,
    },
  });
}
