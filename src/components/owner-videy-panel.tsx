"use client";

import { useCallback, useEffect, useState } from "react";
import { OwnerVideySuggest } from "@/components/owner-videy-suggest";

const glass = "rounded-xl border border-white/[0.07] bg-[#101214] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]";

type Stats = { online: number; today: number; yesterday: number; total: number } | null;

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

  useEffect(() => {
    if (!secret) return;
    void load();
  }, [secret, load]);

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
