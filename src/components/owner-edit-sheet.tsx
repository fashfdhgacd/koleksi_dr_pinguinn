"use client";

import { useEffect, useState } from "react";

/** Kategori tambahan yang boleh dipilih di /pemilik (urutan dari pemilik). Slug = src/lib/catalog/categories.ts. */
export const EXTRA_CHOICES: { slug: string; label: string }[] = [
  { slug: "jav", label: "Jav" },
  { slug: "hentai", label: "Hentai" },
  { slug: "jilbab", label: "Jilbab" },
  { slug: "tante", label: "Tante" },
  { slug: "amatir", label: "Amatir" },
  { slug: "viral", label: "Viral" },
  { slug: "percakapan", label: "Percakapan" },
  { slug: "kosan", label: "Kosan" },
  { slug: "colmek", label: "Colmek" },
  { slug: "teen-18", label: "Teen (18+)" },
  { slug: "istri", label: "Istri" },
  { slug: "live", label: "Live" },
  { slug: "doggy", label: "Doggy" },
  { slug: "open-bo", label: "Open BO" },
  { slug: "malaysia", label: "Malaysia" },
  { slug: "chindo", label: "Chindo" },
  { slug: "gangbang", label: "Threesome & Gangbang" },
  { slug: "selingkuh", label: "Selingkuh" },
  { slug: "barat", label: "Bule" },
  { slug: "college-18", label: "College (18+)" },
  { slug: "sepong", label: "Sepong" },
  { slug: "tobrut", label: "Tobrut" },
];
export const MAX_EXTRA = 6;

export type EditVerdict = {
  detector: string | null;
  moderation: { status?: string; assessment?: string; reason?: string } | null;
};

type EditResp = {
  ok?: boolean;
  error?: string;
  title?: string | null;
  category?: string | null;
  extra?: string[];
  detector?: string | null;
  moderation?: EditVerdict["moderation"];
};

type SearchRow = { id: string; title: string; category: string; extra?: string[] };

