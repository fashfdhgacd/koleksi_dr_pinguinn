import { Link, createFileRoute } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  Camera,
  Eye,
  Flame,
  Home,
  MessageCircle,
  Sparkles,
  ThumbsUp,
  UserRound,
  Users,
  Video,
  Bath,
  Building2,
  Car,
  Flag,
  Heart,
  Hotel,
  Moon,
  Mountain,
  Shirt,
  Star,
  TreePine,
  Tv,
  Waves,
} from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { CATEGORY_LIST } from "@/lib/catalog/categories";
import { RANKINGS } from "@/lib/catalog/rankings";
import { queryCatalog } from "@/lib/catalog/service";
import type { CategoryInfo } from "@/lib/catalog/types";
import { SITE_ORIGIN } from "@/lib/seo";

const countFmt = new Intl.NumberFormat("id-ID");

const ICONS: Record<string, LucideIcon> = {
  "paling-ditonton": Eye,
  "paling-disukai": ThumbsUp,
  terbaru: Calendar,
  jav: Video,
  "ai-plus": Sparkles,
  jilbab: UserRound,
  tante: UserRound,
  amatir: Camera,
  viral: Flame,
  percakapan: MessageCircle,
  kosan: Home,
  colmek: Heart,
  istri: Heart,
  live: Tv,
  doggy: Mountain,
  "open-bo": Shirt,
  malaysia: Flag,
  chindo: Users,
  gangbang: Users,
  selingkuh: Heart,
  barat: UserRound,
  mahasiswi: UserRound,
  sepong: Heart,
  tobrut: Star,
  selebgram: Star,
  outdoor: TreePine,
  hotel: Hotel,
  "kamar-mandi": Bath,
  wot: Waves,
  "crot-dalam": Heart,
  hamil: Heart,
  ojol: Car,
  kosan2: Building2,
};

const cardClass =
  "pixel flex min-h-[8.5rem] flex-col items-center justify-center gap-2 border border-foreground/35 bg-[#111114] px-3 py-5 text-center text-foreground hover:border-foreground/70 active:scale-[0.99]";

export const Route = createFileRoute("/kategori/")({
  loader: async (): Promise<{ categories: CategoryInfo[] }> => {
    const res = await queryCatalog({ type: "categories" });
    if (res.ok && res.type === "categories" && res.categories.length) return { categories: res.categories };
    return { categories: CATEGORY_LIST };
  },
  head: () => {
    const title = "Kategori | koleksidrpinguin.com";
    const description =
      "Pilih kategori di Koleksi Dr. Pinguin: Jav, AI+, Jilbab, Tante, Selingkuh, Bule, Mahasiswi, Tobrut, Outdoor, Hotel, dan lainnya.";
    const url = `${SITE_ORIGIN}/kategori`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { name: "robots", content: "index,follow" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: CategoriesPage,
});

function CatCard({
  to,
  params,
  search,
  slug,
  label,
  count,
}: {
  to: "/" | "/kategori/$slug";
  params?: { slug: string };
  search?: { q?: undefined; category?: undefined };
  slug: string;
  label: string;
  count?: number;
}) {
  const Icon = ICONS[slug] || Moon;
  return (
    <li>
      <Link to={to} params={params} search={search} className={cardClass}>
        <Icon className="size-7 stroke-[1.5]" aria-hidden />
        <span className="text-sm leading-tight">{label}</span>
        {typeof count === "number" ? (
          <span className="text-[11px] text-muted">{countFmt.format(count)} video</span>
        ) : null}
      </Link>
    </li>
  );
}

function CategoriesPage() {
  const { categories } = Route.useLoaderData();
  return (
    <Shell>
      <section className="space-y-7">
        <div>
          <h1 className="pixel text-3xl text-foreground sm:text-4xl">Kategori</h1>
          <p className="pixel mt-2 text-xs text-muted sm:text-sm">Jelajahi koleksi video berdasarkan kategori</p>
        </div>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {RANKINGS.map((r) => (
            <CatCard key={r.slug} to="/kategori/$slug" params={{ slug: r.slug }} slug={r.slug} label={r.label} />
          ))}
          <CatCard to="/" search={{ q: undefined, category: undefined }} slug="terbaru" label="Terbaru" />
          {categories.map((cat) => (
            <CatCard
              key={cat.slug}
              to="/kategori/$slug"
              params={{ slug: cat.slug }}
              slug={cat.slug}
              label={cat.label}
              count={cat.count}
            />
          ))}
        </ul>
      </section>
    </Shell>
  );
}
