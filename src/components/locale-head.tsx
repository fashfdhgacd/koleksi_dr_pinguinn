import { hreflangAlternates, listingDocument } from "@/lib/catalog/listing-head";
import { Asset, useRouter, useRouterState, useTags } from "@tanstack/react-router";
import { SITE_ORIGIN } from "@/lib/seo";
import { languageFamily } from "@/lib/language-family";
import { decodePublicPath } from "@/lib/public-locale";
import { pageCopy } from "@/lib/page-copy";
import { isAdFreePath } from "@/lib/catalog/landing";
import { WYNQ_SITE_SCRIPT_SRC } from "@/lib/grid-ads";

export function LocaleHead() {
  const allTags = useTags();
  const nonce = useRouter().options.ssr?.nonce;
  const href = useRouterState({ select: s => s.location.publicHref });
  const rawPath = href.split(/[?#]/)[0];
  const { language, path } = decodePublicPath(rawPath);
  // Ad-free source pages (IndoAV / UserBokep): no Wynq site tag (it can inject pop/push formats).
  const adFree = isAdFreePath(rawPath) || isAdFreePath(path);
  const tags = adFree ? allTags.filter(t => !(t.tag === "script" && t.attrs?.src === WYNQ_SITE_SCRIPT_SRC)) : allTags;
  const total = useRouterState({ select: s => {
    const data = s.matches.at(-1)?.loaderData;
    if (!data || !("ok" in data) || !data.ok) return undefined;
    if (data.type === "home") return data.latest.total;
    if (data.type === "category") return data.total;
    return undefined;
  } });
  const canonical = tags.find(t => t.tag === "link" && t.attrs?.rel === "canonical");
  if (!canonical?.attrs?.href || path.startsWith("/pemilik")) {
    return <>{tags.map(t => <Asset {...t} nonce={nonce} key={JSON.stringify(t)} />)}</>;
  }
  const base = new URL(canonical.attrs.href, SITE_ORIGIN);
  const urls = languageFamily(base.pathname + base.search);
  const url = new URL(urls[language], base.origin).href;
  const original = tags.find(t => t.tag === "title")?.children;
  const params = new URL(href, base.origin).searchParams;
  const pageQuery = Number(params.get("page"));
  const listedPath = pageQuery > 1 && !/\/halaman\/[1-9]\d*$/.test(path)
    ? (path === "/" ? `/halaman/${pageQuery}` : `${path}/halaman/${pageQuery}`)
    : path;
  const listed = params.get("q") ? null : listingDocument(listedPath, language, total);
  const copy = listed ?? pageCopy(path, language, String(original ?? ""), params.get("q"));
  const codes = { ms: "ms_MY", id: "id_ID", en: "en_US" };
  const alternates = hreflangAlternates(base.pathname + base.search);
  return <>
    {tags.map(t => {
      if (t.tag === "link" && (t.attrs?.rel === "canonical" || t.attrs?.hrefLang || t.attrs?.hreflang)) return null;
      if (t.tag === "link" && (t.attrs?.rel === "prev" || t.attrs?.rel === "next") && t.attrs.href) {
        const target = new URL(t.attrs.href, base);
        if (target.origin === base.origin) {
          const path = languageFamily(target.pathname + target.search)[language];
          return <link key={t.attrs.rel} {...t.attrs} href={new URL(path, base).href} />;
        }
      }
      if (copy && t.tag === "title") return <title key="title">{copy.title}</title>;
      if (t.tag === "meta") {
        const field = t.attrs?.property || t.attrs?.name;
        const content = field === "og:url" ? url : field === "og:locale" ? codes[language]
          : ["og:title", "twitter:title"].includes(field) ? copy?.title
          : ["description", "og:description", "twitter:description"].includes(field) ? copy?.description : null;
        if (content) return <meta key={field} {...t.attrs} content={content} />;
      }
      return <Asset {...t} key={JSON.stringify(t)} nonce={nonce} />;
    })}
    <link rel="canonical" href={url} />
    {/* React's hrefLang prop is serialized as hrefLang. Crawlers match the HTML attribute hreflang. */}
    {alternates.map((link) => <link key={link.hreflang} rel="alternate" href={link.href} {...{ hreflang: link.hreflang }} />)}
  </>;
}
