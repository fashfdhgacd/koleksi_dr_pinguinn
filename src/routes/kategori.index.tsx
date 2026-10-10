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
  "paling-disukai": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAZUlEQVR4nO2UMQ4AIAgDwfj/L+PkpANUCIO9HbwCUYSQ31G00MzsaKYa7jdQgYzHYYFbepSUCaDpRYAbiKT3iKXdAEpIIHP3kEAFboGK9CGBKijQLjBfil9+wE37BChAAQoQ0s4CJnsUK38D62QAAAAASUVORK5CYII=",
  "terbaru": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAZ0lEQVR4nO2WOwoAIAxDrXj/K9dJEPxERclg3lohIQ3FEIQQv2Ojgbv7dTGzRi/eFtlFBugGEnrQK84us0LTE6AbgCso9GKs14PmI+gJyADdwHIJUaFO7wU9ARmAHXjxMamhJyAEnQxkPBQy0dQAqQAAAABJRU5ErkJggg==",
  "jav": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAeklEQVR4nO2V2woAIQhEc9n//2X3SYgl81Ig0Zy3bjbaVK0BcDvkncjMrAYhcsf582QX7gICzLObnb17k4lHyivweieOsuirY40vC7ACS1/0SqYECP1mWa+EPaBlKu2okHITnidAK3WJCXc8UikBoypkf0Q8xQAAUM4Ht9w4JqW4jeoAAAAASUVORK5CYII=",
  "ai-plus": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAaElEQVR4nO2WQQoAIAgEM/r/l+3UJSothMXYOUbguJFVCiEGqqqRazP1XS0GCoi1wXOOZhGRbR14As278dTFjhS3wJ3AwNPVTVrwBChAAQrABa4H0ctIPpEngYhneQU8ARN+Sr8XIHA6kBAwFgwcPBEAAAAASUVORK5CYII=",
  "jilbab": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAeklEQVR4nO2UwQ6AMAhDwfj/v4wXTUzEQOuSHuRdN2jTDcyG4e84WxgR8WjmDveDCzLhL0YgA3fxTKQ6z9gQA1Vz5gnaxMnqu1QCK5EbgOhEi8RvRibwJoAIX8j3gPwPyA3sbGG1CbvIExgDY0BugB5DZuQy5AkMg5wDVDxEA4N6ur8AAAAASUVORK5CYII=",
  "tante": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAkUlEQVR4nO2VQQ6AMAgEqf//M140MbUGdkslRuZaCxMoKFIUf6exF1VVb8Fag+PBF0aJZ0QggWvyURLrfMSGCFjBmRa40YPob6kKRJIuAOEpLVJ+EbICTwmQxCff2gOWCDOG9CPsk7E7IH0KaIG+BcwDnBKIIn0MYQHPIloqEA0kgPwNlwiswC2A9pYdy6J4nR0TDmfikbCl6AAAAABJRU5ErkJggg==",
  "amatir": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAeklEQVR4nO2V2woAIQhEc9n//2X3SYgl81Ig0Zy3bjbaVK0BcDvkncjMrAYhcsf582QX7gICzLObnb17k4lHyivweieOsuirY40vC7ACS1/0SqYECP1mWa+EPaBlKu2okHITnidAK3WJCXc8UikBoypkf0Q8xQAAUM4Ht9w4JqW4jeoAAAAASUVORK5CYII=",
  "viral": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAnUlEQVR4nO2WSwrAMAhEtfT+V7arQij56IxtCcnsAjE+v0Rka4uUmRljf/zpnAbIAIEBMqKHAWrOUaCUEjAKA/QiRTJzRgG88pZE33xcRERVuz7m64F1Acq6j+pau9fqm9AU3I94ATw2aZsQvecGiEQdsZ2nCVGtvYg8fTNXBmoRtaL0Tg2VgdsJM6IwwNNpeWaAhhptt6zP6tZnugAUDUwqfsU7PQAAAABJRU5ErkJggg==",
  "percakapan": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAiElEQVR4nO2UwQ6AMAhDwfj/v4ynXYgwacou8o4s0toxRIZh+DuaHZqZ0YRUX7WuE+JZv3v3YeScIS6SJHCKkoHoT6p1yMBq5ptW67CBNQt+Jqp12EDWrFqHDXQwBraLiL0RPWECjA34pR8kEqWCmKbNAJoYZIB5PXACLBOUK2APbInuZzoM7TxNsEAvZieB6gAAAABJRU5ErkJggg==",
  "kosan": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAfklEQVR4nO2USw4AIQhDxcz9r4wrNwYnBSRs+tYz9Fk/YxBCkqiqZv6fL8IzEmGBMzQqIdlgc6gIPNfVALpKTxuwgLdi9HtIILq/0HZVBJtBl3NxbeBl+N88+LRGhJDb8FUMLbkFVbgb2Fir9DxAm/YGKECBdoH2l7C9AULaWdViS/UiR8kUAAAAAElFTkSuQmCC",
  "colmek": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAXklEQVR4nO3VuQ0AIAwDQML+O5uGDoGwFZQCX8kTp+Bpzcx+F+pGAFiKRdD1elb4aTwVJnbuefjzJpjCzFrpDGRyA+UNUEpvwU2AEi49xacQ9jmWzsAuRPkLzMys3AAuNV+/ZjDm9gAAAABJRU5ErkJggg==",
  "istri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAh0lEQVR4nO2V0Q6AIAhFof//Z3rJzRUNLuicxXktucfbNKKi+DscXSgi8hjGDM+DF2jBGRFIoA/XQqznGgciYA2PfAI3cjH63VADI1kuAOGpFqmfKNjAWwAS3NjrHrBEph5DRAQhdQpaeEZi+TEMC9x3HW1h3waWCoy8iPZrwPMvmCpQFJ/jBNjQY9x5MDU/AAAAAElFTkSuQmCC",
  "live": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAeElEQVR4nO2VUQ7AIAhDZfe/M/uZiXFmjAoxbn2/ClQapBRCyN8RNFBV9ZZMxJ3PHTAqPCPEJaAtPipinU+hF9F3w4t7Yw5cVgymT/UViOdPsRW4A317Uc+XW7CvgN7X8Llv+fQYvibrJ1y+C/bahpaQ1EkghGRxAkFDc9TUbk2mAAAAAElFTkSuQmCC",
  "doggy": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAcklEQVR4nO2UQQ4AIQgDxf//mT15ZGkVExI7Z2gLEscQQgjxOsY2uLunomaw7qw2Z+roADeAAzBTMfVQANac6UsD7Jqj/b1v4HR6RCcMUGWe6YUBmM8EIdLrfQNVW/jTSTdwGiLr7/0Ei90tVB+yEFf4AOmdNA7JNhdwAAAAAElFTkSuQmCC",
  "open-bo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAS0lEQVR4nO3UwQ0AIAhDUTDuvzIuIEqCSQ/+dyZSe8AMAH7nt4GIiPYS93TP6D7eNauDp19kKu3JGyAAAQggD1A+RC9O8o68AQCQWwxNDBpi6TwNAAAAAElFTkSuQmCC",
  "malaysia": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAATUlEQVR4nO3VwQ0AIAhDUTDuvzIuIEqCSQ/+dyZSe8EMwO/8NhAR0V7inu4Z3ce7ZnXw9ItMpT15AwQgAAEIQAB5gPIxenGWd+QNAJBbWA8MIlMQsEgAAAAASUVORK5CYII=",
  "chindo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAaElEQVR4nO2VUQrAIAxD7e5/5+xnA8GC1laLmPeraUJBUwoh5HZkVggAzTAR8zyzQDP2BDEFqM01k965C3xE3w03t2qe+Vib8KxzRJu+AQZIDzDE3c/wZ9VPmN4FZ7VhL0h4AxJCdvACX+FvwwcnGvcAAAAASUVORK5CYII=",
  "gangbang": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAXElEQVR4nO3USw7AIAhFUen+94yjNsbUgr8y8J7hU5GoMSUAOJ14JqmqPgtEZDTvbuAuNLPpWw23suiOfGrzeryVW/Wu7s4WC2/g0x9vwDwB711beUv4PwAAQLgMxqZ3uovcgBAAAAAASUVORK5CYII=",
  "selingkuh": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAhElEQVR4nO2WMQ7AIAwDSdX/fzmduiABCbZhiXeS88FAa5VKBYy7O3L+YYFcAfjbIxZgA2ZmyPltgL41+hauAWwZGC07ZoEJkDawWiK3wAZIGYgOl1lQAIQNZFvRLagAQgZ229AsKAGWBtAWsAU1wNQA6w5nc150AJqhAfbS4/+FSiWaD7NYj5GgTQ8RAAAAAElFTkSuQmCC",
  "barat": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAN0lEQVR4nO3OsREAIAgEQbH/nt8KHAMCAndjhr+1AH5Xr4MkaY9UXXd293mXAAECBAgYDwAYdwCmLgQaqqmMBQAAAABJRU5ErkJggg==",
  "mahasiswi": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAeklEQVR4nO2UwQ6AMAhDwfj/v4wXTUzEQOuSHuRdN2jTDcyG4e84WxgR8WjmDveDCzLhL0YgA3fxTKQ6z9gQA1Vz5gnaxMnqu1QCK5EbgOhEi8RvRibwJoAIX8j3gPwPyA3sbGG1CbvIExgDY0BugB5DZuQy5AkMg5wDVDxEA4N6ur8AAAAASUVORK5CYII=",
  "sepong": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAcUlEQVR4nO2UUQrAIAxD7e5/5+53SLVJUUSW9x2TgG1bE0II8Xes8sjdfWhoRnlS4llwtQhcoA+PAhBNqcDXGDFl9M/q8F6XfVtagA1n9XCBXdxTgFlBRp8WYAYq0mWzcMcdGAVMjVdfQrQIu65CiOO8FrpAFPWVaA8AAAAASUVORK5CYII=",
  "tobrut": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAhElEQVR4nO2VwQ7AIAhDYf//z+ywy2KyWlCjyfrO0DZI0EwI8Xe80hQR8SnontJMFSPjahCqqDVG4plaKsBbMDNetu9aYd7Wo6eDAarmo31m9qTOLF1Vi5rAShRgewDIjEXsaVATqIZg+mAA9pj0zNE9OP8vQOJQeOZvmAkydH6FEDu4AZp/X/gMr9RDAAAAAElFTkSuQmCC",
  "selebgram": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAcElEQVR4nO2UwQrAIAxDzdj//3J2GojYqu1B3PKOUpo0VUsRQvwdjApIMi0CmDpXtnmWe7bQm8JiJr1zEuhRTxhJKGzgFa5Fe2czhFfQCkUTWDZAkpYYAKw+2+2X8DwDXszeesx+o4LPf8VCCCG28wCYJSgnoU9uGQAAAABJRU5ErkJggg==",
  "outdoor": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAaElEQVR4nO2UQQ7AIAgExfj/L28vHppIQgGTPXTnqsAEkTGE+DtWDQSAI5lZOl86wCvcEUkJvIt7RaLzFtjcvjt7Wn3oAvQZoP8C+hPQBVY1MJqBr9A7IAEJSIAuUF5ElaXjQe+AEHQeFno0FHX97f0AAAAASUVORK5CYII=",
  "hotel": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAATklEQVR4nO2WMQ4AIAjEwPj/L+MHREkwucF2JlBuATMA+B2/FUREtIe4p3NGt3mXWS08bZFRSU+eAAIIIIAAAgjIBcrn+MVjskOeAICcBV7xDCYoMdC/AAAAAElFTkSuQmCC",
  "kamar-mandi": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAfklEQVR4nO2VSwrAMAhEY+9/Z7sNFD8jQ0PpvKUkOn4S1xJC/B2bXnR3fzgzg/1drOCZPQNWvAfZM47sFVAFsiCRGKqAKHhlpwhA+9s9D1egyhKtwqgFTCTgewKq6UZfS1sAOt3d88d3ASQg+26nu2C0jrNMX/mImLtACHGcGxBGQCCPZflmAAAAAElFTkSuQmCC",
  "wot": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAoElEQVR4nO3WSw6AIAwEUPD+d65bQ2iZj9FNZ0/mofzG6HQ6ZiIinPHXG+UOQgaspSpCAjzL5pzTQdCAXbmDoADZzB0EDKjKHQQEQMpVxBHAlCuIEqCUs4gU4JQziBTg7u91XDaJ8hc4CPQLHhehgmB+H7QNGQS7duCDCEEoC5c6iiuEumvoy2iHsM4LFrCWZzg08oOkug0/jfsm7HR+zw3H55QS5LbA3QAAAABJRU5ErkJggg==",
  "crot-dalam": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAb0lEQVR4nO2WUQqAMAxDW+9/53oABfOq0sHyvps0y2AswhizO9kVVlVdzDKxHxbcLX4T5Ph6OZlDAYgpmZcC0OVEh67gDx4DdE+v6tdvwAHGA3SeV6Jfv4GIfguKTm6AhlDn0RWopiTs+H/AGDPOCfsfLCD+TQKBAAAAAElFTkSuQmCC",
  "hamil": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAhElEQVR4nO2WSwrAMAhEtfe/s900UFqLGWMQqW+b6Ax+Qoia5u+wN1BE5JWMGc4HB2jCK0YgA3dxTcQ61zgQA1ZyTwumkYvou64KRJJuAGKmtEj5iZwV+BJAhAe13gHLiGcNaw3hQBs0dPhCxVdMpLegDaQbcBG5BXUfoqfY1s9I0+zkBETac9N/vMrpAAAAAElFTkSuQmCC",
  "ojol": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAjElEQVR4nO1VQQ6AIAxjxv9/eZ4wxAztOhGN65GMtoMVSkn8HRLZrKq6E4mEuNzCrXhvbagBz/oj4qyJJWYnjukGKNw5A/QJWClgeOjsWoLMWzB9BtJAGljRQvTn8/6QUGzQyDHRvDTAPDBVtO49M/GdGWi7sDpDujV5kaKRMwBdwZGkR4rWJRKJV2EDgGJgBi/7RIoAAAAASUVORK5CYII=",
  "lainnya": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAASklEQVR4nO3UwQ0AIAhDUTDuvzJuoNSY9OB/ZyS1ByIA4HfZHayqkpdnHvcPdelrU33Q+ZXSlr0BAhCAAPYA8iG6Ock79gYAwG4B7F4MGsPz5gMAAAAASUVORK5CYII=",
};

const cardClass = "flex flex-col items-center justify-center gap-2.5 border border-foreground/35 bg-[#0d0d10] px-3 py-6 text-center text-foreground hover:border-foreground/80 hover:bg-[#141418] active:scale-[0.99]";

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
            width={96}
            height={96}
            className="size-14 [image-rendering:pixelated]"
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          <span className="size-14 border border-foreground/30" />
        )}
        <span className="text-sm leading-tight">{label}</span>
        {typeof count === "number" ? (
          <span className="text-[11px] text-muted">{countFmt.format(count)} video</span>
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
      <section className="relative space-y-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="pixel text-3xl text-foreground sm:text-5xl">Kategori</h1>
            <p className="pixel mt-2 text-xs text-muted sm:text-sm">Jelajahi koleksi video berdasarkan kategori</p>
          </div>
          <Sparkle />
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