async function post<T>(secret: string, body: Record<string, unknown>): Promise<T> {
  try {
    const res = await fetch("/api/owner-tools", {
      method: "POST",
      headers: { "content-type": "application/json", "x-online-key": secret },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return ((await res.json().catch(() => null)) || { ok: false, error: `HTTP ${res.status}` }) as T;
  } catch {
    return { ok: false, error: "Jaringan error." } as T;
  }
}

export function verdictText(v: EditVerdict): string {
  const s = v.moderation?.status || "";
  const head =
    v.detector === "block" || s === "locked"
      ? "Terkunci (minor)"
      : v.detector === "review" || s === "review_pending"
        ? "Masih perlu dicek"
        : "Lolos detector";
  return v.moderation?.assessment ? `${head} · ${v.moderation.assessment}` : head;
}

/**
 * Lembar edit (judul + "Tampil juga di kategori", maks. 6). Simpan lewat aksi owner-tools "edit-video"
 * yang sudah ada: server menolak judul terlarang dan tidak pernah membuka kunci. Kategori tambahan yang
 * tersimpan dibaca sekali saat lembar dibuka (catalog-search by id), supaya simpan judul saja tidak
 * menghapus pilihan lama.
 */
export function OwnerEditSheet({
  secret,
  id,
  title: initialTitle,
  onClose,
  onSaved,
}: {
  secret: string;
  id: string;
  title: string;
  onClose: () => void;
  onSaved: (r: { title: string; extra: string[]; verdict: EditVerdict | null }) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [extra, setExtra] = useState<string[]>([]);
  const [orig, setOrig] = useState<string[] | null>(null);
  const [mainCat, setMainCat] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [verdict, setVerdict] = useState<EditVerdict | null>(null);

  useEffect(() => {
    let alive = true;
    void post<{ ok?: boolean; items?: SearchRow[] }>(secret, { action: "catalog-search", q: id }).then((d) => {
      if (!alive) return;
      const row = d.items?.find((r) => r.id === id);
      const cur = row?.extra || [];
      setMainCat(row?.category || "");
      setExtra(cur);
      setOrig(cur);
    });
    return () => {
      alive = false;
    };
  }, [secret, id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(slug: string) {
    setErr("");
    setExtra((cur) => {
      if (cur.includes(slug)) return cur.filter((s) => s !== slug);
      if (cur.length >= MAX_EXTRA) {
        setErr(`Maksimal ${MAX_EXTRA} kategori tambahan.`);
        return cur;
      }
      return [...cur, slug];
    });
  }

  async function save() {
    const body: Record<string, unknown> = { action: "edit-video", id };
    const t = title.replace(/\s+/g, " ").trim();
    if (t && t !== initialTitle) body.title = t;
    const changed = orig != null && [...extra].sort().join(",") !== [...orig].sort().join(",");
    if (changed) body.extra = extra.filter((s) => s !== mainCat).slice(0, MAX_EXTRA);
    if (!body.title && !body.extra) {
      setErr("Tidak ada perubahan.");
      return;
    }
    setBusy(true);
    setErr("");
    const d = await post<EditResp>(secret, body);
    setBusy(false);
    if (!d.ok) {
      setErr(`Gagal: ${d.error || "tidak diketahui"}`);
      return;
    }
    const v = d.detector || d.moderation ? { detector: d.detector ?? null, moderation: d.moderation ?? null } : null;
    setVerdict(v);
    if (d.extra) setOrig(d.extra);
    onSaved({ title: d.title || t || initialTitle, extra: d.extra || extra, verdict: v });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit video"
        className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/[0.08] bg-[#121416]/95 p-5 shadow-2xl shadow-black/60 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-zinc-50">Edit video</h3>
          <button type="button" onClick={onClose} className="rounded-full px-2 text-zinc-400 hover:text-zinc-100" aria-label="Tutup">
            ✕
          </button>
        </div>
        <p className="mt-0.5 text-[12px] text-zinc-500">ID {id}</p>

        <label className="mt-4 block text-[13px] font-medium text-zinc-300" htmlFor="edit-title">
          Judul
        </label>
        <textarea
          id="edit-title"
          rows={2}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1.5 w-full resize-none rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm text-zinc-100 focus:border-[#2dd4bf]/60 focus:outline-none"
        />

        <div className="mt-4 flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-medium text-zinc-300">Tampil juga di kategori (opsional, maks. 6)</p>
          <span className={`text-[12px] tabular-nums ${extra.length >= MAX_EXTRA ? "text-amber-300" : "text-zinc-500"}`}>
            {extra.length}/{MAX_EXTRA}
          </span>
        </div>
        {orig == null ? <p className="mt-2 text-[12px] text-zinc-500">Memuat kategori tersimpan…</p> : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXTRA_CHOICES.map((c) => {
            const on = extra.includes(c.slug);
            const full = !on && extra.length >= MAX_EXTRA;
            return (
              <button
                key={c.slug}
                type="button"
                aria-pressed={on}
                disabled={orig == null || full || c.slug === mainCat}
                onClick={() => toggle(c.slug)}
                className={`rounded-full border px-3 py-1.5 text-[13px] transition disabled:opacity-35 ${
                  on
                    ? "border-[#2dd4bf] bg-[#2dd4bf] font-medium text-zinc-950"
                    : "border-white/[0.1] bg-white/[0.03] text-zinc-300 hover:border-[#2dd4bf]/50"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {err ? <p className="mt-3 text-[13px] text-red-400">{err}</p> : null}
        {verdict ? (
          <p className="mt-3 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-[13px] text-zinc-200">
            Tersimpan. Detector sekarang: <span className="font-medium text-amber-200">{verdictText(verdict)}</span>
          </p>
        ) : null}
        <p className="mt-3 text-[12px] text-zinc-500">
          Edit judul tidak pernah membuka video yang terkunci. Perubahan tampil di situs dalam ±1 menit.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="flex-1 rounded-xl bg-[#2dd4bf] px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-50"
          >
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/[0.1] px-4 py-2.5 text-sm text-zinc-200">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
