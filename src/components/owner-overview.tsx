"use client";

// /pemilik top half: stats row, chart (14 hari / 24 jam), recent uploads, search + edit,
// categories today, player health, top videos with thumbnails. Edits and hides go through
// owner-only APIs; the minor-lock is enforced on the server (owner-tools.ts).
import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORY_LIST } from "@/lib/catalog/categories";
import { fmt, type OwnerStats, type DayRow } from "@/components/owner-dashboard-shared";

const SITE_ORIGIN = "https://koleksidrpinguin.com";

type HourRow = { hour: string; views: number };
type Stats = OwnerStats & { hourly?: HourRow[] };

export type CatalogRow = {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  source: string;
  createdAt: number;
  hidden: boolean;
  locked: boolean;
};

type Overview = {
  ok?: boolean;
  error?: string;
  total?: number;
  hidden?: number;
  uploadedToday?: number;
  uploadedWeek?: number;
  recent?: CatalogRow[];
};

type HostRow = { host: string; starts: number; fails: number; rate: number | null };

const card = "min-w-0 rounded-xl border border-white/[0.07] border-t-[#2dd4bf]/35 bg-[#121215] p-4";
const h2 = "flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2dd4bf]";
const btn =
  "shrink-0 whitespace-nowrap rounded-md border border-white/[0.12] bg-[#16161a] px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/[0.06] disabled:opacity-50";
const input = "rounded-md border border-white/[0.1] bg-[#0c0c0e] px-2 py-1.5 text-xs text-zinc-200";

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
  return host;
}

// Server sends hourly as 24 slots, oldest first, labelled with the WIB hour ("00".."23").
function hourText(label: string): string {
  const m = String(label).match(/^(\d{1,2})/);
  return m ? `${m[1].padStart(2, "0")}.00` : String(label);
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

async function ownerPost<T>(secret: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch("/api/owner-tools", {
      method: "POST",
      headers: { "content-type": "application/json", "x-online-key": secret },
      body: JSON.stringify(body),
    });
    return ((await res.json().catch(() => null)) as T | null) ?? null;
  } catch {
    return null;
  }
}

function StatCell({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="min-w-0 px-3 py-1 first:pl-0">
      <p className="truncate text-[10px] uppercase tracking-[0.12em] text-[#2dd4bf]/80">{label}</p>
      <p className="mt-1 text-xl tabular-nums text-zinc-50 sm:text-[22px]">{value}</p>
      {sub ? (
        <p className="truncate text-[11px] text-zinc-500">
          {sub}
        </p>
      ) : null}
    </div>
  );
}


