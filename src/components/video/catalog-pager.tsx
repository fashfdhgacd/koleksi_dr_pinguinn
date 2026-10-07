import { ChevronLeft, ChevronRight } from "lucide-react";

function windowPages(current: number, totalPages: number, span = 1): number[] {
  const start = Math.max(1, current - span);
  const end = Math.min(totalPages, current + span);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

export function CatalogPager({
  page,
  total,
  limit,
  loading,
  onPage,
  basePath,
}: {
  page: number;
  total: number;
  limit: number;
  loading?: boolean;
  onPage: (page: number) => void;
  /** Path for SSR-rendered crawlable page links, e.g. "/kategori/jilbab". */
  basePath?: string;
}) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / Math.max(1, limit)));
  if (totalPages <= 1) {
    return total > 0 ? (
      <p className="mt-8 text-center text-xs text-muted">{total.toLocaleString("id-ID")} judul</p>
    ) : null;
  }

  const pages = windowPages(page, totalPages);
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  function go(next: number) {
    if (next < 1 || next > totalPages) return;
    // Do not gate on `loading` — a stalled fetch must not swallow further page clicks.
    onPage(next);
    if (next !== page) {
      try {
        // Coarse pointers (phones): instant jump — smooth + scrollRestoration races on Android
        // Chrome and can leave the viewport mid-page while the grid already swapped.
        const coarse =
          typeof window.matchMedia === "function" &&
          window.matchMedia("(pointer: coarse)").matches;
        window.scrollTo({ top: 0, behavior: coarse ? "auto" : "smooth" });
      } catch {
        /* ignore */
      }
    }
  }

  function hrefFor(n: number): string {
    let path = "/";
    let params = new URLSearchParams();
    if (typeof window !== "undefined") {
      path = window.location.pathname;
      params = new URLSearchParams(window.location.search);
    } else if (basePath) {
      path = basePath;
    }
    if (n > 1) params.set("page", String(n));
    else params.delete("page");
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }

  function linkProps(n: number) {
    return {
      href: hrefFor(n),
      onClick: (e: { preventDefault: () => void }) => {
        e.preventDefault();
        go(n);
      },
    };
  }

  return (
    <nav className="relative z-10 mt-8 flex flex-col items-center gap-3" aria-label="Halaman katalog">
      <p className="text-xs text-muted">
        {from.toLocaleString("id-ID")}–{to.toLocaleString("id-ID")} / {total.toLocaleString("id-ID")}
        {" · "}{page}/{totalPages}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <a
          {...(page > 1 ? { ...linkProps(page - 1), rel: "prev" } : { "aria-disabled": true })}
          className="inline-flex h-11 min-w-11 touch-manipulation items-center justify-center gap-1 rounded-full border border-border px-3 text-sm aria-disabled:pointer-events-none aria-disabled:opacity-40 sm:h-9"
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">Prev</span>
        </a>
        {pages[0] > 1 ? (
          <>
            <a {...linkProps(1)} className="h-11 min-w-11 touch-manipulation inline-flex items-center justify-center rounded-full px-2 text-sm hover:bg-secondary sm:h-9 sm:min-w-9">
              1
            </a>
            {pages[0] > 2 ? <span className="px-1 text-muted">…</span> : null}
          </>
        ) : null}
        {pages.map((n) => (
          <a
            key={n}
            {...linkProps(n)}
            aria-current={n === page ? "page" : undefined}
            className={`h-11 min-w-11 touch-manipulation inline-flex items-center justify-center rounded-full px-2 text-sm sm:h-9 sm:min-w-9 ${
              n === page ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
            }`}
          >
            {n}
          </a>
        ))}
        {pages[pages.length - 1] < totalPages ? (
          <>
            {pages[pages.length - 1] < totalPages - 1 ? <span className="px-1 text-muted">…</span> : null}
            <a {...linkProps(totalPages)} className="h-11 min-w-11 touch-manipulation inline-flex items-center justify-center rounded-full px-2 text-sm hover:bg-secondary sm:h-9 sm:min-w-9">
              {totalPages}
            </a>
          </>
        ) : null}
        <a
          {...(page < totalPages ? { ...linkProps(page + 1), rel: "next" } : { "aria-disabled": true })}
          className="inline-flex h-11 min-w-11 touch-manipulation items-center justify-center gap-1 rounded-full border border-border px-3 text-sm aria-disabled:pointer-events-none aria-disabled:opacity-40 sm:h-9"
          aria-label="Halaman berikutnya"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4" />
        </a>
      </div>
    </nav>
  );
}
