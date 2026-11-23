import { langSwitchForPath } from "./catalog/en-landing.ts";
import { decodePublicPath, localizedPath } from "./public-locale.ts";

export function languageFamily(href: string) {
  const url = new URL(href, "https://local.invalid");
  const { path } = decodePublicPath(url.pathname);
  const landing = /^\/(en|cari|genre)(?:\/|$)/.test(path);
  const pair = landing ? langSwitchForPath(path) : null;
  const page = path.match(/\/halaman\/([1-9]\d*)$/)?.[0] ?? "";
  const suffix = url.search + url.hash;
  const base = path.startsWith("/en") && pair ? pair.idHref + (pair.idHref.split("/").length > 2 ? page : "") : path;
  const english = path.startsWith("/en") ? path :
    pair && (pair.enHref !== "/en" || /^\/(cari|genre)\/?$/.test(path)) ? pair.enHref + page : localizedPath(base, "en");
  return { ms: localizedPath(base, "ms") + suffix, id: localizedPath(base, "id") + suffix, en: english + suffix };
}
