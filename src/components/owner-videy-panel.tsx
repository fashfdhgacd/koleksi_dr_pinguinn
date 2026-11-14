"use client";

import { useCallback, useEffect, useState } from "react";
import { OwnerKirimanVidey } from "@/components/owner-kiriman-videy";
import { OwnerVideySuggest } from "@/components/owner-videy-suggest";

const glass = "rounded-xl border border-white/[0.07] bg-[#101214] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]";

type Stats = { online: number; today: number; yesterday: number; total: number } | null;
type Featured = { id: string | null; title: string };
type CatalogOpt = { id: string; title: string };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={glass + " p-4"}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{title}</p>
      <div className="mt-2 text-[13px] text-zinc-300">{children}</div>
    </div>
  );
}

/** /pemilik → tab Videyy: status + statistik pengunjung videyy.icu. */
export function OwnerVideyPanel({ secret }: { secret: string }) {
  const [stats, setStats] = useState<Stats>(null);
  const [err, setErr] = useState<string | null>(null);
  const [feat, setFeat] = useState<Featured | null>(null);
  const [featId, setFeatId] = useState("");
  const [featTitle, setFeatTitle] = useState("");
  const [featMsg, setFeatMsg] = useState("");
  const [featBusy, setFeatBusy] = useState(false);
  const [opts, setOpts] = useState<CatalogOpt[] | null>(null);

  const loadFeatured = useCallback(async () => {
    try {
      const res = await fetch("/api/videy-featured", { cache: "no-store" });
      const d = (await res.json().catch(() => null)) as Featured & { ok?: boolean };
      if (res.ok && d?.ok) {
        setFeat(d);
        setFeatId(d.id || "");
        setFeatTitle(d.title || "");
      }
    } catch {
      /* abaikan */
    }
  }, []);

  const loadCatalogOpts = useCallback(async () => {
    if (opts) return;
    const out: CatalogOpt[] = [];
    try {
      for (let page = 1; page <= 20; page++) {
        const res = await fetch(`/api/data?type=category&category=videy&limit=48&page=${page}`, {
          headers: { "x-online-key": secret },
          cache: "no-store",
        });
        const d = (await res.json().catch(() => null)) as {
          ok?: boolean;
          items?: { id?: string; title?: string }[];
          hasMore?: boolean;
        };
        if (!res.ok || !d?.ok || !Array.isArray(d.items)) break;
        for (const it of d.items) {
          if (it.id) out.push({ id: String(it.id), title: String(it.title || "") });
        }
        if (!d.hasMore) break;
      }
      setOpts(out);
    } catch {
      setOpts([]);
    }
  }, [opts, secret]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/videy-hit", { headers: { "x-online-key": secret }, cache: "no-store" });
      const d = (await res.json().catch(() => null)) as { ok?: boolean } & Stats;
      if (res.ok && d?.ok) {
        setStats(d);
        setErr(null);
      } else {
        setErr("Statistik belum tersedia.");
      }
    } catch {
      setErr("Statistik belum tersedia.");
    }
  }, [secret]);

  const saveFeatured = useCallback(
    async (id: string | null) => {
      setFeatBusy(true);
      setFeatMsg("");
      try {
        const res = await fetch("/api/videy-featured", {
          method: "POST",
          headers: { "content-type": "application/json", "x-online-key": secret },
          body: JSON.stringify(id === null ? { id: null } : { id, title: featTitle.trim() }),
        });
        const d = (await res.json().catch(() => null)) as { ok?: boolean; error?: string };
        if (res.ok && d?.ok) {
          setFeatMsg(id === null ? "Direset ke video default." : "Tersimpan — hero videyy.icu langsung berubah.");
          await loadFeatured();
        } else {
          setFeatMsg(d?.error || "Gagal menyimpan.");
        }
      } catch {
        setFeatMsg("Gagal menyimpan.");
      } finally {
        setFeatBusy(false);
      }
    },
    [secret, featTitle, loadFeatured],
  );

  useEffect(() => {
    if (!secret) return;
    void load();
    void loadFeatured();
  }, [secret, load, loadFeatured]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Card title="Situs">
          <a href="https://videyy.icu" target="_blank" rel="noopener noreferrer" className="font-medium text-[#5eead4] hover:underline">
            videyy.icu
          </a>
          <p className="mt-1 text-[12px] text-zinc-500">Live — Cloudflare Workers</p>
        </Card>
        <Card title="Deploy">
          <p className="font-medium text-zinc-200">Otomatis dari GitHub</p>
          <p className="mt-1 text-[12px] text-zinc-500">Setiap push ke main langsung tayang</p>
        </Card>
        <Card title="Katalog">
          <p className="font-medium text-zinc-200">608 video Videy</p>
          <p className="mt-1 text-[12px] text-zinc-500">Static build + sitemap SEO</p>
        </Card>
        <Card title="Pengunjung">
          {stats ? (
            <>
              <p className="font-medium text-zinc-200">
                <span className="text-[#5eead4]">{stats.online}</span> online ·{" "}
                <span className="text-[#5eead4]">{stats.today}</span> hari ini
              </p>
              <p className="mt-1 text-[12px] text-zinc-500">Kemarin {stats.yesterday} · total {stats.total}</p>
            </>
          ) : (
            <p className="text-zinc-500">{err || "Menghitung…"}</p>
          )}
        </Card>
      </div>

      <div className={glass + " p-4"}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Video unggulan (hero videyy.icu)</p>
        <p className="mt-1 text-[12px] text-zinc-500">
          Sekarang:{" "}
          {feat?.id ? (
            <a href={`https://videyy.icu/watch/${feat.id}/`} target="_blank" rel="noopener noreferrer" className="text-[#5eead4] hover:underline">
              {feat.title || feat.id}
            </a>
          ) : (
            "default (video pertama katalog)"
          )}
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={featId}
            onChange={(e) => setFeatId(e.target.value)}
            placeholder="ID video, mis. UQQvGURS1 — atau paste link videy.co"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
          <input
            value={featTitle}
            onChange={(e) => setFeatTitle(e.target.value)}
            placeholder="Judul tampilan (opsional — kosongkan = judul dari katalog)"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={featBusy || !featId.trim()}
              onClick={() => {
                const raw = featId.trim();
                const m = raw.match(/(?:videy\.co\/(?:v\/\?id=|[^/]*\/?)|cdn\d*\.videy\.co\/)([A-Za-z0-9_-]{6,24})/i);
                void saveFeatured(m ? m[1] : raw);
              }}
              className="rounded-lg bg-[#5eead4] px-3 py-1.5 text-[12px] font-medium text-zinc-950 hover:opacity-90 disabled:opacity-40"
            >
              {featBusy ? "Menyimpan…" : "Sematkan"}
            </button>
            <button
              type="button"
              disabled={featBusy}
              onClick={() => void saveFeatured(null)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 hover:border-zinc-500 disabled:opacity-40"
            >
              Reset ke default
            </button>
            <button
              type="button"
              onClick={() => void loadCatalogOpts()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 hover:border-zinc-500"
            >
              {opts ? "Muat ulang daftar" : "Pilih dari katalog"}
            </button>
            {featMsg && <span className="text-[12px] text-zinc-400">{featMsg}</span>}
          </div>
          {opts && opts.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const o = opts.find((x) => x.id === e.target.value);
                if (o) {
                  setFeatId(o.id);
                  if (!featTitle.trim()) setFeatTitle(o.title);
                }
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[13px] text-zinc-200 focus:border-zinc-500 focus:outline-none"
            >
              <option value="">— pilih video dari katalog ({opts.length}) —</option>
              {opts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title || o.id} ({o.id})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <OwnerKirimanVidey secret={secret} boxed />

      <div className={glass + " p-4"}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Usulan video dari videyy.icu</p>
          <button type="button" onClick={() => void load()} className="text-[12px] text-zinc-500 hover:text-zinc-300">
            ↻ Muat ulang
          </button>
        </div>
        <div className="mt-3">
          <OwnerVideySuggest secret={secret} />
        </div>
      </div>

      <div className={glass + " p-4"}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Tautan cepat</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href="https://videyy.icu" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-200 hover:border-zinc-500">
            Buka videyy.icu
          </a>
          <a href="https://github.com/fashfdhgacd/videyy" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-200 hover:border-zinc-500">
            Buka repo
          </a>
          <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-200 hover:border-zinc-500">
            Search Console
          </a>
        </div>
      </div>
    </div>
  );
}
