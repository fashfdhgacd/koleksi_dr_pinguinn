function windowPages(current: number, totalPages: number, span = 2): number[] {
  const size = span * 2 + 1;
  let start = Math.max(1, current - span);
  const end = Math.min(totalPages, start + size - 1);
  start = Math.max(1, end - size + 1);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

const btn =
  "pixel inline-flex h-11 min-w-11 touch-manipulation items-center justify-center rounded-none border border-white/55 px-2 text-sm transition-colors hover:border-white aria-disabled:pointer-events-none aria-disabled:opacity-30 sm:h-14 sm:min-w-14 sm:text-base";

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
    <nav className="relative z-10 mt-10 flex flex-col items-center gap-5 sm:mt-14 sm:gap-7" aria-label="Halaman katalog">
      <p className="pixel text-center text-xs text-white/85 sm:text-base">
        Halaman {page.toLocaleString("id-ID")} dari {totalPages.toLocaleString("id-ID")}
        {" · "}
        {total.toLocaleString("id-ID")} video
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-3.5">
        <a
          {...(page > 1 ? { ...linkProps(page - 1), rel: "prev" } : { "aria-disabled": true })}
          className={`${btn} px-3 text-white sm:px-5`}
          aria-label="Halaman sebelumnya"
        >
          <span aria-hidden="true" className="text-lg leading-none sm:text-2xl">←</span>
        </a>
        {pages[0] > 1 ? (
          <>
            <a {...linkProps(1)} className={`${btn} text-white max-sm:hidden`}>
              1
            </a>
            {pages[0] > 2 ? <span className="pixel hidden px-1 text-white/50 sm:inline">…</span> : null}
          </>
        ) : null}
        {pages.map((n) => (
          <a
            key={n}
            data-far={Math.abs(n - page) > 1 && !(page <= 2 && n <= 3) && !(page >= totalPages - 1 && n >= totalPages - 2) ? "" : undefined}
            {...linkProps(n)}
            aria-current={n === page ? "page" : undefined}
            className={`${btn} max-sm:data-[far]:hidden ${
              n === page ? "border-[#c8c8c8] bg-[#c8c8c8] text-black hover:border-[#c8c8c8]" : "text-white"
            }`}
          >
            {n}
          </a>
        ))}
        {pages[pages.length - 1] < totalPages ? (
          <>
            {pages[pages.length - 1] < totalPages - 1 ? <span className="pixel hidden px-1 text-white/50 sm:inline">…</span> : null}
            <a {...linkProps(totalPages)} className={`${btn} text-white max-sm:hidden`}>
              {totalPages}
            </a>
          </>
        ) : null}
        <a
          {...(page < totalPages ? { ...linkProps(page + 1), rel: "next" } : { "aria-disabled": true })}
          className={`${btn} gap-2 px-3 text-white sm:gap-3 sm:px-5`}
          aria-label="Halaman berikutnya"
        >
          <span>Next</span>
          <span aria-hidden="true" className="text-lg leading-none sm:text-2xl">→</span>
        </a>
      </div>
    </nav>
  );
}
