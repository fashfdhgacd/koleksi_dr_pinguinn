import { overviewCopy } from "@/lib/catalog/overview-copy";
import { Asset, useRouter, useRouterState, useTags } from "@tanstack/react-router";
import { SITE_ORIGIN } from "@/lib/seo";
import { languageFamily } from "@/lib/language-family";
import { decodePublicPath, languageCodes } from "@/lib/public-locale";
import { pageCopy } from "@/lib/page-copy";

export function LocaleHead() {
  const tags = useTags();
  const nonce = useRouter().options.ssr?.nonce;
  const href = useRouterState({ select: s => s.location.publicHref });
  const { language, path } = decodePublicPath(href.split(/[?#]/)[0]);
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
  const overview = !params.get("q") && !params.get("page") ? overviewCopy(path, language, total) : null;
  const copy = overview ?? pageCopy(path, language, String(original ?? ""), params.get("q"));
  const codes = { ms: "ms_MY", id: "id_ID", en: "en_US" };
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
    {(["ms","id","en"] as const).map(l => <link key={l} rel="alternate" hrefLang={languageCodes[l]} href={new URL(urls[l], base.origin).href} />)}
    <link rel="alternate" hrefLang="x-default" href={new URL(urls.ms, base.origin).href} />
  </>;
}
