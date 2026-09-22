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
      <div className="min-h-dvh bg-background text-foreground">
        <Header query={query} category={category} />
        <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6">{children}</main>
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-8 text-xs text-muted sm:px-6">
            <p>
              DR. PINGUIN ·{" "}
              <a href="https://koleksidrpinguin.com" className="underline-offset-2 hover:underline">
                koleksidrpinguin.com
              </a>{" "}
              · konten 18+.
            </p>
            <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legal">
              <Link to="/syarat" className="hover:underline">
                Syarat
              </Link>
              <Link to="/privasi" className="hover:underline">
                Privasi
              </Link>
              <Link to="/dmca" className="hover:underline">
                DMCA
              </Link>
              <Link to="/kontak" className="hover:underline">
                Kontak
              </Link>
            </nav>
            <p>Katalog embed. Bukan arsip file video.</p>
          </div>
        </footer>
      </div>
    </AgeGate>
  );
}
