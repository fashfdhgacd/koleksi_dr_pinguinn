"use client";

import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function OwnerLoginForm(props: {
  draft: string;
  setDraft: (v: string) => void;
  error: string | null;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const { draft, setDraft, error, loading, onSubmit } = props;
  return (
<form onSubmit={onSubmit} className="rounded-2xl border border-white/[0.08] bg-[#101214] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5eead4]">Pemilik</div>
            <div className="mb-4 flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-50">
              <Shield className="size-4 text-[#2dd4bf]" />
              Masuk panel
            </div>
            <Input
              type="password"
              autoComplete="off"
              placeholder="ONLINE_VIEW_SECRET"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="mb-3 h-11 border-white/[0.08] bg-[#0f0f11]"
            />
            {error ? <p className="mb-3 text-xs text-red-400">{error}</p> : null}
            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading ? "Memeriksa..." : "Masuk"}
            </Button>
          </form>
  );
}
