"use client";

// /pemilik top half: "Perlu dicek", stats row, chart (24 jam / 14 hari), visitors + money,
// recent uploads (source filter), search + edit, categories, player health per source, thumbnail
// list, system status, top videos. Edits and hides go through owner-only APIs; the minor-lock is
// enforced on the server (owner-tools.ts). Nothing here polls: data loads when the panel opens,
// on Refresh, and when the tab comes back (owner-panel.tsx, at most once a minute).
import { OwnerHeroCard } from "@/components/owner-hero";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORY_LIST } from "@/lib/catalog/categories";
import { fmt, ownerToast, type OwnerStats, type DayRow } from "@/components/owner-dashboard-shared";
import {
  AlertStrip,
  MoneyCard,
  StatusCard,
  ThumbMissingCard,
  type OverviewStatus,
  type PlayerLogData,
} from "@/components/owner-health";

const SITE_ORIGIN = "https://koleksidrpinguin.com";

type HourRow = { hour: string; views: number };
type Stats = OwnerStats & {
  hourly?: HourRow[];
  browsers?: { browser: string; views: number }[];
  countries?: { country: string; views: number }[];
};

type CountRow = { key: string; label: string; views: number };

const DEVICE_NAMES: Record<string, string> = { mobile: "HP", desktop: "Desktop", tablet: "Tablet", other: "Lainnya" };
const BROWSER_NAMES: Record<string, string> = {
  chrome: "Chrome",
  safari: "Safari",
  firefox: "Firefox",
  edge: "Edge",
  opera: "Opera",
  samsung: "Samsung Internet",
  uc: "UC Browser",
  other: "Lainnya",
};

function refName(ref: string): string {
  const r = String(ref || "").trim();
  if (!r || r === "(direct)") return "Langsung";
  try {
    return new URL(r.includes("://") ? r : `https://${r}`).hostname.replace(/^www\./, "");
  } catch {
    return r;
  }
}

