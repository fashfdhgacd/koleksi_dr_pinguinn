"use client";

// "Edit tag massal" di /pemilik: tambah/hapus tag (kategori tambahan) ke banyak video sekaligus.
// Satu aksi = satu request owner-tools "bulk-tags" = satu tulis KV. Judul dan kategori utama tidak disentuh.
import { useMemo, useState } from "react";
import { EXTRA_CHOICES } from "@/components/owner-edit-sheet";
import { fmt, ownerToast } from "@/components/owner-dashboard-shared";

// Tag yang tidak ditawarkan untuk edit massal (server juga menolaknya diam-diam).
const BULK_HIDE_RE = /(^|-)(teen|college)(-|$)/i;
export const BULK_CHOICES = EXTRA_CHOICES.filter((c) => !BULK_HIDE_RE.test(c.slug));
export const BULK_MAX = 300;

type BulkResp = {
  ok?: boolean;
  error?: string;
  changed?: number;
  unchanged?: number;
  full?: number;
  skipped?: number;
  extra?: Record<string, string[]>;
};

const btn =
  "shrink-0 whitespace-nowrap rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[13px] text-zinc-200 hover:border-[#2dd4bf]/40 hover:bg-white/[0.06] disabled:opacity-50";
const chip = (on: boolean) =>
  `shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] ${
    on ? "border-[#2dd4bf] bg-[#2dd4bf] font-medium text-zinc-950" : "border-white/[0.12] bg-transparent text-zinc-400 hover:text-zinc-200"
  }`;

export function BulkTagBar({
  secret,
  ids,
  onClear,
  onApplied,
}: {
  secret: string;
  ids: string[];
  onClear: () => void;
  onApplied: (extra: Record<string, string[]>) => void;
}) {
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [tags, setTags] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const suggestions = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return BULK_CHOICES.filter(
      (c) => !tags.includes(c.slug) && (c.slug.includes(t) || c.label.toLowerCase().includes(t)),
    ).slice(0, 8);
  }, [q, tags]);

  function pick(slug: string) {
    setTags((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]));
    setQ("");
    setConfirm(false);
  }

  const labelOf = (s: string) => BULK_CHOICES.find((c) => c.slug === s)?.label || s;

  async function apply() {
    setBusy(true);
    let d: BulkResp;
    try {
      const res = await fetch("/api/owner-tools", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action: "bulk-tags", ids, [mode]: tags }),
        cache: "no-store",
      });
      d = ((await res.json().catch(() => null)) as BulkResp | null) || { ok: false, error: `HTTP ${res.status}` };
    } catch {
      d = { ok: false, error: "Koneksi bermasalah." };
    }
    setBusy(false);
    setConfirm(false);
    if (!d.ok) {
      ownerToast(`Gagal: ${d.error || "tidak diketahui"}`);
      return;
    }
    const parts = [`${fmt(d.changed || 0)} video diperbarui`];
    if (d.unchanged) parts.push(`${fmt(d.unchanged)} sudah sesuai`);
    if (d.full) parts.push(`${fmt(d.full)} sudah penuh (maks. 6 tag)`);
    if (d.skipped) parts.push(`${fmt(d.skipped)} dilewati`);
    ownerToast(`${parts.join(" · ")}. Tampil di situs dalam ±1 menit.`, "ok");
    onApplied(d.extra || {});
    setTags([]);
  }

  if (!ids.length) return null;
  const tooMany = ids.length > BULK_MAX;
  return (
    <div className="sticky top-2 z-30 mt-2 rounded-xl border border-[#2dd4bf]/30 bg-[#0d1112]/95 p-3 shadow-xl shadow-black/40 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-zinc-100">{fmt(ids.length)} video dipilih</span>
        <span className="flex gap-1">
          <button type="button" className={chip(mode === "add")} onClick={() => { setMode("add"); setConfirm(false); }}>
            Tambah tag
          </button>
          <button type="button" className={chip(mode === "remove")} onClick={() => { setMode("remove"); setConfirm(false); }}>
            Hapus tag
          </button>
        </span>
        <button type="button" className={`${btn} ml-auto`} onClick={onClear}>
          Batal pilih
        </button>
      </div>

      <div className="relative mt-2">
        <input
          className="w-full rounded-lg border border-white/[0.08] bg-[#0a0b0c] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && suggestions[0]) {
              e.preventDefault();
              pick(suggestions[0].slug);
            }
          }}
          placeholder="Cari tag, misal: jilbab, viral…"
          aria-label="Cari tag"
        />
        {suggestions.length ? (
          <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-auto rounded-lg border border-white/[0.12] bg-[#18181c] shadow-xl shadow-black/50">
            {suggestions.map((c) => (
              <button
                key={c.slug}
                type="button"
                className="block w-full px-3 py-2 text-left text-[13px] text-zinc-200 hover:bg-white/[0.06]"
                onClick={() => pick(c.slug)}
              >
                {c.label} <span className="text-zinc-500">· {c.slug}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {BULK_CHOICES.map((c) => (
          <button key={c.slug} type="button" aria-pressed={tags.includes(c.slug)} className={chip(tags.includes(c.slug))} onClick={() => pick(c.slug)}>
            {c.label}
          </button>
        ))}
      </div>

      {tooMany ? (
        <p className="mt-2 text-[13px] text-amber-300">Maksimal {BULK_MAX} video sekali simpan. Kurangi pilihannya dulu ya.</p>
      ) : confirm ? (
        <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5">
          <p className="text-[13px] text-zinc-200">
            {mode === "add" ? "Tambah" : "Hapus"} tag <b>{tags.map(labelOf).join(", ")}</b> {mode === "add" ? "ke" : "dari"}{" "}
            <b>{fmt(ids.length)} video</b>? Kategori utama tidak ikut berubah.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={chip(true)} disabled={busy} onClick={() => void apply()}>
              {busy ? "Menyimpan…" : "Ya, simpan"}
            </button>
            <button type="button" className={btn} disabled={busy} onClick={() => setConfirm(false)}>
              Nggak jadi
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`${chip(true)} mt-3 w-full py-2 disabled:opacity-50`}
          disabled={!tags.length}
          onClick={() => setConfirm(true)}
        >
          {tags.length
            ? `${mode === "add" ? "Tambah" : "Hapus"} ${fmt(tags.length)} tag di ${fmt(ids.length)} video`
            : "Pilih tag dulu"}
        </button>
      )}
    </div>
  );
}
