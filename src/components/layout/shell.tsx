import type { ReactNode } from "react";
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
    <div className="min-h-dvh bg-background text-foreground">
      <Header query={query} category={category} />
      <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-1 px-4 py-8 text-xs text-muted sm:px-6">
          <p>DR. PINGUIN · konten 18+. Masuk hanya jika dewasa.</p>
          <p>Koleksi embed IndoAV / UserBokep. Bukan arsip film.</p>
        </div>
      </footer>
    </div>
  );
}
