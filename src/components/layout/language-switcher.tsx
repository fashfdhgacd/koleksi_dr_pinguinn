import { usePublicLanguage } from "@/lib/public-ui";
import { useRouterState } from "@tanstack/react-router";
import { languageFamily } from "@/lib/language-family";
import { languageCodes } from "@/lib/public-locale";

export function LanguageSwitcher() {
  const language = usePublicLanguage();
  const href = useRouterState({ select: s => s.location.publicHref });
  const urls = languageFamily(href);
  return (
    <nav aria-label={{ ms: "Bahasa", id: "Bahasa", en: "Language" }[language]} className="flex shrink-0 items-center gap-1">
      {(["ms", "id", "en"] as const).map(code => (
        <a key={code} href={urls[code]} hrefLang={languageCodes[code]} lang={languageCodes[code]}
          aria-label={{ ms: "Bahasa Melayu", id: "Bahasa Indonesia", en: "English" }[code]}
          aria-current={language === code ? "page" : undefined}
          className="px-1 text-xs font-semibold text-muted hover:text-foreground aria-[current=page]:text-foreground"
          onClick={() => { document.cookie = `dp_lang=${code}; Path=/; Max-Age=31536000; SameSite=Lax`; }}>
          {code === "ms" ? "MY" : code.toUpperCase()}
        </a>
      ))}
    </nav>
  );
}
