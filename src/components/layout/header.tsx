import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { BRAND_LOGO_SRC } from "@/lib/brand-logo";
import { prefetchCatalog } from "@/lib/catalog/client";
import { DEFAULT_PAGE_SIZE } from "@/lib/catalog/types";

const QUICK_CATS = [
  { slug: "jav", label: "Jav" },
  { slug: "ai-plus", label: "AI+" },
] as const;

export function Header({
  query,
  category,
}: {
  query?: string;
  category?: string;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onCategoriesPage = pathname === "/kategori" || pathname.startsWith("/kategori/");
  const [draft, setDraft] = useState(query ?? "");
  const debounced = useDebounce(draft, 400);
  const quickActive = Boolean(category && QUICK_CATS.some((c) => c.slug === category));

  useEffect(() => {
    setDraft(query ?? "");
  }, [query]);

  useEffect(() => {
    const next = debounced.trim();
    const current = (query ?? "").trim();
    if (next === current) return;
    if (next.length === 1) return;
    void navigate({
      to: "/",
      search: next ? { q: next, category: undefined } : { q: undefined, category },
    });
  }, [category, debounced, navigate, query]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
        <Link to="/" search={{ q: undefined, category: undefined }} className="flex shrink-0 items-center gap-2">
          <img
            src={BRAND_LOGO_SRC}
            alt="Dr. Pinguin"
            width={40}
            height={40}
            className="size-10 rounded-lg bg-white object-cover object-[center_20%] ring-1 ring-border"
          />
          <span className="font-display text-[1.35rem] leading-none tracking-tight text-foreground">
            DR. PINGUIN
          </span>
          <span className="hidden rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted sm:inline">
            18+
          </span>
        </Link>

        <form
          className="relative min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            const next = draft.trim();
            void navigate({
              to: "/",
              search: next ? { q: next, category: undefined } : { q: undefined, category },
            });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Cari judul / kategori…"
            className="pl-10 pr-10"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Cari judul"
          />
          {draft ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center text-muted"
              onClick={() => setDraft("")}
              aria-label="Hapus pencarian"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </form>

        <Button variant="ghost" size="icon" asChild aria-label="Semua kategori">
          <Link to="/kategori">
            <LayoutGrid className="size-5" />
          </Link>
        </Button>
      </div>

      <nav className="mx-auto max-w-[1440px] px-4 sm:px-6" aria-label="Navigasi cepat">
        <ul className="flex flex-wrap gap-1 py-2">
          <li>
            <Link
              to="/"
              search={{ q: undefined, category: undefined }}
              className={chipClass(!query && !category && !onCategoriesPage)}
            >
              Terbaru
            </Link>
          </li>
          {QUICK_CATS.map((cat) => (
            <li key={cat.slug}>
              <Link
                to="/"
                search={{ q: undefined, category: cat.slug }}
                className={chipClass(category === cat.slug && !query)}
                onMouseEnter={() =>
                  prefetchCatalog({
                    type: "category",
                    category: cat.slug,
                    page: 1,
                    limit: DEFAULT_PAGE_SIZE,
                  })
                }
                onFocus={() =>
                  prefetchCatalog({
                    type: "category",
                    category: cat.slug,
                    page: 1,
                    limit: DEFAULT_PAGE_SIZE,
                  })
                }
              >
                {cat.label}
              </Link>
            </li>
          ))}
          <li>
            <Link
              to="/kategori"
              className={chipClass(onCategoriesPage || Boolean(category && !quickActive))}
            >
              Kategori
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}

function chipClass(active: boolean) {
  return cn(
    "inline-flex h-9 shrink-0 items-center rounded-md px-3 text-sm transition-colors duration-150",
    active ? "bg-secondary text-foreground" : "text-muted hover:text-foreground",
  );
}
