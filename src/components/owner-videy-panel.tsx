"use client";

const glass = "rounded-xl border border-white/[0.07] bg-[#101214] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={glass + " p-4"}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{title}</p>
      <div className="mt-2 text-[13px] text-zinc-300">{children}</div>
    </div>
  );
}

/** /pemilik → tab Videyy: ringkasan situs satelit videyy.icu. Fitur detail menyusul. */
export function OwnerVideyPanel() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Card title="Situs">
          <a href="https://videyy.pages.dev" target="_blank" rel="noopener noreferrer" className="font-medium text-[#5eead4] hover:underline">
            videyy.pages.dev
          </a>
          <p className="mt-1 text-[12px] text-zinc-500">Live di Cloudflare Pages</p>
        </Card>
        <Card title="Domain">
          <p className="font-medium text-zinc-200">videyy.icu</p>
          <p className="mt-1 text-[12px] text-zinc-500">Belum disambungkan</p>
        </Card>
        <Card title="Repo">
          <a href="https://github.com/fashfdhgacd/videyy" target="_blank" rel="noopener noreferrer" className="font-medium text-sky-300 hover:underline">
            github.com/fashfdhgacd/videyy
          </a>
          <p className="mt-1 text-[12px] text-zinc-500">Private — deploy manual via wrangler</p>
        </Card>
        <Card title="Katalog">
          <p className="font-medium text-zinc-200">608 video Videy</p>
          <p className="mt-1 text-[12px] text-zinc-500">Static build — update butuh rebuild</p>
        </Card>
      </div>

      <div className={glass + " p-4"}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Sinkronisasi & deploy</p>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
          Panel ini akan jadi pusat kendali videyy.icu — sinkron katalog dari usulan yang disetujui,
          trigger rebuild/deploy, dan monitoring. Detail fitur menyusul dari kamu.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="https://videyy.pages.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-200 hover:border-zinc-500"
          >
            Buka videyy.pages.dev
          </a>
          <a
            href="https://github.com/fashfdhgacd/videyy"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-200 hover:border-zinc-500"
          >
            Buka repo
          </a>
        </div>
      </div>
    </div>
  );
}