function countryName(code: string): string {
  if (!code) return "Tidak diketahui";
  try {
    return new Intl.DisplayNames(["id"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

/** Merges rows with the same label (e.g. two referrer URLs on one host) and sorts by count. */
function mergeRows(rows: CountRow[], limit = 6): CountRow[] {
  const m = new Map<string, CountRow>();
  for (const r of rows) {
    const cur = m.get(r.label);
    if (cur) cur.views += r.views;
    else m.set(r.label, { ...r });
  }
  return [...m.values()].filter((r) => r.views > 0).sort((a, b) => b.views - a.views).slice(0, limit);
}

function CountList({ title, rows }: { title: string; rows: CountRow[] }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-[#5eead4]">{title}</p>
      {rows.length ? (
        <ul className="mt-2 space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="flex items-baseline justify-between gap-3">
              <span className="truncate text-zinc-300">{r.label}</span>
              <span className="shrink-0 tabular-nums text-zinc-400">{fmt(r.views)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-zinc-500">Belum ada.</p>
      )}
    </div>
  );
}

export type CatalogRow = {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  source: string;
  createdAt: number;
  hidden: boolean;
  locked: boolean;
  noThumb?: boolean;
};

type Overview = {
  ok?: boolean;
  error?: string;
  total?: number;
  hidden?: number;
  uploadedToday?: number;
  uploadedWeek?: number;
  todayBySource?: Record<string, number>;
  bySource?: Record<string, number>;
  categories?: { slug: string; label: string; count: number }[];
  noThumb?: number;
  recent?: CatalogRow[];
  checkJav?: CatalogRow[];
  recentTotal?: number;
  offset?: number;
  status?: OverviewStatus;
};

/** Rows per "Upload terbaru" page. */
const PAGE = 10;

/** Upload list filter: "" = semua, a source label, or "nothumb". */
type RecentFilter = string;

const card = "min-w-0 rounded-xl border border-white/[0.08] border-t-[#2dd4bf]/40 bg-[#131316] p-4 sm:p-5";
const h2 = "flex items-center justify-between gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#2dd4bf]";
const h2note = "text-[13px] font-normal normal-case tracking-normal text-zinc-400";
const btn =
  "shrink-0 whitespace-nowrap rounded-md border border-white/[0.12] bg-[#16161a] px-2 py-1 text-[13px] text-zinc-200 hover:bg-white/[0.06] disabled:opacity-50";
// Separate classes per state so the active background never competes with the base bg in CSS order.
function toggleCls(active: boolean): string {
  const base = "shrink-0 whitespace-nowrap rounded-md border px-2 py-1 text-[13px]";
  return active
    ? `${base} border-[#2dd4bf] bg-[#2dd4bf] font-medium text-zinc-950`
    : `${base} border-white/[0.12] bg-transparent text-zinc-400 hover:text-zinc-200`;
}
const input = "rounded-md border border-white/[0.12] bg-[#0c0c0e] px-2.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-500";

function compact(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}k`;
  return fmt(n);
}

function hostLabel(host: string): string {
  const h = host.toLowerCase();
  if (h.includes("indoav")) return "IndoAV";
  if (h.includes("userbokep")) return "UserBokep";
  if (h.includes("putarin") || h.includes("puterin")) return "Putarin";
  if (h.includes("streamtape") || h.includes("tape")) return "Streamtape";
  if (h.includes("byse")) return "Byse";
  if (h.includes("lulu")) return "LuluStream";
  if (h.includes("dood")) return "DoodStream";
  if (h.includes("videy")) return "Videy";
  return host;
}

type HealthRange = "today" | "yesterday" | "week";
const HEALTH_RANGES: { key: HealthRange; label: string; total: string }[] = [
  { key: "today", label: "Hari ini", total: "hari ini" },
  { key: "yesterday", label: "Kemarin", total: "kemarin" },
  { key: "week", label: "7 hari", total: "7 hari" },
];

function shortSource(src: string): string {
  if (src === "LuluStream") return "Lulu";
  if (src === "DoodStream") return "Dood";
  return src;
}

// Server sends hourly as 24 slots, oldest first, labelled with the WIB hour ("00".."23").
function hourText(label: string): string {
  const m = String(label).match(/^(\d{1,2})/);
  return m ? `${m[1].padStart(2, "0")}.00` : String(label);
}

function barNum(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}rb`;
  return fmt(n);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// DayRow.day is the WIB calendar date (YYYY-MM-DD).
function dateText(iso: string): string {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] || ""}`.trim();
}

function timeWib(ms: number): string {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}

/** Owner API call. Never returns null: failures come back as { ok: false, error } so the UI can show them. */
async function ownerPost<T extends { ok?: boolean; error?: string }>(
  secret: string,
  body: Record<string, unknown>,
): Promise<T> {
  try {
    const res = await fetch("/api/owner-tools", {
      method: "POST",
      headers: { "content-type": "application/json", "x-online-key": secret },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as T | null;
    if (data) return data;
    return { ok: false, error: `HTTP ${res.status}` } as T;
  } catch {
    return { ok: false, error: "Jaringan error." } as T;
  }
}

function StatCell({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/[0.05] bg-[#0f0f12] px-3 py-2.5">
      <p className="text-[13px] font-medium uppercase leading-snug tracking-[0.08em] text-[#5eead4]">{label}</p>
      <p className="mt-1 truncate text-2xl tabular-nums text-zinc-50">{value}</p>
      {sub ? (
        <p className="mt-0.5 text-[13px] leading-snug text-zinc-400">
          {sub}
        </p>
      ) : null}
    </div>
  );
}


/** WIB calendar date of `ms` as "19 Okt". */
function wibDayText(ms: number): string {
  const d = new Date(ms + 7 * 3600_000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] || ""}`.trim();
}

function Chart({ days, hourly }: { days: DayRow[]; hourly: HourRow[] }) {
  const [mode, setMode] = useState<"days" | "hours">("hours");
  const hasHours = hourly.some((r) => (Number(r.views) || 0) > 0);
  const showHours = mode === "hours" && hasHours;
  const W = 720;
  const H = 120;
  const series = useMemo(() => {
    if (showHours) {
      const last = hourly.length - 1;
      return hourly.map((r, i) => ({
        label: i === last ? "Sekarang" : hourText(r.hour),
        value: Number(r.views) || 0,
        show: (last - i) % 4 === 0,
        now: i === last,
      }));
    }
    const list = days.slice().reverse();
    const last = list.length - 1;
    return list.map((d, i) => ({
      label: i === last ? "Hari ini" : dateText(d.day),
      value: d.views,
      show: (last - i) % 2 === 0,
      now: i === last,
    }));
  }, [showHours, days, hourly]);
  const max = Math.max(1, ...series.map((s) => s.value));
  const bw = W / Math.max(1, series.length);
  // 24-jam view: where today's 00.00 WIB starts (the slots are oldest first).
  const midnight = showHours ? hourly.findIndex((r, i) => i > 0 && /^0?0$/.test(String(r.hour).match(/^(\d{1,2})/)?.[1] || "")) : -1;
  const now = Date.now();
  return (
    <>
      <div className={h2}>
        <span>{showHours ? "Kunjungan halaman · 24 jam terakhir" : "Kunjungan halaman · 14 hari"}</span>
        <span className="flex gap-1">
          {hasHours ? (
            <button type="button" className={toggleCls(showHours)} aria-pressed={showHours} onClick={() => setMode("hours")}>
              24 jam
            </button>
          ) : null}
          <button type="button" className={toggleCls(!showHours)} aria-pressed={!showHours} onClick={() => setMode("days")}>
            14 hari
          </button>
        </span>
      </div>
      <div className="-mx-1 overflow-x-auto px-1" ref={(el) => { if (el) el.scrollLeft = el.scrollWidth; }}>
      <svg viewBox={`0 -32 ${W} ${H + 50}`} className="mt-3 block h-auto w-full min-w-[620px] sm:min-w-0" role="img" aria-label="Grafik kunjungan halaman">
        <defs>
          <linearGradient id="owner-bar-now" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2dd4bf" />
            <stop offset="1" stopColor="#14b8a6" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((k) => (
          <line key={k} x1={0} x2={W} y1={(H * k) / 4} y2={(H * k) / 4} stroke="#232326" strokeDasharray="2 4" />
        ))}
        {showHours ? (
          <>
            <text x={4} y={-20} fontSize={11} className="fill-zinc-500">
              {midnight > 0 ? `Kemarin · ${wibDayText(now - 86_400_000)}` : `Hari ini · ${wibDayText(now)}`}
            </text>
            {midnight > 0 ? (
              <>
                <line x1={midnight * bw} x2={midnight * bw} y1={-28} y2={H} stroke="#2dd4bf" strokeOpacity={0.35} strokeDasharray="3 3" />
                <text x={midnight * bw + 4} y={-20} fontSize={11} className="fill-[#2dd4bf]">
                  {`Hari ini · ${wibDayText(now)}`}
                </text>
              </>
            ) : null}
          </>
        ) : null}
        {series.map((s, i) => {
          const h = (s.value / max) * H;
          return (
            <g key={i}>
              <rect
                x={i * bw + bw * 0.15}
                y={H - h}
                width={bw * 0.7}
                height={h}
                fill={s.now ? "url(#owner-bar-now)" : "#1f3d3a"}
                shapeRendering="crispEdges"
              >
                <title>{`${s.label}: ${fmt(s.value)}`}</title>
              </rect>
              {s.value > 0 ? (
                <text
                  x={i * bw + bw / 2}
                  y={H - h - 4}
                  textAnchor="middle"
                  className={s.now ? "fill-[#2dd4bf]" : "fill-zinc-300"}
                  fontSize={bw < 40 ? 9 : 10}
                >
                  {barNum(s.value)}
                </text>
              ) : null}
              {s.show ? (
                <text
                  x={s.now ? i * bw + bw : i * bw + bw / 2}
                  y={H + 15}
                  textAnchor={s.now ? "end" : "middle"}
                  className={s.now ? "fill-[#2dd4bf]" : "fill-zinc-500"}
                  fontSize={10}
                >
                  {s.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      </div>
    </>
  );
}

function EditRow({
  row,
  secret,
  onDone,
}: {
  row: CatalogRow;
  secret: string;
  onDone: (note: string, saved?: { title?: string | null; category?: string | null }) => void;
}) {
  const [title, setTitle] = useState(row.title);
  const [cat, setCat] = useState(row.category);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    setBusy(true);
    const body: Record<string, unknown> = { action: "edit-video", id: row.id };
    if (title.trim() && title.trim() !== row.title) body.title = title.trim();
    if (cat && cat !== row.category) body.category = cat;
    if (!body.title && !body.category) {
      setBusy(false);
      onDone("Tidak ada perubahan.");
      return;
    }
    setErr("");
    const d = await ownerPost<{ ok?: boolean; error?: string; title?: string | null; category?: string | null }>(
      secret,
      body,
    );
    setBusy(false);
    // Failure keeps the editor open with the server's message next to the fields.
    if (!d.ok) {
      setErr(`Gagal: ${d.error || "tidak diketahui"}`);
      return;
    }
    onDone("Tersimpan. Tampil di situs dalam ±1 menit.", { title: d.title, category: d.category });
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-white/[0.07] p-2">
      <input className={`${input} min-w-0 flex-1 basis-48`} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Judul" />
      <select className={input} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Kategori">
        {CATEGORY_LIST.some((c) => c.slug === row.category) ? null : <option value={row.category}>{row.categoryLabel}</option>}
        {CATEGORY_LIST.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.label}
          </option>
        ))}
      </select>
      <button type="button" className={toggleCls(true)} disabled={busy} onClick={() => void save()}>
        {busy ? "..." : "Simpan"}
      </button>
      {err ? <p className="basis-full text-[13px] text-red-400">{err}</p> : null}
    </div>
  );
}

function VideoRows({
  rows,
  secret,
  showTime,
  onChanged,
}: {
  rows: CatalogRow[];
  secret: string;
  showTime?: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [menu, setMenu] = useState("");
  // Saved edits shown right away (the server list catches up after its next catalog sync).
  const [patched, setPatched] = useState<Record<string, { title?: string; categoryLabel?: string; category?: string }>>({});
  async function hide(r: CatalogRow) {
    setBusy(r.id);
    try {
      const res = await fetch("/api/player-log", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action: "owner-hide", id: r.id, hide: true }),
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      setNote(d?.ok ? "Disembunyikan (bisa ditampilkan lagi dari Player error)." : "");
      if (!d?.ok) ownerToast(`Gagal menyembunyikan: ${d?.error || res.status}`);
      if (d?.ok) onChanged();
    } catch {
      ownerToast("Gagal menyembunyikan: jaringan error.");
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      {note ? <p className="mt-2 text-[13px] text-zinc-400">{note}</p> : null}
      <ul className="mt-2">
        {rows.map((r0) => {
          const r = { ...r0, ...(patched[r0.id] || {}) };
          return (
          <li key={r.id} className="border-t border-white/[0.05] py-2">
            <div className="flex items-center gap-3">
              <img
                src={`/thumb/${r.id}`}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-9 w-16 shrink-0 rounded bg-zinc-900 object-cover"
              />
              <a href={`/watch/${r.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm leading-snug text-zinc-100">{r.title || r.id}</span>
                <span className={`mt-0.5 block text-[13px] leading-snug ${r.noThumb ? "text-amber-300" : "text-zinc-400"}`}>
                  {r.categoryLabel} · {r.source}
                  {r.noThumb ? " · tanpa thumbnail" : showTime && r.createdAt ? ` · ${timeWib(r.createdAt)}` : ""}
                  {r.locked ? " · terkunci" : r.hidden ? " · tersembunyi" : ""}
                </span>
              </a>
              {r.locked || r.hidden ? null : (
                <>
                  <span className="hidden shrink-0 gap-1 sm:flex">
                    <button type="button" className={btn} onClick={() => setEditing((v) => (v === r.id ? "" : r.id))}>
                      Edit
                    </button>
                    <button type="button" className={btn} disabled={busy === r.id} onClick={() => void hide(r)}>
                      Sembunyikan
                    </button>
                  </span>
                  <span className="relative shrink-0 sm:hidden">
                    <button
                      type="button"
                      className={`${btn} px-2.5 text-sm leading-none`}
                      aria-label="Menu video"
                      aria-expanded={menu === r.id}
                      onClick={() => setMenu((v) => (v === r.id ? "" : r.id))}
                    >
                      ⋯
                    </button>
                    {menu === r.id ? (
                      <span className="absolute right-0 top-full z-20 mt-1 flex w-36 flex-col overflow-hidden rounded-md border border-white/[0.12] bg-[#18181c] shadow-xl shadow-black/50">
                        <button
                          type="button"
                          className="px-3 py-2 text-left text-[13px] text-zinc-200 hover:bg-white/[0.06]"
                          onClick={() => {
                            setMenu("");
                            setEditing((v) => (v === r.id ? "" : r.id));
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="border-t border-white/[0.06] px-3 py-2 text-left text-[13px] text-zinc-200 hover:bg-white/[0.06] disabled:opacity-50"
                          disabled={busy === r.id}
                          onClick={() => {
                            setMenu("");
                            void hide(r);
                          }}
                        >
                          Sembunyikan
                        </button>
                      </span>
                    ) : null}
                  </span>
                </>
              )}
            </div>
            {editing === r.id ? (
              <EditRow
                row={r}
                secret={secret}
                onDone={(n, saved) => {
                  setNote(n);
                  setEditing("");
                  if (saved) {
                    const cat = saved.category ? CATEGORY_LIST.find((c) => c.slug === saved.category) : undefined;
                    setPatched((p) => ({
                      ...p,
                      [r.id]: {
                        ...(p[r.id] || {}),
                        ...(saved.title ? { title: saved.title } : {}),
                        ...(saved.category ? { category: saved.category, categoryLabel: cat?.label || saved.category } : {}),
                      },
                    }));
                  }
                }}
              />
            ) : null}
          </li>
          );
        })}
      </ul>
    </>
  );
}

/** Results for the search box in the "Upload terbaru" header (owner-only, in-memory search). */
function SearchResults({ secret, q }: { secret: string; q: string }) {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [tick, setTick] = useState(0);
  const [searchNote, setSearchNote] = useState("Mencari…");
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRows([]);
      setSearchNote("Ketik minimal 2 huruf.");
      return;
    }
    setSearchNote("Mencari…");
    const t = window.setTimeout(async () => {
      const d = await ownerPost<{ ok?: boolean; error?: string; items?: CatalogRow[] }>(secret, {
        action: "catalog-search",
        q: term,
      });
      setRows(d.items || []);
      setSearchNote(d.ok ? (d.items?.length ? "" : "Tidak ditemukan.") : "");
      if (!d.ok) ownerToast(`Pencarian gagal: ${d.error || "jaringan"}`);
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, secret, tick]);
  return (
    <>
      <p className="mt-3 text-[13px] text-zinc-400">
        {searchNote || `${fmt(rows.length)} hasil untuk "${q.trim()}"${rows.length >= 20 ? " (maks 20)" : ""}`}
      </p>
      {rows.length ? <VideoRows rows={rows} secret={secret} onChanged={() => setTick((n) => n + 1)} /> : null}
    </>
  );
}

function TopVideos({ videos }: { videos: NonNullable<OwnerStats["topVideos"]> }) {
  const [note, setNote] = useState("");
  const text = videos.map((v) => `${String(v.title || "").trim() || v.id}\n${SITE_ORIGIN}${v.path}`).join("\n\n");
  async function copyAll() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setNote("Tersalin.");
    } catch {
      window.prompt("Salin semua link:", text);
    }
  }
  async function shareAll() {
    if (!text) return;
    if (typeof navigator.share !== "function") return void copyAll();
    try {
      await navigator.share({ title: "Video paling banyak dibuka 24 jam terakhir", text });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      void copyAll();
    }
  }
  return (
    <>
      <div className={h2}>
        <span>Paling banyak dibuka 24 jam</span>
        <span className="flex gap-1">
          <button type="button" className={btn} disabled={!videos.length} onClick={() => void copyAll()}>
            Salin
          </button>
          <button type="button" className={btn} disabled={!videos.length} onClick={() => void shareAll()}>
            Bagikan
          </button>
        </span>
      </div>
      {note ? <p className="mt-2 text-[13px] text-zinc-400">{note}</p> : null}
      {videos.length ? (
        <ul className="mt-2">
          {videos.slice(0, 5).map((v, i) => (
            <li key={v.id} className="flex items-center gap-3 border-t border-white/[0.05] py-2">
              <span className="w-4 shrink-0 text-[13px] text-[#2dd4bf]/60">{i + 1}</span>
              <img src={`/thumb/${v.id}`} alt="" loading="lazy" decoding="async" className="h-9 w-16 shrink-0 rounded bg-zinc-900 object-cover" />
              <a href={v.path} target="_blank" rel="noopener" className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm leading-snug text-zinc-100">{v.title || v.id}</span>
                {v.category ? <span className="block truncate text-[13px] text-zinc-400">{v.category}</span> : null}
              </a>
              <span className="shrink-0 text-[13px] tabular-nums text-zinc-400">{fmt(v.views)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-zinc-500">Belum ada.</p>
      )}
    </>
  );
}

export function OwnerOverview(props: {
  secret: string;
  online: number;
  stats: OwnerStats | null;
  days: DayRow[];
  devices: { device: string; views: number; pct: number }[];
  tickAt: number;
  error: string | null;
  /** Bumped by owner-panel on open / Refresh / tab back: reloads the catalog overview + thumbnail list. */
  reloadKey?: number;
  playerLog?: PlayerLogData | null;
  botOk?: boolean | null;
  onShowGone?: () => void;
  /** Legacy props from owner-authed-top.tsx (no longer shown: no percentages). */
  vsUniq?: string | null;
  vsViews?: string | null;
}) {
  const { secret, online, days, devices, error } = props;
  const reloadKey = props.reloadKey ?? 0;
  const playerLog = props.playerLog ?? null;
  const botOk = props.botOk ?? null;
  const onShowGone = props.onShowGone ?? (() => undefined);
  const stats = props.stats as Stats | null;
  const [ov, setOv] = useState<Overview | null>(null);
  const [filter, setFilter] = useState<RecentFilter>("");
  const [ovBusy, setOvBusy] = useState(false);
  const [q, setQ] = useState("");
  const [healthRange, setHealthRange] = useState<HealthRange>("today");

  const filterBody = useCallback(
    (f: RecentFilter) => (f === "nothumb" ? { noThumb: true } : f ? { source: f } : {}),
    [],
  );

  const loadOverview = useCallback(async () => {
    if (!secret) return;
    setOvBusy(true);
    try {
      const d = await ownerPost<Overview>(secret, { action: "catalog-overview", limit: PAGE, ...filterBody(filter) });
      if (d.ok) setOv(d);
      else {
        setOv((prev) => ({ ...(prev || {}), ok: false, error: d.error || "Gagal memuat." }));
        if (d.error !== "forbidden") ownerToast(`Gagal memuat katalog: ${d.error || "tidak diketahui"}`, "error", { label: "Coba lagi", run: () => void loadOverview() });
      }
    } finally {
      setOvBusy(false);
    }
  }, [secret, filter, filterBody]);

  const loadMore = useCallback(async () => {
    if (!secret || !ov?.recent) return;
    setOvBusy(true);
    try {
      const d = await ownerPost<Overview>(secret, {
        action: "catalog-overview",
        offset: ov.recent.length,
        limit: PAGE,
        ...filterBody(filter),
      });
      if (d.ok) {
        const have = new Set(ov.recent.map((r) => r.id));
        setOv({ ...d, recent: [...ov.recent, ...(d.recent || []).filter((r) => !have.has(r.id))] });
      } else {
        ownerToast(`Gagal memuat: ${d.error || "tidak diketahui"}`);
      }
    } finally {
      setOvBusy(false);
    }
  }, [secret, ov, filter, filterBody]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview, reloadKey]);

  const hourly = stats?.hourly || [];
  const busiest = useMemo(() => {
    let best: HourRow | null = null;
    for (const r of hourly) {
      const v = Number(r.views) || 0;
      if (v > 0 && (!best || v > (Number(best.views) || 0))) best = r;
    }
    return best ? hourText(best.hour) : null;
  }, [hourly]);
  const mobile = devices.find((d) => d.device === "mobile");
  const deviceTotal = devices.reduce((s, d) => s + (Number(d.views) || 0), 0);

  const breakdown = useMemo(() => {
    const sources = mergeRows(
      (stats?.topRefs || []).map((r) => ({ key: r.ref, label: refName(r.ref), views: Number(r.views) || 0 })),
    );
    const deviceRows = mergeRows(
      devices.map((d) => ({ key: d.device, label: DEVICE_NAMES[d.device] || d.device, views: Number(d.views) || 0 })),
    );
    const browsers = mergeRows(
      (stats?.browsers || []).map((b) => ({
        key: b.browser,
        label: BROWSER_NAMES[b.browser] || b.browser,
        views: Number(b.views) || 0,
      })),
    );
    const countries = mergeRows(
      (stats?.countries || []).map((c) => ({ key: c.country || "-", label: countryName(c.country), views: Number(c.views) || 0 })),
    );
    return { sources, deviceRows, browsers, countries };
  }, [stats, devices]);

  // Category with the most views among today's top videos (the only per-category views we have).
  const topCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of stats?.topVideos || []) {
      const c = String(v.category || "").trim();
      if (!c) continue;
      m.set(c, (m.get(c) || 0) + (Number(v.views) || 0));
    }
    const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? { label: best[0], views: best[1] } : null;
  }, [stats]);

  const cats = (ov?.categories || []).slice(0, 10);
  const catMax = Math.max(1, ...cats.map((c) => c.count));

  const todaySources = Object.entries(ov?.todayBySource || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, n]) => `${shortSource(k)} ${fmt(n)}`)
    .join(" · ");
  const sourceChips = Object.entries(ov?.bySource || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const allCount = Object.values(ov?.bySource || {}).reduce((s, n) => s + n, 0);

  // Hari ini / Kemarin come from the same owner read as 7 hari (WIB calendar days); nothing extra is fetched.
  const healthMeta = HEALTH_RANGES.find((r) => r.key === healthRange) || HEALTH_RANGES[2];
  const dayData = healthRange === "today" ? playerLog?.today : healthRange === "yesterday" ? playerLog?.yesterday : null;
  const dayMissing = healthRange !== "week" && playerLog != null && !dayData;
  const hostRows = (healthRange === "week" ? playerLog?.hosts || [] : dayData?.hosts || [])
    .map((h) => ({ ...h, label: hostLabel(h.host) }))
    .sort((a, b) => b.starts - a.starts);

  function showThumbs() {
    document.getElementById("thumb-kosong")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const shownTotal = ov?.total ?? null;
  const listHidden = shownTotal != null && allCount > shownTotal ? allCount - shownTotal : 0;
  const searching = q.trim().length > 0;

  const playerCard = (
    <section className={`${card} h-full`}>
      <div className={h2}>
        <span>Kesehatan player</span>
        <span className={h2note}>gagal dari klik play</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Rentang Kesehatan player">
        {HEALTH_RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            className={toggleCls(healthRange === r.key)}
            aria-pressed={healthRange === r.key}
            onClick={() => setHealthRange(r.key)}
          >
            {r.label}
          </button>
        ))}
        {dayData?.day ? <span className="text-[13px] text-zinc-500">{dateText(dayData.day)} WIB</span> : null}
      </div>
      {playerLog == null ? (
        <p className="mt-3 text-sm text-zinc-400">Memuat…</p>
      ) : dayMissing ? (
        <p className="mt-3 text-sm text-zinc-400">Angka harian muncul setelah update terbaru selesai dipasang. Tekan Refresh.</p>
      ) : hostRows.length ? (
        <ul className="mt-3 space-y-2">
          {hostRows.map((h) => {
            const bad = h.starts > 0 && h.fails / h.starts >= 0.05;
            return (
              <li key={h.host} className="flex items-center gap-2 text-sm">
                <span className={`size-2 shrink-0 ${h.starts === 0 ? "bg-zinc-600" : bad ? "bg-red-400" : "bg-emerald-400"}`} />
                <span className="min-w-0 flex-1 truncate text-zinc-200">{h.label}</span>
                <span className={`shrink-0 tabular-nums ${bad ? "text-red-300" : "text-zinc-300"}`}>
                  {fmt(h.fails)} gagal dari {fmt(h.starts)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-zinc-400">{healthRange === "week" ? "Belum ada." : `Belum ada klik play ${healthMeta.total}.`}</p>
      )}
      {hostRows.length ? (
        <p className="mt-3 border-t border-white/[0.06] pt-2 text-[13px] leading-snug text-zinc-400">
          Total klik play {healthMeta.total}: <b className="font-medium text-zinc-200">{fmt(hostRows.reduce((n, h) => n + (Number(h.starts) || 0), 0))}</b>, gagal{" "}
          <b className="font-medium text-zinc-200">{fmt(hostRows.reduce((n, h) => n + (Number(h.fails) || 0), 0))}</b>.
          Dihitung sekali per video per sesi saat tombol play ditekan (Videy dihitung mulai 19 Okt malam); tidak
          memastikan videonya benar-benar jalan sampai habis.
        </p>
      ) : null}
    </section>
  );

  return (
    <>
      <AlertStrip
        noThumb={ov?.noThumb ?? null}
        gone={playerLog ? (playerLog.gone || []).length : null}
        suspect={playerLog?.suspect || 0}
        deadCheckedAt={ov?.status?.deadCheckedAt || playerLog?.checkedAt || null}
        onShowThumbs={showThumbs}
        onShowGone={onShowGone}
      />

      <section className={card}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCell label="Online" value={fmt(online)} sub={`puncak ${fmt(stats?.peakToday)}`} />
          <StatCell label="Unik" value={fmt(stats?.uniqueToday)} sub={`kemarin ${fmt(stats?.yesterdayUnique)}`} />
          <StatCell label="Kunjungan halaman" value={fmt(stats?.viewsToday)} sub={`kemarin ${fmt(stats?.yesterdayViews)}`} />
          <StatCell label="7 hari" value={compact(stats?.views7d || 0)} sub="kunjungan halaman" />
          <StatCell label="Video tampil" value={shownTotal != null ? fmt(shownTotal) : "-"} sub="di situs (tanpa yang tersembunyi)" />
          <StatCell
            label="Upload hari ini"
            value={ov?.uploadedToday != null ? fmt(ov.uploadedToday) : "-"}
            sub={todaySources || (ov?.uploadedWeek != null ? `minggu ini ${fmt(ov.uploadedWeek)}` : null)}
          />
          <StatCell label="Tersembunyi" value={ov?.hidden != null ? fmt(ov.hidden) : "-"} sub="video" />
          <StatCell
            label="Kategori teratas"
            value={topCat ? topCat.label : "-"}
            sub={topCat ? `${fmt(topCat.views)} kunjungan dari video paling banyak dibuka` : "belum ada data"}
          />
        </div>
        <p className="mt-3 text-[13px] text-zinc-400">
          Angka pengunjung disimpan sementara 5 menit di server (hemat Cloudflare); online dihitung langsung.
          {stats?.hint ? ` · ${stats.hint}` : ""}
        </p>
        {error ? <p className="mt-1 text-sm text-red-300">{error}</p> : null}
      </section>

      <section className={card}>
        <Chart days={days} hourly={hourly} />
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-300">
          <span>
            Hari ini <b className="font-medium text-[#2dd4bf]">{fmt(stats?.viewsToday)}</b> kunjungan halaman (semua halaman, bukan jumlah video diputar)
          </span>
          {busiest ? (
            <span>
              Paling rame jam <b className="font-medium text-[#2dd4bf]">{busiest}</b>
            </span>
          ) : null}
          {mobile && deviceTotal > 0 ? (
            <span>
              Dibuka dari HP: <b className="font-medium text-[#2dd4bf]">{fmt(mobile.views)}</b> dari {fmt(deviceTotal)}
            </span>
          ) : null}
        </div>
      </section>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <section className={`${card} h-full`}>
          <div className={h2}>
            <span>Pengunjung hari ini</span>
            <span className={h2note}>angka = kunjungan halaman</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4">
            <CountList title="Sumber" rows={breakdown.sources} />
            <CountList title="Perangkat" rows={breakdown.deviceRows} />
            <CountList title="Browser" rows={breakdown.browsers} />
            <CountList title="Negara" rows={breakdown.countries} />
          </div>
        </section>
        {playerCard}
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <MoneyCard />
        <StatusCard botOk={botOk} status={ov?.status || null} playerLog={playerLog} />
      </div>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={h2}>Upload terbaru</span>
          <span className="flex w-full flex-1 items-center gap-2 sm:w-auto sm:max-w-md">
            <input
              className={`${input} min-w-0 flex-1`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari judul / id / kode JAV"
              aria-label="Cari video"
              type="search"
            />
            {searching ? (
              <button type="button" className={btn} onClick={() => setQ("")}>
                Tutup
              </button>
            ) : (
              <button type="button" className={btn} disabled={ovBusy} onClick={() => void loadOverview()}>
                {ovBusy ? "Memuat…" : "Muat ulang"}
              </button>
            )}
          </span>
        </div>
        {searching ? (
          <SearchResults secret={secret} q={q} />
        ) : (
          <>
            {sourceChips.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button type="button" className={toggleCls(filter === "")} aria-pressed={filter === ""} onClick={() => setFilter("")}>
                  Semua {fmt(allCount)}
                </button>
                {sourceChips.map(([src, n]) => (
                  <button
                    key={src}
                    type="button"
                    className={toggleCls(filter === src)}
                    aria-pressed={filter === src}
                    onClick={() => setFilter(src)}
                  >
                    {shortSource(src)} {fmt(n)}
                  </button>
                ))}
                {ov?.noThumb ? (
                  <button
                    type="button"
                    className={toggleCls(filter === "nothumb")}
                    aria-pressed={filter === "nothumb"}
                    onClick={() => setFilter("nothumb")}
                  >
                    Tanpa thumbnail {fmt(ov.noThumb)}
                  </button>
                ) : null}
              </div>
            ) : null}
            {listHidden ? (
              <p className="mt-2 text-[13px] text-zinc-400">
                Angka di tombol termasuk {fmt(listHidden)} video tersembunyi ({fmt(shownTotal)} tampil di situs).
              </p>
            ) : null}
            {ov?.error ? <p className="mt-2 text-sm text-red-300">{ov.error}</p> : null}
            {ov?.checkJav?.length ? (
              <div className="mt-3 rounded-md border border-amber-400/30 p-2">
                <p className="text-sm font-semibold text-amber-300">Perlu dicek: Jav berjudul Episode/Ep ({ov.checkJav.length})</p>
                {ov.checkJav.map((r) => (
                  <div key={r.id} className="mt-1 flex items-center gap-2 text-[13px]">
                    <a className="min-w-0 flex-1 truncate text-zinc-300" href={`/watch/${r.id}`} target="_blank" rel="noreferrer">
                      {r.title}
                    </a>
                    <button
                      type="button"
                      className={toggleCls(true)}
                      onClick={async () => {
                        const d = await ownerPost<{ ok?: boolean; error?: string }>(secret, { action: "edit-video", id: r.id, category: "hentai" });
                        if (!d.ok) window.alert(`Gagal: ${d.error || "tidak diketahui"}`);
                        void loadOverview();
                      }}
                    >
                      → Hentai
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {ov?.recent?.length ? (
              <>
                <VideoRows rows={ov.recent} secret={secret} showTime onChanged={() => void loadOverview()} />
                {ov.recentTotal != null && ov.recent.length < ov.recentTotal ? (
                  <button type="button" className={`${btn} mt-2 w-full py-2`} disabled={ovBusy} onClick={() => void loadMore()}>
                    {ovBusy ? "Memuat…" : `Muat lagi (${fmt(ov.recent.length)} dari ${fmt(ov.recentTotal)})`}
                  </button>
                ) : null}
              </>
            ) : ov?.recent ? (
              <p className="mt-3 text-sm text-zinc-400">Belum ada upload.</p>
            ) : !ov?.error ? (
              <p className="mt-3 text-sm text-zinc-400">Memuat…</p>
            ) : null}
          </>
        )}
      </section>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <section className={`${card} h-full`}>
          <div className={h2}>
            <span>Kategori</span>
            <span className={h2note}>jumlah video tampil</span>
          </div>
          {cats.length ? (
            <ul className="mt-3 space-y-2">
              {cats.map((c) => (
                <li key={c.slug} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 truncate text-zinc-300 sm:w-40">{c.label}</span>
                  <span className="h-2 flex-1 bg-white/[0.06]">
                    <span
                      className="block h-full bg-gradient-to-r from-[#14b8a6]/50 to-[#2dd4bf]"
                      style={{ width: `${(c.count / catMax) * 100}%` }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right tabular-nums text-zinc-300">{fmt(c.count)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">{ov ? "Belum ada." : "Memuat…"}</p>
          )}
        </section>
        <section className={`${card} h-full`}>
          <TopVideos videos={stats?.topVideos || []} />
        </section>
      </div>

      <div className="mt-4">
        <OwnerHeroCard secret={secret} />
      </div>

      <ThumbMissingCard secret={secret} reloadKey={reloadKey} />
    </>
  );
}
