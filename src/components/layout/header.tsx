import { usePublicText } from "@/lib/public-ui";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BRAND_LOGO_SRC } from "@/lib/brand-logo";
import { prefetchCatalog } from "@/lib/catalog/client";
import { LanguageSwitcher } from "./language-switcher";
import { DEFAULT_PAGE_SIZE } from "@/lib/catalog/types";

const QUICK_CATS = [
  { slug: "bokep", label: "Koleksi Dr. Pinguin Bokep" },
  { slug: "paling-ditonton", label: "Paling Banyak Ditonton" },
  { slug: "jav", label: "Jav" },
  { slug: "hentai", label: "Hentai" },
  { slug: "ai-plus", label: "AI Drama" },
  { slug: "videy", label: "drpinguin videy" },
  { slug: "paling-disukai", label: "Paling Banyak Disukai" },
] as const;


export function Header({
  query,
  category,
}: {
  query?: string;
  category?: string;
}) {
  const localText = usePublicText();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onCategoriesPage = pathname === "/kategori" || pathname.startsWith("/kategori/");
  const [draft, setDraft] = useState(query ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const submitted = useRef<string | undefined>(undefined);
  const quickActive = Boolean(category && QUICK_CATS.some((c) => c.slug === category));
  // Quick-nav row collapses on scroll-down and returns on scroll-up (or near the
  // top), so the sticky header stops eating ~17-30% of a phone viewport. The row
  // stays mounted — clipped, not unmounted — so chip state and scroll position
  // inside the overflow row survive.
  const [navHidden, setNavHidden] = useState(false);
  const navHiddenRef = useRef(false);
  const lastY = useRef(0);
  const acc = useRef(0);
  useEffect(() => {
    let raf = 0;
    const apply = (hide: boolean) => {
      navHiddenRef.current = hide;
      setNavHidden(hide);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        const d = y - lastY.current;
        lastY.current = y;
        if (y < 80) {
          acc.current = 0;
          if (navHiddenRef.current) apply(false);
          return;
        }
        // Trackpad/mouse-wheel jitter emits many tiny direction-changing deltas;
        // require sustained travel before toggling so the nav can't flap. The
        // thresholds MUST exceed the ~56px scroll-anchoring compensation the
        // browser applies when this row collapses — anything smaller re-triggers
        // the toggle and the nav oscillates forever.
        if (Math.abs(d) < 2) return;
        if ((d > 0) !== (acc.current > 0)) acc.current = 0;
        acc.current += d;
        if (!navHiddenRef.current && acc.current > 100) {
          acc.current = 0;
          apply(true);
        } else if (navHiddenRef.current && acc.current < -80) {
          acc.current = 0;
          apply(false);
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const current = query ?? "";
    if (submitted.current !== current) {
      clearTimeout(timer.current);
      setDraft(current);
    }
    submitted.current = undefined;
  }, [query]);

  function searchTitles(value: string) {
    clearTimeout(timer.current);
    const next = value.trim();
    submitted.current = next;
    void navigate({ to: "/", search: { q: next || undefined } });
  }

  function editSearch(value: string) {
    setDraft(value);
    clearTimeout(timer.current);
    const next = value.trim();
    if (next.length === 1 || next === (submitted.current ?? query ?? "")) return;
    timer.current = setTimeout(() => searchTitles(value), 400);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6">
        <Link
          to="/"
          search={{ q: undefined, category: undefined }}
          aria-label={localText("Koleksi Dr. Pinguin Bokep, M.S.B. (beranda)")}
          className="flex shrink-0 items-center gap-2"
        >
          <img
            src={BRAND_LOGO_SRC}
            alt={localText("Koleksi Dr. Pinguin Bokep")}
            width={32}
            height={32}
            style={{ imageRendering: "pixelated" }}
            className="size-8 rounded-none bg-white object-cover ring-1 ring-border [image-rendering:pixelated] sm:size-10"
          />
          <span className="pixel hidden text-[0.7rem] leading-none text-foreground min-[400px]:inline sm:text-xs">
            DR. PINGUIN
          </span>
          <span className="pixel hidden border border-foreground/40 px-1.5 py-0.5 text-[9px] text-muted sm:inline">
            18+
          </span>
        </Link>

        <form
          className="relative min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            searchTitles(draft);
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted sm:left-3" />
          <Input
            value={draft}
            onChange={(e) => editSearch(e.target.value)}
            placeholder={localText("Cari judul…")}
            className="pixel h-10 rounded-none border border-white/40 bg-black pl-9 pr-9 text-xs shadow-none placeholder:text-white/45 focus-visible:border-white/80 focus-visible:ring-0 sm:h-11 sm:pl-10 sm:pr-10 sm:text-sm"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label={localText("Cari judul")}
          />
          {draft ? (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center text-muted"
              onClick={() => editSearch("")}
              aria-label={localText("Hapus pencarian")}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </form>

        <LanguageSwitcher />

        <Button variant="ghost" size="icon" asChild aria-label={localText("Semua kategori")} className="size-10 shrink-0 rounded-none border border-white/40 hover:border-white/80 hover:bg-transparent sm:size-11">
          <Link to="/kategori">
            <LayoutGrid className="size-5" />
          </Link>
        </Button>
      </div>

      <nav
        className={cn(
          // overflow-anchor:none — without it the browser's scroll anchoring
          // compensates for the collapsed row's height change by shifting
          // scrollY, which re-triggers this toggle and makes the nav oscillate.
          "mx-auto max-w-[1600px] overflow-hidden px-3 [overflow-anchor:none] transition-[max-height,opacity] duration-200 ease-out sm:px-6",
          navHidden ? "max-h-0 opacity-0" : "max-h-20 opacity-100",
        )}
        aria-label={localText("Navigasi cepat")}
        // Clipped chips must leave the tab order and AT tree while hidden.
        inert={navHidden}
      >
        <ul className="-mx-3 flex gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
          <li className="shrink-0">
            <Link
              to="/"
              search={{ q: undefined, category: undefined }}
              className={chipClass(!query && !category && !onCategoriesPage)}
            >
              {localText("Terbaru")}
            </Link>
          </li>
          <li className="shrink-0">
            <a
              href="https://www.indoav.com/"
              target="_blank"
              rel="noopener"
              className={chipClass(false)}
            >
              IndoAV
            </a>
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
                {localText(cat.label)}
              </Link>
            </li>
          ))}
          <li className="shrink-0">
            <Link to="/kategori" className={chipClass(onCategoriesPage && !quickActive)}>
              {localText("Kategori")}
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}

function chipClass(active: boolean) {
  return cn(
    "pixel inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-none border px-3 text-[11px] transition-colors duration-150 sm:text-xs",
    active ? "border-[#c8c8c8] bg-[#c8c8c8] text-black" : "border-white/35 text-white/75 hover:border-white/80 hover:text-white",
  );
}
