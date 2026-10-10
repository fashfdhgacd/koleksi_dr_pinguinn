import { Link, createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { CATEGORY_LIST } from "@/lib/catalog/categories";
import { RANKINGS } from "@/lib/catalog/rankings";
import { queryCatalog } from "@/lib/catalog/service";
import type { CategoryInfo } from "@/lib/catalog/types";
import { SITE_ORIGIN } from "@/lib/seo";

const countFmt = new Intl.NumberFormat("id-ID");

const ICONS: Record<string, string> = {
  "paling-ditonton": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAcUlEQVR4nO2V2wrAIAxD7f7/n7tXGSo5xTFkOY9Sk3irrRljzN+JyqTMzKlgBNJExSvjahA5wNN8ZKDUlAL0wr0oHR9x7TAndTgAESUrxwHe4pwAyvaSs5cDqLe7+grO6AMzg6Xw7k6oBqF/gTHGfM4N2WJUFKOg/TIAAAAASUVORK5CYII=",
  "paling-disukai": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAWUlEQVR4nO3QMRYAEBADUev+d149msR6CjM9frRG9HvhHszMXC6LkO/rLqDicRuwW+9W8gPuegtQud4CzJ2slwHV62XA3Ol6CXBjvQS4FQAAAAAAeA4get4ALvsUKmt6tnYAAAAASUVORK5CYII=",
  "terbaru": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAUElEQVR4nO2WSwoAIAgFNbr/lW0b9BHBcNHMVuENIqgIAPyOngpmZulhqkteyw6JgkC5QPcadosT5bbQ5RNAAAEEEEDAvQUvHpOZ8gkAlDMAb3EMJmNa9CgAAAAASUVORK5CYII=",
  "jav": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAeklEQVR4nO2V2woAIQhEc9n//2X3SYgl81Ig0Zy3bjbaVK0BcDvkncjMrAYhcsf582QX7gICzLObnb17k4lHyivweieOsuirY40vC7ACS1/0SqYECP1mWa+EPaBlKu2okHITnidAK3WJCXc8UikBoypkf0Q8xQAAUM4Ht9w4JqW4jeoAAAAASUVORK5CYII=",
  "ai-plus": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAW0lEQVR4nO3VOQ4AIAgFUTHe/8pY2bmgmBDjvJoI/AJTAvA7WRWoqrqbiAz7ZO/jXsVaONtixJLeOwk0lq120gpPgAEYgAHCB9g+RCcneeadBG58yz3hCQAIVwEUdxAq0WhryQAAAABJRU5ErkJggg==",
  "jilbab": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "tante": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "amatir": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAeklEQVR4nO2V2woAIQhEc9n//2X3SYgl81Ig0Zy3bjbaVK0BcDvkncjMrAYhcsf582QX7gICzLObnb17k4lHyivweieOsuirY40vC7ACS1/0SqYECP1mWa+EPaBlKu2okHITnidAK3WJCXc8UikBoypkf0Q8xQAAUM4Ht9w4JqW4jeoAAAAASUVORK5CYII=",
  "viral": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAnUlEQVR4nO2WSwrAMAhEtfT+V7arQij56IxtCcnsAjE+v0Rka4uUmRljf/zpnAbIAIEBMqKHAWrOUaCUEjAKA/QiRTJzRgG88pZE33xcRERVuz7m64F1Acq6j+pau9fqm9AU3I94ATw2aZsQvecGiEQdsZ2nCVGtvYg8fTNXBmoRtaL0Tg2VgdsJM6IwwNNpeWaAhhptt6zP6tZnugAUDUwqfsU7PQAAAABJRU5ErkJggg==",
  "percakapan": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAbklEQVR4nO2UMQ7AIAwDE9T/fznsiIRiGTrUtyLwyUDMhBB/x6vFiAhakPs0q90Ir857Vhszc0a4WdHALSQgAQl8LrAcROyJOJI2wJiAb86DQrJWEGnaG0AbgwSY1wM3wJKgXAH7wW5x+psKcZwOifEcLxEwhv8AAAAASUVORK5CYII=",
  "kosan": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAfklEQVR4nO2USw4AIQhDxcz9r4wrNwYnBSRs+tYz9Fk/YxBCkqiqZv6fL8IzEmGBMzQqIdlgc6gIPNfVALpKTxuwgLdi9HtIILq/0HZVBJtBl3NxbeBl+N88+LRGhJDb8FUMLbkFVbgb2Fir9DxAm/YGKECBdoH2l7C9AULaWdViS/UiR8kUAAAAAElFTkSuQmCC",
  "colmek": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAeklEQVR4nO2V2woAIQhEc9n//2X3SYgl81Ig0Zy3bjbaVK0BcDvkncjMrAYhcsf582QX7gICzLObnb17k4lHyivweieOsuirY40vC7ACS1/0SqYECP1mWa+EPaBlKu2okHITnidAK3WJCXc8UikBoypkf0Q8xQAAUM4Ht9w4JqW4jeoAAAAASUVORK5CYII=",
  "istri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "live": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAeklEQVR4nO2V2woAIQhEc9n//2X3SYgl81Ig0Zy3bjbaVK0BcDvkncjMrAYhcsf582QX7gICzLObnb17k4lHyivweieOsuirY40vC7ACS1/0SqYECP1mWa+EPaBlKu2okHITnidAK3WJCXc8UikBoypkf0Q8xQAAUM4Ht9w4JqW4jeoAAAAASUVORK5CYII=",
  "doggy": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "open-bo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAfklEQVR4nO2USw4AIQhDxcz9r4wrNwYnBSRs+tYz9Fk/YxBCkqiqZv6fL8IzEmGBMzQqIdlgc6gIPNfVALpKTxuwgLdi9HtIILq/0HZVBJtBl3NxbeBl+N88+LRGhJDb8FUMLbkFVbgb2Fir9DxAm/YGKECBdoH2l7C9AULaWdViS/UiR8kUAAAAAElFTkSuQmCC",
  "malaysia": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "chindo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "gangbang": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "selingkuh": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "barat": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "mahasiswi": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "sepong": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "tobrut": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "selebgram": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAeklEQVR4nO2V2woAIQhEc9n//2X3SYgl81Ig0Zy3bjbaVK0BcDvkncjMrAYhcsf582QX7gICzLObnb17k4lHyivweieOsuirY40vC7ACS1/0SqYECP1mWa+EPaBlKu2okHITnidAK3WJCXc8UikBoypkf0Q8xQAAUM4Ht9w4JqW4jeoAAAAASUVORK5CYII=",
  "outdoor": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAfklEQVR4nO2USw4AIQhDxcz9r4wrNwYnBSRs+tYz9Fk/YxBCkqiqZv6fL8IzEmGBMzQqIdlgc6gIPNfVALpKTxuwgLdi9HtIILq/0HZVBJtBl3NxbeBl+N88+LRGhJDb8FUMLbkFVbgb2Fir9DxAm/YGKECBdoH2l7C9AULaWdViS/UiR8kUAAAAAElFTkSuQmCC",
  "hotel": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAfklEQVR4nO2USw4AIQhDxcz9r4wrNwYnBSRs+tYz9Fk/YxBCkqiqZv6fL8IzEmGBMzQqIdlgc6gIPNfVALpKTxuwgLdi9HtIILq/0HZVBJtBl3NxbeBl+N88+LRGhJDb8FUMLbkFVbgb2Fir9DxAm/YGKECBdoH2l7C9AULaWdViS/UiR8kUAAAAAElFTkSuQmCC",
  "kamar-mandi": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAfklEQVR4nO2USw4AIQhDxcz9r4wrNwYnBSRs+tYz9Fk/YxBCkqiqZv6fL8IzEmGBMzQqIdlgc6gIPNfVALpKTxuwgLdi9HtIILq/0HZVBJtBl3NxbeBl+N88+LRGhJDb8FUMLbkFVbgb2Fir9DxAm/YGKECBdoH2l7C9AULaWdViS/UiR8kUAAAAAElFTkSuQmCC",
  "wot": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "crot-dalam": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "hamil": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "ojol": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAjElEQVR4nO1VQQ6AIAxjxv9/eZ4wxAztOhGN65GMtoMVSkn8HRLZrKq6E4mEuNzCrXhvbagBz/oj4qyJJWYnjukGKNw5A/QJWClgeOjsWoLMWzB9BtJAGljRQvTn8/6QUGzQyDHRvDTAPDBVtO49M/GdGWi7sDpDujV5kaKRMwBdwZGkR4rWJRKJV2EDgGJgBi/7RIoAAAAASUVORK5CYII=",
  "lainnya": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAeklEQVR4nO2V2woAIQhEc9n//2X3SYgl81Ig0Zy3bjbaVK0BcDvkncjMrAYhcsf582QX7gICzLObnb17k4lHyivweieOsuirY40vC7ACS1/0SqYECP1mWa+EPaBlKu2okHITnidAK3WJCXc8UikBoypkf0Q8xQAAUM4Ht9w4JqW4jeoAAAAASUVORK5CYII=",
};



const cardClass = "flex flex-col items-center justify-center gap-1 min-h-[88px] rounded-xl border border-white/10 bg-[#111113] px-3 py-4 text-center text-foreground transition-all hover:border-white/30 hover:bg-[#1a1a1d] active:scale-[0.98]";

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
  const src = ICONS[slug];
  return (
    <li>
      <Link to={to} params={params} search={search} className={cardClass}>
        {src ? (
          <img
            src={src}
            alt=""
            width={28}
            height={28}
            className="mb-1 size-7 [image-rendering:pixelated] opacity-80"
            style={{ imageRendering: "pixelated" }}
          />
        ) : null}
        <span className="text-[13px] font-medium leading-tight sm:text-sm">{label}</span>
        {typeof count === "number" ? (
          <span className="mt-0.5 text-[11px] text-white/40">{countFmt.format(count)} video</span>
        ) : null}
      </Link>
    </li>
  );
}

function Sparkle() {
  return (
    <svg viewBox="0 0 90 28" className="h-7 w-28 text-foreground/80" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M14 2v10M9 7h10M14 7l4 4M14 7l-4 4M14 7l4-4M14 7l-4-4" />
      <path d="M34 14h8M46 14h5M55 14h4M63 14h3" />
    </svg>
  );
}

function CategoriesPage() {
  const { categories } = Route.useLoaderData();
  return (
    <Shell>
      <section className="relative space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Kategori</h1>
          <p className="mt-1.5 text-sm text-muted">Jelajahi koleksi video berdasarkan kategori</p>
        </div>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
