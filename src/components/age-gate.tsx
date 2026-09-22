import { useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "dp_age_ok";
const COOKIE = "dp_age_ok=1; Max-Age=31536000; Path=/; SameSite=Lax";

const CRAWLER_RE =
  /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|applebot|semrush|ahrefs|dotbot|mj12bot|petalbot|bytespider/i;

function isCrawler(): boolean {
  if (typeof navigator === "undefined") return true;
  return CRAWLER_RE.test(navigator.userAgent || "");
}

function readConsent(): boolean {
  if (typeof document === "undefined") return false;
  if (document.cookie.split(";").some((c) => c.trim().startsWith("dp_age_ok="))) return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeConsent() {
  document.cookie = COOKIE;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore quota */
  }
}

export function AgeGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (isCrawler() || readConsent()) {
      setOk(true);
    }
    setReady(true);
  }, []);

  function accept() {
    writeConsent();
    setOk(true);
  }

  if (!ready) {
    return <div className="min-h-dvh bg-background" />;
  }

  if (!ok) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">DR. PINGUIN</p>
          <h1 className="mt-3 font-display text-3xl text-foreground">Konten 18+</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Situs ini menampilkan materi dewasa. Masuk hanya jika Anda berusia 18 tahun atau lebih
            dan setuju dengan syarat layanan.
          </p>
          <div className="mt-6 grid gap-3">
            <button
              type="button"
              className="h-12 rounded-xl bg-primary px-4 text-base font-semibold text-primary-foreground"
              onClick={accept}
            >
              Saya 18+ dan setuju
            </button>
            <a
              href="https://www.google.com"
              className="flex h-12 items-center justify-center rounded-xl border border-border text-sm text-muted"
            >
              Keluar
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
