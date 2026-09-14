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
  if (/videy/.test(s)) return "Videy";
  if (/indoav/.test(s)) return "IndoAV";
  if (/userbokep/.test(s)) return "UserBokep";
  if (/streamtape|campur|lulu/.test(s)) return "Streamtape";
  if (/putarin|puterin/.test(s)) return "Puterin";
  if (/archive\.org/.test(s)) return "Arsip";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Sumber";
  }
}

export function resolveSource(raw: string | null | undefined): ResolvedSource | null {
  if (!raw) return null;
  const url = raw.replace("/d/", "/e/");
  const id = videyId(url);
  if ((id && /videy/i.test(url)) || /\.mp4($|\?)/i.test(url)) {
    const fallbacks = id && /videy/i.test(url) ? videyCdns(id) : [url];
    return {
      mode: "video",
      url: fallbacks[0],
      fallbacks,
      host: hostLabel(url),
    };
  }
  return {
    mode: "iframe",
    url,
    fallbacks: [url],
    host: hostLabel(url),
  };
}
