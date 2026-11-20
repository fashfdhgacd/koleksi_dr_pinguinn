/**
 * Share destinations for /watch pages.
 * When the anti-blokir front door is live, share that URL (Telegram/X/Reddit, copy-link).
 * WhatsApp is offered only for that front URL — Doni reports WhatsApp flags the main domain.
 */
export const ANTI_BLOKIR_ORIGIN = "https://koleksidrpinguin.pages.dev";

export const CANONICAL_ORIGIN = "https://koleksidrpinguin.com";

export function canonicalWatchUrl(id: string): string {
  return `${CANONICAL_ORIGIN}/watch/${encodeURIComponent(id)}`;
}

/** URL put on share buttons. Prefers the pages.dev front door when configured. */
export function videoShareUrl(id: string, frontOrigin: string | null = ANTI_BLOKIR_ORIGIN): string {
  const front = (frontOrigin || "").replace(/\/$/, "");
  if (front) return `${front}/v/${encodeURIComponent(id)}`;
  return canonicalWatchUrl(id);
}

export function isAntiBlokirShareUrl(url: string, frontOrigin: string | null = ANTI_BLOKIR_ORIGIN): boolean {
  const front = (frontOrigin || "").replace(/\/$/, "");
  return Boolean(front) && url.startsWith(`${front}/`);
}

export function shareIntentUrls(title: string, url: string): {
  telegram: string;
  x: string;
  reddit: string;
  whatsapp: string | null;
} {
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
  const x = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${title}\n\n${url}`)}`;
  const reddit = `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
  const whatsapp = isAntiBlokirShareUrl(url)
    ? `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`
    : null;
  return { telegram, x, reddit, whatsapp };
}
