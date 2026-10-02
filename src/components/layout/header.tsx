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
    // Functional update keeps unrelated search params from clobbering an in-flight
    // pagination click that landed between keystroke and debounce flush.
    void navigate({
      to: "/",
      search: (prev) => {
        if ((prev.q ?? "").trim() === next) return prev;
        return {
          ...prev,
          q: next || undefined,
          category: undefined,
          page: undefined,
        };
      },
    });
  }, [debounced, navigate, query]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6">
        <Link to="/" search={{ q: undefined, category: undefined }} className="flex shrink-0 items-center gap-2">
          <img
            src={BRAND_LOGO_SRC}
            alt="Dr. Pinguin"
            width={36}
            height={36}
            className="size-8 rounded-md bg-white object-cover object-[center_20%] ring-1 ring-border sm:size-10 sm:rounded-lg"
          />
          <span className="hidden font-display text-[1.2rem] leading-none tracking-tight text-foreground min-[400px]:inline sm:text-[1.35rem]">
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
              search: next ? { q: next, category: undefined } : { q: undefined, category: undefined },
            });
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted sm:left-3" />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Cari judul…"
            className="h-10 pl-9 pr-9 text-sm sm:h-11 sm:pl-10 sm:pr-10"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Cari judul"
          />
          {draft ? (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center text-muted"
              onClick={() => setDraft("")}
              aria-label="Hapus pencarian"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </form>

        <Button variant="ghost" size="icon" asChild aria-label="Semua kategori" className="size-10 shrink-0">
          <Link to="/kategori">
            <LayoutGrid className="size-5" />
          </Link>
        </Button>
      </div>

      <nav className="mx-auto max-w-[1440px] px-3 sm:px-6" aria-label="Navigasi cepat">
        <ul className="-mx-3 flex gap-1 overflow-x-auto px-3 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
          <li className="shrink-0">
            <Link
              to="/"
              search={{ q: undefined, category: undefined }}
              className={chipClass(!query && !category && !onCategoriesPage)}
            >
              Terbaru
            </Link>
          </li>
          {QUICK_CATS.map((cat) => (
            <li key={cat.slug} className="shrink-0">
              <Link
                to="/kategori/$slug"
                params={{ slug: cat.slug }}
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
          <li className="shrink-0">
            <Link to="/kategori" className={chipClass(onCategoriesPage && !quickActive)}>
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
    "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-sm transition-colors duration-150 sm:h-9 sm:rounded-md",
    active ? "bg-secondary text-foreground" : "text-muted hover:text-foreground",
  );
}
