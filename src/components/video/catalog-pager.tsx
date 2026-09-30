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
}: {
  page: number;
  total: number;
  limit: number;
  loading?: boolean;
  onPage: (page: number) => void;
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
    if (next < 1 || next > totalPages || next === page || loading) return;
    onPage(next);
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      /* ignore */
    }
  }

  return (
    <nav className="mt-8 flex flex-col items-center gap-3" aria-label="Halaman katalog">
      <p className="text-xs text-muted">
        {from.toLocaleString("id-ID")}–{to.toLocaleString("id-ID")} / {total.toLocaleString("id-ID")}
        {" · "}{page}/{totalPages}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => go(page - 1)}
          className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full border border-border px-3 text-sm disabled:opacity-40 sm:h-9"
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">Prev</span>
        </button>
        {pages[0] > 1 ? (
          <>
            <button type="button" onClick={() => go(1)} className="h-11 min-w-11 rounded-full px-2 text-sm hover:bg-secondary sm:h-9 sm:min-w-9">
              1
            </button>
            {pages[0] > 2 ? <span className="px-1 text-muted">…</span> : null}
          </>
        ) : null}
        {pages.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => go(n)}
            className={`h-11 min-w-11 rounded-full px-2 text-sm sm:h-9 sm:min-w-9 ${
              n === page ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
            }`}
          >
            {n}
          </button>
        ))}
        {pages[pages.length - 1] < totalPages ? (
          <>
            {pages[pages.length - 1] < totalPages - 1 ? <span className="px-1 text-muted">…</span> : null}
            <button type="button" onClick={() => go(totalPages)} className="h-11 min-w-11 rounded-full px-2 text-sm hover:bg-secondary sm:h-9 sm:min-w-9">
              {totalPages}
            </button>
          </>
        ) : null}
        <button
          type="button"
          disabled={page >= totalPages || loading}
          onClick={() => go(page + 1)}
          className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full border border-border px-3 text-sm disabled:opacity-40 sm:h-9"
          aria-label="Halaman berikutnya"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}
