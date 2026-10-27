"use client";

import type { OwnerStats, DayRow } from "@/components/owner-dashboard-shared";
import { OwnerOverview } from "@/components/owner-overview";
import { OwnerPosterFill } from "@/components/owner-poster-fill";
import { OwnerTools } from "@/components/owner-tools";
import { OwnerVideyUntitled } from "@/components/owner-videy-untitled";

/** /pemilik top: stats, chart, uploads, search, categories, player health, top videos, then Tambah video + Ambil link. */
export function OwnerAuthedTop(props: {
  online: number;
  stats: OwnerStats | null;
  tickAt: number;
  error: string | null;
  vsUniq: string | null;
  vsViews: string | null;
  secret: string;
  days: DayRow[];
  devices: { device: string; views: number; pct: number }[];
}) {
  const { online, stats, tickAt, error, vsUniq, vsViews, secret, days, devices } = props;
  return (
    <>
      <OwnerOverview
        secret={secret}
        online={online}
        stats={stats}
        days={days}
        devices={devices}
        tickAt={tickAt}
        error={error}
        vsUniq={vsUniq}
        vsViews={vsViews}
      />
      <OwnerPosterFill secret={secret} />
      <OwnerVideyUntitled secret={secret} />
      <OwnerTools secret={secret} />
    </>
  );
}
