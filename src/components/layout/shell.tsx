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
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-3 pb-16 pt-4 sm:px-6 sm:pb-14 sm:pt-6">
          {children}
        </main>
        <footer className="mt-auto border-t border-border pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-3 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-8">
            <div className="space-y-1.5">
              <p className="font-medium text-foreground/80">
                DR. PINGUIN ·{" "}
                <a href="https://koleksidrpinguin.com" className="underline-offset-2 hover:underline">
                  koleksidrpinguin.com
                </a>{" "}
                · 18+
              </p>
              <p className="text-[11px] text-muted/60">Katalog embed. Bukan arsip file video.</p>
            </div>
            <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legal">
              <Link to="/syarat" className="hover:text-foreground hover:underline">
                Syarat
              </Link>
              <Link to="/privasi" className="hover:text-foreground hover:underline">
                Privasi
              </Link>
              <Link to="/dmca" className="hover:text-foreground hover:underline">
                DMCA
              </Link>
              <Link to="/kontak" className="hover:text-foreground hover:underline">
                Kontak
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </AgeGate>
  );
}
