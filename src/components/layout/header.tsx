import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORY_LIST } from "@/lib/catalog/categories";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

export function Header({
  query,
  category,
}: {
  query?: string;
  category?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(query ?? "");
  const debounced = useDebounce(draft, 400);

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
        <Link to="/" search={{ q: undefined, category: undefined }} className="shrink-0">
          <span className="font-display text-[1.65rem] leading-none tracking-tight text-foreground">LAYAR</span>
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
            placeholder="Cari judul, sutradara, arsip…"
            className="pl-10 pr-10"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Cari film"
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

        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu kategori"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </div>

      <nav
        className={cn(
          "mx-auto max-w-[1440px] overflow-x-auto px-4 sm:px-6",
          open ? "block border-t border-border py-3" : "hidden lg:block",
        )}
      >
        <ul className={cn("flex gap-1 pb-3", open && "flex-col lg:flex-row")}>
          <li>
            <Link
              to="/"
              search={{ q: undefined, category: undefined }}
              className={chipClass(!query && !category)}
              onClick={() => setOpen(false)}
            >
              Terbaru
            </Link>
          </li>
          {CATEGORY_LIST.map((cat) => (
            <li key={cat.slug}>
              <Link
                to="/"
                search={{ q: undefined, category: cat.slug }}
                className={chipClass(category === cat.slug && !query)}
                onClick={() => setOpen(false)}
              >
                {cat.label}
              </Link>
            </li>
          ))}
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
