import { longWatchDescription } from "@/lib/catalog/watch-description";
import type { SeoVideoInput } from "@/lib/seo";

type Props = {
  item: SeoVideoInput & { id?: string; title: string; category?: string | null; duration?: number | null };
};

export function WatchSeoSection({ item }: Props) {
  const longText = longWatchDescription(item);
  const title = item.title;
  const cat = item.category || "video";
  const durMin = item.duration && item.duration > 60 ? Math.round(item.duration / 60) : null;

  const faqs = [
    { q: "Video ini tentang apa?", a: `Video berjudul “${title}” di kategori ${cat}.` },
    { q: "Berapa durasinya?", a: durMin ? `Sekitar ${durMin} menit.` : "Durasi tidak tercatat." },
    { q: "Perlu daftar akun?", a: "Tidak. Bisa langsung diputar tanpa daftar." },
    { q: "Untuk semua umur?", a: "Tidak. Khusus untuk usia 18 tahun ke atas." },
  ];

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
