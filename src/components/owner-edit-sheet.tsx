"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Kategori tambahan yang boleh dipilih di /pemilik (urutan dari pemilik). Slug = src/lib/catalog/categories.ts. */
export const EXTRA_CHOICES: { slug: string; label: string }[] = [
  { slug: "jav", label: "Jav" },
  { slug: "hentai", label: "Hentai" },
  { slug: "ai-gay", label: "AI GAY" },
  { slug: "blunder", label: "Blunder" },
  { slug: "kelas-bintang", label: "Kelas Bintang" },
  { slug: "tiktok", label: "TikTok" },
  { slug: "mantan", label: "Mantan" },
  { slug: "vcs", label: "VCS" },
  { slug: "kompilasi", label: "Kompilasi" },
  { slug: "tetangga", label: "Tetangga" },
  { slug: "kacamata", label: "Kacamata" },
  { slug: "kantor", label: "Kantor" },
  { slug: "anal", label: "Anal" },
  { slug: "cantik", label: "Cewek Cantik" },
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
      if (cur.filter((x) => x !== mainCat).length >= MAX_EXTRA) {
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

  const nExtra = extra.filter((x) => x !== mainCat).length;
  const node = (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit video"
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-white/[0.08] bg-[#121416] p-4 shadow-2xl shadow-black/60 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15 sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-50">
            Edit video <span className="ml-1 text-[11px] font-normal text-zinc-500">ID {id}</span>
          </h3>
          <button type="button" onClick={onClose} className="rounded-full px-2 text-zinc-400 hover:text-zinc-100" aria-label="Tutup">
            ✕
          </button>
        </div>

        <label className="mt-3 block text-[12px] font-medium text-zinc-400" htmlFor="edit-title">
          Judul
        </label>
        <input
          id="edit-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-1.5 text-sm text-zinc-100 focus:border-[#2dd4bf]/60 focus:outline-none"
        />

        <div className="mt-3 flex items-baseline justify-between gap-2">
          <p className="text-[12px] font-medium text-zinc-400">Tampil juga di kategori (maks. {MAX_EXTRA})</p>
          <span className={`text-[11px] tabular-nums ${nExtra >= MAX_EXTRA ? "text-amber-300" : "text-zinc-500"}`}>
            {nExtra}/{MAX_EXTRA}
          </span>
        </div>
        {orig == null ? <p className="mt-1 text-[11px] text-zinc-500">Memuat kategori tersimpan…</p> : null}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {EXTRA_CHOICES.map((c) => {
            const main = c.slug === mainCat;
            const on = main || extra.includes(c.slug);
            const full = !on && nExtra >= MAX_EXTRA;
            return (
              <button
                key={c.slug}
                type="button"
                aria-pressed={on}
                title={main ? "Kategori utama" : undefined}
                disabled={orig == null || full}
                onClick={() => {
                  if (!main) toggle(c.slug);
                }}
                className={`rounded-full border px-2.5 py-1 text-[12px] leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2dd4bf] disabled:opacity-35 ${
                  main
                    ? "cursor-default border-[#2dd4bf]/60 bg-[#2dd4bf]/15 font-medium text-[#5eead4]"
                    : on
                    ? "border-[#2dd4bf] bg-[#2dd4bf] font-medium text-zinc-950"
                    : "border-white/[0.1] bg-white/[0.03] text-zinc-300 hover:border-[#2dd4bf]/50"
                }`}
              >
                {main ? `${c.label} · utama` : c.label}
              </button>
            );
          })}
        </div>

        {err ? <p className="mt-2 text-[12px] text-red-400">{err}</p> : null}
        {verdict ? (
          <p className="mt-2 rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-1.5 text-[12px] text-zinc-200">
            Tersimpan. Detector sekarang: <span className="font-medium text-amber-200">{verdictText(verdict)}</span>
          </p>
        ) : null}
        <p className="mt-2 text-[11px] leading-snug text-zinc-500">
          Edit judul tidak pernah membuka video yang terkunci. Perubahan tampil di situs dalam ±1 menit.
        </p>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="flex-1 rounded-lg bg-[#2dd4bf] px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
          >
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/[0.1] px-3 py-2 text-sm text-zinc-200">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
  // Portal ke <body>: kartu induk memakai backdrop-blur, sehingga `fixed` menempel ke kartu, bukan ke layar.
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
