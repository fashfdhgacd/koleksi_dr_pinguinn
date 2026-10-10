import { Link, createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { CATEGORY_LIST } from "@/lib/catalog/categories";
import { RANKINGS } from "@/lib/catalog/rankings";
import { queryCatalog } from "@/lib/catalog/service";
import type { CategoryInfo } from "@/lib/catalog/types";
import { SITE_ORIGIN } from "@/lib/seo";

const countFmt = new Intl.NumberFormat("id-ID");

const ICONS: Record<string, string> = {
  "paling-ditonton": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAACWklEQVR4nO2d23LDIAwFcaf//8vuS5KhHt8CSEfCu0+dpgYa6QhJ2ONSErO+UK+jhx/1Ap7Ool5AC0devyxLuv8HBUA77AEQnxm81BIUIAYDiMEAYkwNUMf+bHuB11p/Rw62t+h3cfT+rP6bjIXTaAhBYkw98EwR0VnXdfVY69AQNAPbfasUW6cxDUH1wpcXlvNlBAWU41DpkTiwCYsxDwkecXQkmROHqfAqxAhBYjCAGAwAAAAgIlyBYZ1/RyuqurOgbCdd0SANFdMsx5E9E+v+i8X4o3pcKEBMt5f1eIKi87id89v5Rt+ZjQLESFKyCD33UUroXXeaI8lvUt1ouf4ZaQwQjVFGDi/7niKvdXxPBbEJi3E7lP83aafn711/pZSrOVVKQAFizCzs5fnfXN86RtpbE+Ga4Za1ynTqWwXvjJ1FCShATHgDtN5VnaUaHlYJexdZvdzp5Xg8XpWyFZHFu+/QZQB1Ge/FVgn1z4/phpYyp3G7DFB/Ids4OdOXZan08FnQ7GAAMakq4Z51tIxHJfwA6IbeGINu6MRwInZyPSdiD0CigM/kDg27Fs+/e+0IzFsRe9VydDyr+PC9oL1G2N1rMpDm3tDRBvBMNc/gESUxPB/QOF+Y84BM8TYiIb48ayVEPrmjEBODAcSEkGGNdUYVJfS8QQEAAACzQq/oHLKgA7ycBgOIwQBieImPmPBHkt5YPANwBm9REsNLfMr1GzS2vx85N5uwGN6gscFbtShgdrKmn1TC8GwyqhaeRtb9pYY9QEyK3HzLkddnqTVqUAC0wx4A3fwBPUfgWJ4F2uMAAAAASUVORK5CYII=",
  "paling-disukai": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAACPElEQVR4nO2d226EMAxEoer//zJ9WSrEBpQQJ2Obcx4rFdhMxhNzXRb4YvswY18/M3YCAADVkAEvAgHEIIAYBFjua/7oPFhHbTgSNQO8ruuQsUKAAyUhRg38//atNrQf/OgD7uF4jD1lZf+NFr/59+k/juZugDyL3IpbAUZwFK4kYmsJspgIIVdBMzvV0XQ54DgI57p4/rtnzrW8lBWjfkdIB2SiywHHWRFhFXTF6Dp/Bw4QgwBiXrUMrWVmGTUTIGLt9wAlqABXxF4EGVAgZAZYkeUUQy2UIDEIIAYBxCCAGDfNU0v4Zmr6cIAYBBCDAGLkjVhP42XZtKlyBQeIQQAxkhLk8XyP6po2DhCTRoD1g/o4WkkjQFSmZoDH2q9G3gd4gT7gpQxzwOxyE/XWSBzQSe9ES5MBV7fHP93OLHDAidkPf4RyQGmWW838WkoPoPQ8lIIDxIRygAfOs3vbtq0nN3CAmBAOuKvzVw/Y9e5rFjhAzDC1LWdi5nuGcIAY9xlQO/stMkDhHrcCKK4dKE7ouRWgltmdsDVkgBgEEON2GdpK1BDGAWLSOGCHRgyaSLMM3XniPKVrcMCifQfdMAfUvpXQChoxeAQCiJGEz4hy0RPGhPCLcdO0WLsiSkOGA8S4nSUzcsIDOCAbmd5sPgMcAACZIAPaIAPEmAhwN+Nxwz3m3xH72oHD5scTlCAxTbOz9HWh5h1O+DJRJHCAGDJADKugDBwH+dyIIcBk6ITbIIQBIBNkQBtkgJg/sphccbthdJUAAAAASUVORK5CYII=",
  "terbaru": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAACFElEQVR4nO2cwXaDIBQFY0///5ftol2gjajwcCDMbBOVk8l9DxVdXgGs67oefbYsyxJxjBYcjfvJMX89dSB5jwJgiqOWKzuHB+ugHPU2bhMAowAYBcB8R+3oqE6W1Nyn6GHMJgBGATDZEhQdxZ7LUY6WZ/omAEYBMAqA2fSAUWs0yf43u9sTNl++I6Ck+fQguPW47+7fEgSjABgFwBT3gH876uC6yl1ajNkeMBhhCZBfTMBgKABGATAKgFEAjAJgTm/K97CYqlcipu0mAEYBMAqAUQCMAmAUABO2NrSGmkeFqG2jMAEwCoBRAIwCYBQA08UsqGbWQW0bhQmAUQCMAmAUAKMAGAXAhExDa58i9GKcYCgARgEwCoBRAMzpAxo9XLDqlYjfywTAKACmi/sBoxJRnk0AjAn4I2KpeUkiTADMtBfjWjwTne7zahosQW+4U0pqRVqCYBTQiKvJmKoEtXj9ZLrdfv9XesJUAkopaa4puW1CBNSeEY6+uq2Gj0/Ak/d9j8pR7s2KNmEYBcB8fAlKebJf5GZHKSYARgEwpyWodg4seUwAzFRNOIKzazyuihiMWwkY6cWuo/QrEwBjD7hAyzRtBOwPNFLJGRVLEIwCYKbqAU+e1YfcEx5lKjcyliCYqf7hrW9Plqy6MAGv9tPtnGAFvNiGPFUJSolapFVb1kwAjAJgpi1BKVFN2CdkBkQBMD8GteT64LwhOAAAAABJRU5ErkJggg==",
  "jav": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAC6ElEQVR4nO2d23LDIAxEQ6f//8vuQ5Oph2JbwIoVsOetHccXpF0BhuT1Ek0cb3rP84W4GdGOAkBGASCjAJBJ7BuYibuim1JqakspgIwUYOCc+Z9M//zv6m8rUgAZKaAAYoB15k4V38gLIRnZCEzCBoBJHizPGkANADrLW6/FVAdVliMDcIc1AB5BnMKCWh8uSoDvGKKA3oZgBODpmq2enxNGAR4+fHXOSMrQQIyMqwVdZVrEPnltgUVZkBRABp6JUfvbNYxUrhRABhqASL0LD1ArIc5AJLWC7Vzh/WyyIDJuA7HZM/9DPtuJpisAq3v+E4ixgCyIDNSCVrGdEudnQyq/OgC7206JHiuSBZGBWNDK1lMC2TOSAsgoAGTMFqTi+0xp+coTUgCZ5iK8W+EtgSjGUgCZoasiLJliXQ5i/Xzt8dbPohxACiCjAJC5tSCvJeKl86IkfRzHYT3X03EppdTaBtb5ISmATHURnq37iX6jVXr+nqnqMGtDn/AYid/ZxKiRvyyIjAJAZuoApDfWYxHX6z1",
  "ai-plus": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAACWUlEQVR4nO2dwXKEIBAFNZX//2VziVVbrusCAj1g9ymHLLg83jAMhqxLZ7Zt2/af13Vda7RVq50abeXy07MzeUcBYBQARgFgFABGAWB+yc5rpZF3+yfRATAKAINYf1nO7Z8bikpD2LFvKgQuiw7AQRfhIy1rMhEW3DMwAV4HmBocMvTsGIJgQoSgfSb2ckKEmb+jA2AUAKaZFaNmHaW0Cls6AEYBYKrb6qrEMEpYunre2qFIB8AoAEyzjdhZqSHSBuiKs+dtFT51AEzXRXg0XIQfgALAKADMWxaUutqPGtdbUTpuOgDmzQFXM/tV5da5/acZldNfTu5e+j3uZko6AEYBYKrZ7rKTBmEjpc27IahHCNMBMEXFuNSFmuZbMa1k1lqKmAwFgAnxYtay5Ieu0c4YPqEDYMILsP5DP0crwgswOwoAgwuw/XPn8zWfpzdhsqAjx7g/2stdqRQfyDyVu+PjgUwwsg5kUpjdQdaCJgNbhL85JcdJI5cldACMAsAoAIwCwITbCacupLOkuzoAprsDarzxtv/+sa1jOpqT6lIpbJEAs9i/hFoTaMcQBJPlgJR3a2Z3x6fvWxrOdABM90W45mL3ra0RakP+hcxNzjKuqzH0QCYY1Q9knopp6KAoAIwCwHhbygnelvIgmjngbGs+Spmi5/PqABgFgPHi1kS8uHVSFAAmVF6ee6iRs7+IcP57hg6AUQCYEC9m9c6YIpVGdACMAsD4n/QKPl8THQDTXfma9zHfXUwj3HOtA2AUAAbdB9B5eISDIh0AowAwCgCjADAKAKMAMH8XzUD2YkyNCAAAAABJRU5ErkJggg==",
  "jilbab": "data:image/png;base64,PLACEHOLDER_FOR_BREVITY",
  "tante": "data:image/png;base64,PLACEHOLDER_FOR_BREVITY",
  "amatir": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAACoUlEQVR4nO2b25KjMAxE8Rb//8uel6WKIrbxRVJLuM/LpDLEQKTWzeQ4CCGEEEIIMSchT55zzlJrpZSg9zLLP/QF7A7EayQ9/0k0JVABYEy9RcPzL4+vre1dEVQAGBoADA0AhgYAc14vVhKkh0Tn4RpmoALAnO+H+Oap3GhKOCVq82uNaDfvgfAKiG70JQNEv3kPmCpA02BRR9vn82RvN0Kvl0VEAZrjZQSWRQX7ADBVC/fU1549f8Z7ESNtKgCMmJd4oeatrevuLUQ0lEAFgOm2qHfPP471PIVQAhUA5tWS3j1/JuaPrqk5caUCwFQ7Ye+eX2Ok2ql9hp3wRvwowOMwTkKNret+e7hLEyoADA0AhgYAE35P2AO9uaOUh6gAMNsoIOecV7vm0e3bnmvYxgBWjA4Eh6eH3voAzVnQfQ2JH4KU1mMOABM+BJW86v56ZT9A4pru66aU0vW/6294A2hiEW7D54An0nvCI7F/5Lu7jmUOEGI26X8uBL3lhN7PrlBTVKkPoAKEKRm6ZXwaAMznQtCdlSGZFcMGsNw12uFReIYgMFMhqKf2XZ0cRqVU6bTufdgAz8V7w8QO4WSGTydhS0pzntIxz/eWDPB2olZL71ERiMdTqICjzylqxrl/tnZMK2fSAAVMpqD/z6H6Q+3RtvwrjGxLUgE3ekbWtXDS2vRvQQMY81PGPw/YpWFaYaXJ5DgaiHgf8AUkNmpWCosfAyCaEQ+U7teiYmMIAlM1wL2zI3pQAWBeDUAl6EIFgOkuQ2dUEKmSQqncbWjxbDxJYy03Yqj6+Sssf1HaP6K2OH8vGo7FJAzGhQJ6+GpYowLAiHoVsnKJqhAqAIyK10SvTCyhAsCoek+E5/PRUAFgTDyP44o6VAAhhBBCCCH78QftuIEhsWxFpgAAAABJRU5ErkJggg==",
  "viral": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAB+ElEQVR4nO3cwW6EMAxF0VLN//8y3VYoDAQcXwfuWVYqg/pqx0CY5WdC67qurZ8vy7Jkn8tdv/QJvJ0BwAwAZgAwA4AZAGyasW1v9Nwzy0hqBcAMAGYAMAOAGQDMAGClR7Xe0XNP5ZHUCoAZAMwAYAYAMwBY2emg5epUdGYK2h47a3KyAmAGADMA2CvWgK1Wf28dO2MdsAJgBgD7UB98Zuw703L+/15Ui2odb1Q7sgJgBgDDWtCR6HZCf86ekhVA/1EylQzgTQwAlnolHNlajsbC6DbmGPpQBgAzAJgBwMpeiLVU3mB1lRUAm6oCeoy8SxrJCoAZAAxb1K60hahFmPzsLSsAVn4R/vafN3o3W8bYOyQAapvfjGxBMAOAlV8DKopssVYAzABgodPJ0QXO2fszPaPnlWN8O172yxxWAMwAYAYASx1DK9+XPzLq3K0AmAHAbrWgjJ1uo9tWxMh7hxUAMwCYAcAeezc04wW7CFYAzABgBgDD1oDM+btnPci+XWIFwAwAZgCwx14H9KJulVsBMAOA3WpB25Fuxide9FZ1KwD2ukW4WpVaAbDUnXFfTwR6JHmFa8CDGABs2JOiqHZUpQX5luRDGQDMAGApuwWq9PFefnv6CxgADNmwVLUlERu4rACYAcAMAIZvWqXXA3rjrhUAMwDYH3tVvLRaA+uKAAAAAElFTkSuQmCC",
  "percakapan": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAACUUlEQVR4nO2c246DMAxEy6r//8vsSyshyiUXJ2Obc54BAeMZJxB4vUDK0rLTuq6r9YmMYlmWpmucxZ/6BJ4OAohBADFF+Rgp80vw1BdwgJi31YE8VFVEp+IAMT8OiFhFteyvUene5gjyEDl79ucUoZiIIDEIIAYBxCylOekx82vxeK04QAwCiEEAMZfzgAy5v8XjPOHUAdluvleIIDEIIAYBxCCAGAQQgwBiul5Jno2jz4awo7e/2qeG1mO0DN1xgBgEEIMAYsyWpajx8Fyn5WV/aAE83PReugSo7fqjt49IaAfcMVpACwemFkDNkUD7oggjQIa8PyKMAHco+oXFGzbmAWJcOyBj7OyvybUAd3gbprZEEhEkBgHEnEaQ6iOGO9t6i51eQvcA72yL5aywiCAxIRyQLXa24AAxb48LVp9EcQSVPNmDeoggMSGacCk1Lp2xRqmENA44u0Hee9qPA2orAPpI4wArZhfa8B4QzTmzR3Y4QEyaUVDUNUpDBIgWO0qIIDEIIGZqDyjJ0afFl5kAI2/c9tjZHgCmGQV5pKQohwuQrWKtGfKV5EiyxdGlAE9riArMIyhDVc7k8ma1OMBaAI8/2ruidmEZEzExCCCmuwd4tf6M87IYpOAAMe5nwtEXjt05Me1vK2f+cqYHIkgMAogJGzFfRvaEuziyWC+LA8QggJjwEWRBSYwdRQsRlAAEEEME7aiJIyIoATjgghkvpHCAMeuH0u0RQAwRVEhtHJVGEQ4QgwBiEKCQ5YP1cRFADE24k94v6HGAGASAZ/MPW1P8+67m8T4AAAAASUVORK5CYII=",
  "kosan": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAACqElEQVR4nO2d23KEIBBEYyr//8vmJVa2XMABhmlYznlMuYo23VwEc3wtyHmeZ+rvx3Ec0WXp5VtdgN1BADHLWDYXOylWiiIcIAYBxExt1VLsvMaM9bjea3qc/w4OEIMAYqaLoKcIeLJ8bxwRQZvxoy7AbFw1uteJ5ut5nKSXETc7Mspay5RiighaaeTqzRQC7Iy05kXZvOU6W0XQziCAmPAIirJ277WJoE2YYiAW1Q2treG10xIthAgQcSMevJYzqlIQQWKGqqxscGtIlfMprrzKPiyCVomdHFHlJ4LEuEfAKrGTwrLi7jqGcUAg5x8jzo0AYmSzjbMTtRIPB4hBADHN1rFYdMXouTM6inCAGAQQ475w9RNiJ8eIOMIBYtwm4z655l/UvNCx8ijA6rOaKqwvd1wiaIfaP4quCNr5wVsX8T6RFYDo8aMUR/SCxFRH0F1BxUqCGUjdd0tq4ABHjj9qftPcCNNG/NPzmhIHiMk6YKc896bm2eEAMcPXhnq1FaVaNao9ikgBHCAGAcSE7g8obYZr2ShnvUYN0d1rHCAGAcQggBgEEIMAYkJ7QaUexq6TezhAzMeNA1YDB4hBADEIIKbYBtwzmJc0/uAAMVW9oN49sowD3sEBYprHAV5rI5XMsKisKEDuIddEEQ13GSJIjEmAliV3YKN7LignzMiPHHkxQ3m6ImjkV0R24c0BpZpr2aSGIHXQCIt5c0Cq65nqdt6/q1mq+TNk7azgADFVAtDo+mPaH9D60ImeZ4ggMaaB2L1hzs0NvR4LNnCAmKqpiNweYWp9OzhAjMvnaiyf/IU0OEAMAohBADHmjK4dDUfkf9S0iHXhcMs9L7NR+0LdsFvWNvGpgoWY4v+I1RI9IztywIkDxJgFsKrPEpY6hkfQp4nhfT+/7F11AeblAW0AAAAASUVORK5CYII="
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

function Drip() {
  return (
    <svg viewBox="0 0 72 52" className="h-16 w-24 text-foreground/70" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M2 10c8 0 10 8 16 8s8-8 16-8 10 8 16 8 8-8 16-8" />
      <path d="M16 18v12c0 4 3 6 3 6M34 18v16c0 4-3 6-3 6M48 18v10M56 18v14" />
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

        <div className="pointer-events-none absolute -bottom-2 right-0 hidden sm:block">
          <Drip />
        </div>
      </section>
    </Shell>
  );
}
