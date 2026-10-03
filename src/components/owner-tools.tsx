"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const CATS = [
  { slug: "", label: "Semua" },
  { slug: "terbaru", label: "Terbaru" },
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
  const [posterId, setPosterId] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [posterNote, setPosterNote] = useState("");
  const [posterBusy, setPosterBusy] = useState(false);

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

  async function savePoster() {
    const id = posterId.trim();
    const url = posterUrl.trim();
    if (!id || !url) {
      setPosterNote("Isi ID video dan URL poster (https).");
      return;
    }
    setPosterBusy(true);
    setPosterNote("Menyimpan poster…");
    try {
      const res = await fetch("/api/owner-tools", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action: "set-poster", id, url }),
      });
      const data = (await res.json()) as { ok?: boolean; text?: string; error?: string };
      if (!res.ok || !data.ok) {
        const err = data.error || "";
        if (err === "forbidden") setPosterNote("Kunci salah.");
        else if (err === "bad_id") setPosterNote("ID tidak valid.");
        else if (err === "bad_url") setPosterNote("URL harus https langsung ke gambar (bukan /api/*-thumb).");
        else setPosterNote("Gagal simpan poster.");
        return;
      }
      setPosterNote(data.text || "Tersimpan.");
      setPosterUrl("");
    } catch {
      setPosterNote("Jaringan error.");
    } finally {
      setPosterBusy(false);
    }
  }

  async function refreshPosters() {
    setPosterBusy(true);
    setPosterNote("Refresh poster kosong (Streamtape/Putarin)…");
    try {
      const res = await fetch("/api/owner-tools", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action: "refresh-posters", limit: 25 }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        text?: string;
        error?: string;
        filled?: number;
        checked?: number;
      };
      if (!res.ok || !data.ok) {
        setPosterNote(data.error === "forbidden" ? "Kunci salah." : data.text || "Gagal refresh.");
        return;
      }
      setPosterNote(data.text || `Selesai. ${data.filled || 0}/${data.checked || 0} terisi.`);
    } catch {
      setPosterNote("Jaringan error.");
    } finally {
      setPosterBusy(false);
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
          Tempel banyak link. Satu kirim = satu commit. IndoAV, Putarin, Streamtape, Lulu, Videy. Thumb API (jika
          ada) otomatis masuk poster + latest-posters.json.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={uploadCat}
            onChange={(e) => setUploadCat(e.target.value)}
            className="h-10 rounded-lg border border-white/[0.08] bg-[#0f0f11] px-3 text-sm text-zinc-200"
          >
            {CATS.filter((c) => c.slug && c.slug !== "terbaru").map((c) => (
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

      <section className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
        <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Poster video</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Kartu hitam = belum ada thumb. Tempel URL gambar per ID, atau refresh otomatis via Streamtape
          file/info · getsplash / Putarin API. Disimpan ke data/latest-posters.json.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={posterId}
            onChange={(e) => setPosterId(e.target.value)}
            placeholder="ID video"
            className="h-10 min-w-[9rem] flex-1 rounded-lg border border-white/[0.08] bg-[#0f0f11] px-3 text-sm text-zinc-200"
          />
          <input
            value={posterUrl}
            onChange={(e) => setPosterUrl(e.target.value)}
            placeholder="https://…/thumb.jpg"
            className="h-10 min-w-[14rem] flex-[2] rounded-lg border border-white/[0.08] bg-[#0f0f11] px-3 text-sm text-zinc-200"
          />
          <Button type="button" size="sm" disabled={posterBusy} onClick={() => void savePoster()}>
            Simpan poster
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={posterBusy} onClick={() => void refreshPosters()}>
            {posterBusy ? "Memproses..." : "Refresh posters"}
          </Button>
        </div>
        {posterNote ? <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-400">{posterNote}</pre> : null}
      </section>
    </>
  );
}