function Chart({ days, hourly }: { days: DayRow[]; hourly: HourRow[] }) {
  const [mode, setMode] = useState<"days" | "hours">("days");
  const hasHours = hourly.some((r) => (Number(r.views) || 0) > 0);
  const showHours = mode === "hours" && hasHours;
  const W = 720;
  const H = 120;
  const series = useMemo(() => {
    if (showHours) {
      const last = hourly.length - 1;
      return hourly.map((r, i) => ({
        label: hourText(r.hour),
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
  return (
    <>
      <div className={h2}>
        <span>Tayang</span>
        <span className="flex gap-1">
          {hasHours ? (
            <button type="button" className={`${btn} ${showHours ? "border-[#2dd4bf] bg-[#2dd4bf] text-zinc-950" : ""}`} onClick={() => setMode("hours")}>
              24 jam
            </button>
          ) : null}
          <button type="button" className={`${btn} ${!showHours ? "border-[#2dd4bf] bg-[#2dd4bf] text-zinc-950" : ""}`} onClick={() => setMode("days")}>
            14 hari
          </button>
        </span>
      </div>
      <svg viewBox={`0 -4 ${W} ${H + 22}`} className="mt-3 block h-auto w-full" role="img" aria-label="Grafik tayang">
        <defs>
          <linearGradient id="owner-bar-now" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2dd4bf" />
            <stop offset="1" stopColor="#14b8a6" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((k) => (
          <line key={k} x1={0} x2={W} y1={(H * k) / 4} y2={(H * k) / 4} stroke="#232326" strokeDasharray="2 4" />
        ))}
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
              {s.show ? (
                <text x={i * bw + bw / 2} y={H + 15} textAnchor="middle" className="fill-zinc-600" fontSize={10}>
                  {s.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
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
  onDone: (note: string) => void;
}) {
  const [title, setTitle] = useState(row.title);
  const [cat, setCat] = useState(row.category);
  const [busy, setBusy] = useState(false);
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
    const d = await ownerPost<{ ok?: boolean; error?: string }>(secret, body);
    setBusy(false);
    onDone(d?.ok ? "Tersimpan, aktif setelah build berikutnya." : `Gagal: ${d?.error || "jaringan"}`);
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
      <button type="button" className={`${btn} border-[#2dd4bf] bg-[#2dd4bf] text-zinc-950`} disabled={busy} onClick={() => void save()}>
        {busy ? "..." : "Simpan"}
      </button>
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
  async function hide(r: CatalogRow) {
    setBusy(r.id);
    try {
      const res = await fetch("/api/player-log", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action: "owner-hide", id: r.id, hide: true }),
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      setNote(d?.ok ? "Disembunyikan." : `Gagal: ${d?.error || res.status}`);
      if (d?.ok) onChanged();
    } catch {
      setNote("Jaringan error.");
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      {note ? <p className="mt-2 text-xs text-zinc-400">{note}</p> : null}
      <ul className="mt-2">
        {rows.map((r) => (
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
                <span className="block truncate text-xs text-zinc-100">{r.title || r.id}</span>
                <span className="block truncate text-[11px] text-zinc-500">
                  {r.categoryLabel} · {r.source}
                  {showTime && r.createdAt ? ` · ${timeWib(r.createdAt)}` : ""}
                  {r.locked ? " · terkunci" : r.hidden ? " · tersembunyi" : ""}
                </span>
              </a>
              {r.locked || r.hidden ? null : (
                <span className="flex shrink-0 gap-1">
                  <button type="button" className={btn} onClick={() => setEditing((v) => (v === r.id ? "" : r.id))}>
                    Edit
                  </button>
                  <button type="button" className={btn} disabled={busy === r.id} onClick={() => void hide(r)}>
                    Sembunyikan
                  </button>
                </span>
              )}
            </div>
            {editing === r.id ? (
              <EditRow
                row={r}
                secret={secret}
                onDone={(n) => {
                  setNote(n);
                  setEditing("");
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

function SearchBox({ secret }: { secret: string }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRows([]);
      return;
    }
    const t = window.setTimeout(async () => {
      const d = await ownerPost<{ ok?: boolean; items?: CatalogRow[] }>(secret, { action: "catalog-search", q: term });
      setRows(d?.items || []);
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, secret, tick]);
  return (
    <>
      <div className={h2}>Cari video</div>
      <input
        className={`${input} mt-3 w-full`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="judul / id / kode JAV"
        aria-label="Cari video"
      />
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
      await navigator.share({ title: "Video terpopuler hari ini", text });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      void copyAll();
    }
  }
  return (
    <>
      <div className={h2}>
        <span>Terpopuler hari ini</span>
        <span className="flex gap-1">
          <button type="button" className={btn} disabled={!videos.length} onClick={() => void copyAll()}>
            Salin
          </button>
          <button type="button" className={btn} disabled={!videos.length} onClick={() => void shareAll()}>
            Bagikan
          </button>
        </span>
      </div>
      {note ? <p className="mt-2 text-xs text-zinc-400">{note}</p> : null}
      {videos.length ? (
        <ul className="mt-2">
          {videos.slice(0, 10).map((v, i) => (
            <li key={v.id} className="flex items-center gap-3 border-t border-white/[0.05] py-2">
              <span className="w-4 shrink-0 text-[11px] text-[#2dd4bf]/60">{i + 1}</span>
              <img src={`/thumb/${v.id}`} alt="" loading="lazy" decoding="async" className="h-9 w-16 shrink-0 rounded bg-zinc-900 object-cover" />
              <a href={v.path} target="_blank" rel="noopener" className="min-w-0 flex-1">
                <span className="block truncate text-xs text-zinc-100">{v.title || v.id}</span>
                {v.category ? <span className="block truncate text-[11px] text-zinc-500">{v.category}</span> : null}
              </a>
              <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">{fmt(v.views)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-zinc-600">Belum ada.</p>
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
  vsUniq: string | null;
  vsViews: string | null;
}) {
  const { secret, online, days, devices, tickAt, error } = props;
  const stats = props.stats as Stats | null;
  const [ov, setOv] = useState<Overview | null>(null);
  const [hosts, setHosts] = useState<HostRow[] | null>(null);

  const loadOverview = useCallback(async () => {
    if (!secret) return;
    const d = await ownerPost<Overview>(secret, { action: "catalog-overview" });
    if (d) setOv(d);
  }, [secret]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!secret) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/player-log", { headers: { "x-online-key": secret }, cache: "no-store" });
        const d = (await res.json().catch(() => null)) as { hosts?: HostRow[] } | null;
        if (alive) setHosts(d?.hosts || []);
      } catch {
        if (alive) setHosts([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [secret]);

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

  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of stats?.topVideos || []) {
      const c = String(v.category || "").trim() || "lainnya";
      m.set(c, (m.get(c) || 0) + (Number(v.views) || 0));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [stats]);
  const catMax = Math.max(1, ...cats.map((c) => c[1]));

  const hostRows = (hosts || [])
    .map((h) => ({ ...h, label: hostLabel(h.host) }))
    .sort((a, b) => b.starts - a.starts);

  return (
    <>
      <section className={card}>
        <div className="grid grid-cols-4 gap-y-3 divide-white/[0.06] sm:grid-cols-8 sm:divide-x">
          <StatCell label="Online" value={fmt(online)} sub={`puncak ${fmt(stats?.peakToday)}`} />
          <StatCell label="Unik" value={fmt(stats?.uniqueToday)} sub={`kemarin ${fmt(stats?.yesterdayUnique)}`} />
          <StatCell label="Tayang" value={fmt(stats?.viewsToday)} sub={`kemarin ${fmt(stats?.yesterdayViews)}`} />
          <StatCell label="7 hari" value={compact(stats?.views7d || 0)} sub="tayang" />
          <StatCell label="Total video" value={ov?.total != null ? fmt(ov.total) : "-"} sub="katalog" />
          <StatCell label="Hari ini" value={ov?.uploadedToday != null ? fmt(ov.uploadedToday) : "-"} sub="upload" />
          <StatCell label="Minggu ini" value={ov?.uploadedWeek != null ? fmt(ov.uploadedWeek) : "-"} sub="upload" />
          <StatCell label="Tersembunyi" value={ov?.hidden != null ? fmt(ov.hidden) : "-"} sub="video" />
        </div>
        <p className="mt-2 text-[11px] text-zinc-600">
          {tickAt ? `update ${new Date(tickAt).toLocaleTimeString("id-ID")}` : ""}
          {stats?.hint ? ` · ${stats.hint}` : ""}
        </p>
        {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
      </section>

      <section className={card}>
        <Chart days={days} hourly={hourly} />
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-400">
          <span>
            Hari ini <b className="font-medium text-[#2dd4bf]">{fmt(stats?.viewsToday)}</b> kali ditonton
          </span>
          {busiest ? (
            <span>
              Paling rame jam <b className="font-medium text-[#2dd4bf]">{busiest}</b>
            </span>
          ) : null}
          {mobile && deviceTotal > 0 ? (
            <span>
              Dari HP: <b className="font-medium text-[#2dd4bf]">{fmt(mobile.views)}</b> dari {fmt(deviceTotal)}
            </span>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${card} lg:col-span-2`}>
          <div className={h2}>
            <span>Upload terbaru</span>
            <button type="button" className={btn} onClick={() => void loadOverview()}>
              Muat ulang
            </button>
          </div>
          {ov?.error ? <p className="mt-2 text-xs text-red-400">{ov.error}</p> : null}
          {ov?.recent ? (
            <VideoRows rows={ov.recent} secret={secret} showTime onChanged={() => void loadOverview()} />
          ) : (
            <p className="mt-3 text-xs text-zinc-600">Memuat…</p>
          )}
        </section>
        <div className="flex min-w-0 flex-col gap-4">
          <section className={card}>
            <SearchBox secret={secret} />
          </section>
          <section className={card}>
            <div className={h2}>Kategori hari ini</div>
            {cats.length ? (
              <ul className="mt-2 space-y-1.5">
                {cats.map(([c, n]) => (
                  <li key={c} className="flex items-center gap-2 text-[11px]">
                    <span className="w-20 shrink-0 truncate text-zinc-400">{c}</span>
                    <span className="h-1.5 flex-1 bg-white/[0.05]">
                      <span className="block h-full bg-gradient-to-r from-[#14b8a6]/40 to-[#2dd4bf]" style={{ width: `${(n / catMax) * 100}%` }} />
                    </span>
                    <span className="w-10 shrink-0 text-right tabular-nums text-zinc-400">{fmt(n)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-zinc-600">Belum ada.</p>
            )}
          </section>
          <section className={card}>
            <div className={h2}>
              <span>Kesehatan player</span>
              <span className="text-[10px] font-normal text-zinc-600">7 hari</span>
            </div>
            {hosts == null ? (
              <p className="mt-3 text-xs text-zinc-600">Memuat…</p>
            ) : hostRows.length ? (
              <ul className="mt-2 space-y-1.5">
                {hostRows.map((h) => {
                  const bad = h.starts > 0 && h.fails / h.starts >= 0.05;
                  return (
                    <li key={h.host} className="flex items-center gap-2 text-[11px]">
                      <span className={`size-1.5 shrink-0 ${bad ? "bg-red-400" : "bg-emerald-400"}`} />
                      <span className="flex-1 truncate text-zinc-300">{h.label}</span>
                      <span className={`tabular-nums ${bad ? "text-red-400" : "text-zinc-400"}`}>
                        {fmt(h.fails)} gagal dari {fmt(h.starts)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-zinc-600">Belum ada.</p>
            )}
          </section>
        </div>
      </div>

      <section className={card}>
        <TopVideos videos={stats?.topVideos || []} />
      </section>
    </>
  );
}
