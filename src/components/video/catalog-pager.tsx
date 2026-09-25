import { ChevronLeft, ChevronRight } from "lucide-react";

function windowPages(current: number, totalPages: number, span = 2): number[] {
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
      <p className="mt-8 text-center text-xs text-muted">
        {total.toLocaleString("id-ID")} judul
      </p>
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
        {from.toLocaleString("id-ID")}–{to.toLocaleString("id-ID")} dari {total.toLocaleString("id-ID")} judul
        {" · "}halaman {page}/{totalPages}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => go(page - 1)}
          className="inline-flex h-9 items-center gap-1 rounded-full border border-border px-3 text-sm disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
          Prev
        </button>
        {pages[0] > 1 ? (
          <>
            <button type="button" onClick={() => go(1)} className="h-9 min-w-9 rounded-full px-2 text-sm hover:bg-secondary">
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
            className={`h-9 min-w-9 rounded-full px-2 text-sm ${
              n === page ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
            }`}
          >
            {n}
          </button>
        ))}
        {pages[pages.length - 1] < totalPages ? (
          <>
            {pages[pages.length - 1] < totalPages - 1 ? <span className="px-1 text-muted">…</span> : null}
            <button type="button" onClick={() => go(totalPages)} className="h-9 min-w-9 rounded-full px-2 text-sm hover:bg-secondary">
              {totalPages}
            </button>
          </>
        ) : null}
        <button
          type="button"
          disabled={page >= totalPages || loading}
          onClick={() => go(page + 1)}
          className="inline-flex h-9 items-center gap-1 rounded-full border border-border px-3 text-sm disabled:opacity-40"
        >
          Next
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}
