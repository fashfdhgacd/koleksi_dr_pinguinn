"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const CATS = [
  { slug: "", label: "Semua" },
  { slug: "jav", label: "Jav" },
  { slug: "jilbab", label: "Jilbab" },
  { slug: "amatir", label: "Amatir" },
  { slug: "tante", label: "Tante" },
  { slug: "abg", label: "Muda 18+" },
  { slug: "ai-plus", label: "AI+" },
  { slug: "viral", label: "Viral" },
];

export function OwnerTools({ secret }: { secret: string }) {
  const [cat, setCat] = useState("");
  const [shareText, setShareText] = useState("");
  const [shareNote, setShareNote] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [uploadText, setUploadText] = useState("");
  const [uploadCat, setUploadCat] = useState("jilbab");
  const [uploadNote, setUploadNote] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);

  async function grab(count: number) {
    setShareBusy(true);
    setShareNote("");
    try {
      const res = await fetch("/api/owner-tools", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action: "share", count, category: cat }),
      });
      const data = (await res.json()) as { ok?: boolean; count?: number; text?: string; error?: string; reset?: boolean };
      if (!res.ok || !data.ok) {
        setShareNote(data.error === "forbidden" ? "Kunci salah." : "Gagal ambil link.");
        return;
      }
      setShareText(data.text || "");
      setShareNote(`${data.count || 0} link${data.reset ? " · pool hari ini habis, mulai ulang" : ""}`);
    } catch {
      setShareNote("Jaringan error.");
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShare() {
    if (!shareText) return;
    try {
      await navigator.clipboard.writeText(shareText);
      setShareNote("Tersalin.");
    } catch {
      setShareNote("Gagal salin. Blok teks bisa dipilih manual.");
    }
  }

  async function upload() {
    const text = uploadText.trim();
    if (!text) {
      setUploadNote("Tempel link dulu.");
      return;
    }
    setUploadBusy(true);
    setUploadNote("Memproses. Satu batch = satu deploy.");
    try {
      const res = await fetch("/api/owner-tools", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action: "upload", text, category: uploadCat }),
      });
      const data = (await res.json()) as { ok?: boolean; text?: string; error?: string };
      if (!res.ok || !data.ok) {
        setUploadNote(data.error === "forbidden" ? "Kunci salah." : "Gagal tambah.");
        return;
      }
      setUploadNote(data.text || "Selesai.");
      setUploadText("");
    } catch {
      setUploadNote("Jaringan error.");
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <>
      <section className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
        <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Ambil link</h2>
        <p className="mt-1 text-xs text-zinc-500">Acak, tidak diulang hari ini. Sama dengan bot, tanpa commit.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="h-10 rounded-lg border border-white/[0.08] bg-[#0f0f11] px-3 text-sm text-zinc-200"
          >
            {CATS.map((c) => (
              <option key={c.slug || "all"} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" disabled={shareBusy} onClick={() => void grab(10)}>
            10
          </Button>
          <Button type="button" size="sm" disabled={shareBusy} onClick={() => void grab(25)}>
            25
          </Button>
          <Button type="button" size="sm" disabled={shareBusy} onClick={() => void grab(100)}>
            100
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!shareText} onClick={() => void copyShare()}>
            Salin
          </Button>
        </div>
        {shareNote ? <p className="mt-2 text-xs text-zinc-400">{shareNote}</p> : null}
        <textarea
          readOnly
          value={shareText}
          placeholder="Hasil link muncul di sini."
          className="mt-3 h-40 w-full resize-y rounded-lg border border-white/[0.08] bg-[#0f0f11] p-3 text-xs text-zinc-200"
        />
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
        <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Tambah video</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Tempel banyak link. Satu kirim = satu commit. IndoAV, Putarin, Streamtape, Lulu, Videy.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={uploadCat}
            onChange={(e) => setUploadCat(e.target.value)}
            className="h-10 rounded-lg border border-white/[0.08] bg-[#0f0f11] px-3 text-sm text-zinc-200"
          >
            {CATS.filter((c) => c.slug).map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" disabled={uploadBusy} onClick={() => void upload()}>
            {uploadBusy ? "Memproses..." : "Simpan batch"}
          </Button>
        </div>
        <textarea
          value={uploadText}
          onChange={(e) => setUploadText(e.target.value)}
          placeholder={"Judul opsional di atas link\nhttps://tv1.indoav.app/e/..."}
          className="mt-3 h-36 w-full resize-y rounded-lg border border-white/[0.08] bg-[#0f0f11] p-3 text-xs text-zinc-200"
        />
        {uploadNote ? <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-400">{uploadNote}</pre> : null}
      </section>
    </>
  );
}
