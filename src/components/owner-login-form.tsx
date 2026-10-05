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
<form onSubmit={onSubmit} className="rounded-2xl border border-white/[0.08] bg-[#141416] p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Shield className="size-4 text-emerald-400" />
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
