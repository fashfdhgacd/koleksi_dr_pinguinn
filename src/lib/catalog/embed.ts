export type PlayMode = "video" | "iframe";

export type ResolvedSource = {
  mode: PlayMode;
  url: string;
  fallbacks: string[];
  host: string;
};

function videyId(url: string): string {
  try {
    const u = new URL(url);
    if (/videy\.co/i.test(u.hostname)) {
      const q = u.searchParams.get("id");
      if (q) return q;
      const last = (u.pathname.split("/").filter(Boolean).pop() || "").replace(/\.(mp4|mov)$/i, "");
      if (last && !/^(v|e|d|embed|watch)$/i.test(last)) return last;
    }
  } catch {
    /* ignore */
  }
  const m = url.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : "";
}

function videyCdns(id: string): string[] {
  const mov = `https://cdn.videy.co/${id}.mov`;
  const mp4 = `https://cdn.videy.co/${id}.mp4`;
  return id.length === 9 && id.charAt(8) === "2" ? [mov, mp4] : [mp4, mov];
}

export function hostLabel(url: string): string {
  const s = url.toLowerCase();
  if (/indoav/.test(s)) return "IndoAV";
  if (/userbokep/.test(s)) return "UserBokep";
  if (/videy/.test(s)) return "Videy";
  if (/streamtape|campur|lulu|strcloud|tapecontent/.test(s)) return "Streamtape";
  if (/putarin|puterin/.test(s)) return "Puterin";
  if (/archive\.org/.test(s)) return "Arsip";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Sumber";
  }
}

/** Lower = higher priority. IndoAV first so viewer bonus can count. */
export function hostPriority(urlOrHost: string): number {
  const s = urlOrHost.toLowerCase();
  if (/indoav/.test(s)) return 0;
  if (/userbokep/.test(s)) return 1;
  if (/puterin|putarin/.test(s)) return 2;
  if (/videy/.test(s)) return 3;
  if (/streamtape|strcloud|tapecontent/.test(s)) return 4;
  if (/\.(mp4|mov|webm)($|\?)/.test(s)) return 5;
  return 6;
}

export function isIndoAvUrl(url: string): boolean {
  return /indoav/i.test(url);
}

function isFile(url: string): boolean {
  return /\.(mp4|mov|webm)($|\?)/i.test(url);
}

/** Convert /v/ or /d/ paths to /e/ embed path when applicable */
function toEmbedPath(url: string): string {
  try {
    const u = new URL(url);
    if (/\/(?:v|d)\//.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\/(?:v|d)\//, "/e/");
      return u.toString();
    }
  } catch {
    /* ignore */
  }
  return url;
}

export function resolveSource(raw: string | null | undefined): ResolvedSource | null {
  if (!raw) return null;
  let url = raw.trim();
  url = url.replace("/d/", "/e/");

  const id = videyId(url);
  if (id && /videy/i.test(url)) {
    // Play CDN mp4/mov in <video>, never iframe the videy.co page UI.
    const cdns = videyCdns(id);
    return {
      mode: "video",
      url: cdns[0],
      fallbacks: cdns,
      host: "Videy",
    };
  }

  if (isFile(url)) {
    return {
      mode: "video",
      url,
      fallbacks: [url],
      host: hostLabel(url),
    };
  }

  const embedUrl = toEmbedPath(url);

  return {
    mode: "iframe",
    url: embedUrl,
    fallbacks: embedUrl !== url ? [embedUrl, url] : [url],
    host: hostLabel(url),
  };
}
