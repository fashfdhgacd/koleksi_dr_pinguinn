import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AgeGate } from "@/components/age-gate";
import { Header } from "./header";

export function Shell({
  children,
  query,
  category,
}: {
  children: ReactNode;
  query?: string;
  category?: string;
}) {
  return (
    <AgeGate>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <Header query={query} category={category} />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 pb-16 pt-4 sm:px-6 sm:pb-14 sm:pt-6">
          {children}
        </main>
        <footer className="mt-auto border-t border-white/25 pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-7 text-white/80 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-9">
            <div className="space-y-2">
              <p className="pixel text-sm text-white sm:text-lg">
                DR. PINGUIN ·{" "}
                <a href="https://koleksidrpinguin.com" className="underline-offset-2 hover:underline">
                  koleksidrpinguin.com
                </a>{" "}
                · 18+
              </p>
              <p className="text-xs text-white/80 sm:text-sm">Koleksi Dr. Pinguin — situs resmi koleksidrpinguin.com</p>
              <p className="text-[11px] text-white/65 sm:text-xs">
                Koleksi ini dimaksudkan untuk pengguna dewasa. Pastikan Anda berusia 18+ sebelum melanjutkan.
              </p>
              <p className="text-[11px] text-white/65 sm:text-xs">
                Konten dan gambar disediakan oleh pihak ketiga. Kami tidak bertanggung jawab atas materi eksternal.
              </p>
            </div>
            <div className="flex items-center justify-between gap-6 sm:justify-end sm:gap-8">
              <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" aria-label="Legal">
                <Link to="/2257" className="hover:text-white hover:underline">
                  2257
                </Link>
                <Link to="/privasi" className="hover:text-white hover:underline">
                  Privasi
                </Link>
                <Link to="/syarat" className="hover:text-white hover:underline">
                  Syarat
                </Link>
                <Link to="/dmca" className="hover:text-white hover:underline">
                  DMCA
                </Link>
                <Link to="/kontak" className="hover:text-white hover:underline">
                  Kontak
                </Link>
              </nav>
              <a
                href="https://www.rtalabel.org/"
                target="_blank"
                rel="noopener noreferrer"
                title="Restricted To Adults (RTA)"
                aria-label="RTA: Restricted To Adults"
                className="flex shrink-0 flex-col items-center justify-center border border-white/55 px-1.5 py-1.5 text-white/85 transition-colors hover:border-white"
              >
                <span className="pixel text-xl leading-none tracking-wider sm:text-2xl">RTA</span>
                <span className="mt-1 text-[7px] font-semibold uppercase leading-[1.15] tracking-wide">
                  Restricted
                  <br />
                  To Adults
                </span>
              </a>
            </div>
          </div>
        </footer>
      </div>
    </AgeGate>
  );
}
