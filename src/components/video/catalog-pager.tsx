import { ChevronLeft, ChevronRight } from "lucide-react";

function windowPages(current: number, totalPages: number, span = 1): number[] {
  const start = Math.max(1, current - span);
  const end = Math.min(totalPages, current + span);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

const btn =
  "pixel inline-flex h-10 min-w-10 touch-manipulation items-center justify-center border border-foreground/40 px-2.5 text-sm text-foreground hover:bg-foreground hover:text-background aria-disabled:pointer-events-none aria-disabled:opacity-30 sm:h-9";

export function CatalogPager({
  page,
  total,
  limit,
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
      <p className="pixel mt-8 text-center text-xs text-muted">{total.toLocaleString("id-ID")} judul</p>
    ) : null;
  }

  const pages = windowPages(page, totalPages);

  function go(next: number) {
    if (next < 1 || next > totalPages) return;
    onPage(next);
    if (next !== page) {
      try {
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
      <p className="pixel text-xs text-muted">
        Halaman {page.toLocaleString("id-ID")} dari {totalPages.toLocaleString("id-ID")}
        {" · "}
        {total.toLocaleString("id-ID")} video
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <a
          {...(page > 1 ? { ...linkProps(page - 1), rel: "prev" } : { "aria-disabled": true })}
          className={`${btn} gap-1 px-3`}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="size-3.5" />
          <span className="hidden sm:inline">Sebelumnya</span>
        </a>
        {pages[0] > 1 ? (
          <>
            <a {...linkProps(1)} className={btn}>
              1
            </a>
            {pages[0] > 2 ? <span className="pixel px-1 text-muted">…</span> : null}
          </>
        ) : null}
        {pages.map((n) => (
          <a
            key={n}
            {...linkProps(n)}
            aria-current={n === page ? "page" : undefined}
            className={`${btn} ${
              n === page ? "border-foreground bg-foreground font-bold text-background hover:bg-foreground hover:text-background" : ""
            }`}
          >
            {n}
          </a>
        ))}
        {pages[pages.length - 1] < totalPages ? (
          <>
            {pages[pages.length - 1] < totalPages - 1 ? <span className="pixel px-1 text-muted">…</span> : null}
            <a {...linkProps(totalPages)} className={btn}>
              {totalPages}
            </a>
          </>
        ) : null}
        <a
          {...(page < totalPages ? { ...linkProps(page + 1), rel: "next" } : { "aria-disabled": true })}
          className={`${btn} gap-1 px-3`}
          aria-label="Halaman berikutnya"
        >
          <span className="hidden sm:inline">Berikutnya</span>
          <ChevronRight className="size-3.5" />
        </a>
      </div>
    </nav>
  );
}
