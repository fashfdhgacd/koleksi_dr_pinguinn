import { cleanDisplayTitle, editorialWatchDescription, withoutDomainSuffix } from "@/lib/seo";
import type { VideoDetail } from "@/lib/catalog/types";
import type { PublicLanguage } from "@/lib/public-locale";

export function watchSummary(item: VideoDetail, language: PublicLanguage, translate: (text: string) => string): string {
  const authored = editorialWatchDescription(item);
  if (authored) return authored;

  const title = cleanDisplayTitle(withoutDomainSuffix(item.title));
  const category = item.category?.trim();
  const label = category ? translate(category) : "";
  const facts = [];
  if (item.duration && item.duration > 0) {
    const seconds = Math.floor(item.duration);
    const unit = (value: number, unit: "minute" | "second") =>
      new Intl.NumberFormat(language, { style: "unit", unit, unitDisplay: "long" }).format(value);
    const parts = [];
    if (seconds >= 60) parts.push(unit(Math.floor(seconds / 60), "minute"));
    if (seconds % 60) parts.push(unit(seconds % 60, "second"));
    if (parts.length) facts.push(parts.join(" "));
  }
  if (item.quality?.trim() && item.quality !== "—") facts.push(item.quality.trim());
  const detail = facts.length ? ` (${facts.join(", ")})` : "";
  const opener = label ? translate("Tonton “{title}” dalam koleksi {category}{detail}.")
    : translate("Tonton “{title}”{detail}.");
  const values: Record<string, string> = { title, category: label, detail };
  const summary = opener.replace(/\{(title|category|detail)\}/g, (_, key: string) => values[key]);
  return item.episodes && item.episodes.length > 1
    ? summary + " " + translate("Pilih episode lain dari daftar seri di halaman ini.")
    : summary;
}
