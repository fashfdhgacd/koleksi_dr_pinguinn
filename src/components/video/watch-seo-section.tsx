import { usePublicLanguage } from "@/lib/public-ui";
import { longWatchDescription } from "@/lib/catalog/watch-description";
import type { VideoDetail } from "@/lib/catalog/types";
import { cleanDisplayTitle } from "@/lib/seo";

type Props = {
  item: VideoDetail;
};

export function WatchSeoSection({ item }: Props) {
  const language = usePublicLanguage();
  const longText = longWatchDescription(item);
  const title = cleanDisplayTitle(item.title);
  const cat = item.category.trim() || "video";
  const duration = item.durationLabel && item.durationLabel !== "—" ? item.durationLabel : null;

  const faqs = [
    { q: "Video ini tentang apa?", a: `Video berjudul “${title}” di kategori ${cat}.` },
    { q: "Berapa durasinya?", a: duration ? `${duration}.` : "Durasi tidak tercatat." },
    { q: "Perlu daftar akun?", a: "Tidak. Bisa langsung diputar tanpa daftar." },
    { q: "Untuk semua umur?", a: "Tidak. Khusus untuk usia 18 tahun ke atas." },
  ];

  if (language !== "id") {
    const ms = language === "ms";
    return <section className="max-w-3xl space-y-2 text-sm text-muted">
      <h2 className="font-semibold text-foreground">{ms ? "Maklumat tontonan" : "Viewing information"}</h2>
      <p>{ms ? `Tonton “${title}”. Khas untuk penonton berumur 18 tahun ke atas.` : `Watch “${title}”. For viewers aged 18 and over.`}</p>
      {duration && <p>{ms ? "Tempoh" : "Duration"} · {duration}</p>}
    </section>;
  }
  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm leading-relaxed text-muted">{longText}</p>

      <section aria-label="Pertanyaan umum" className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Pertanyaan Umum</h2>
        <div className="space-y-2">
          {faqs.map((f) => (
            <details key={f.q} className="rounded-lg border border-border bg-secondary/40 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-foreground">{f.q}</summary>
              <p className="mt-2 text-sm text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
