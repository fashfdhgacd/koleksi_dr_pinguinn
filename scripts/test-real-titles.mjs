// Tes judul/poster asli (generic title fix): node scripts/test-real-titles.mjs  (exit 1 kalau gagal)
// Loads the real catalog modules through Vite's SSR loader (they use import.meta.glob), so it runs on
// the bundled data/ files exactly like the Worker build. No network, no KV, no writes.
import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
function check(name, ok, info = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
}

const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { "@": path.join(root, "src") } },
});
try {
  const g = await server.ssrLoadModule("/src/lib/catalog/generic-title.js");
  const lc = await server.ssrLoadModule("/src/lib/catalog/local-cache.ts");
  const sh = await server.ssrLoadModule("/src/lib/catalog/local-shared.ts");
  const pf = await server.ssrLoadModule("/src/lib/poster-fill.ts");

  // generic-title.js
  check("numbered fallback is generic", g.isGenericTitle("Koleksi Dr. Pinguin Bokep 437 - koleksidrpinguin.com"));
  check("interim code title is generic", g.isGenericTitle("Bokep Indo Pilihan ko9n6kdb8ggo"));
  check("titleAuto record is generic", g.isGenericTitle("Apa saja", { titleAuto: true }));
  check("ExaStream placeholder is generic", g.isGenericTitle("Jelajahi video ExaStream (3)"));
  check("real title is not generic", !g.isGenericTitle("Hotel selingkuh istri cantik - koleksidrpinguin.com"));
  check("isRealTitle rejects empty", !g.isRealTitle(""));

  // mergeById: first copy wins, a generic title / missing poster is filled from a later copy.
  const byse = (o) => ({ id: "by-abc123def456", embed: "https://byse.sx/e/abc123def456", ...o });
  const [m1] = lc.mergeById([byse({ title: "Koleksi Dr. Pinguin Bokep 5", titleAuto: true }), byse({ title: "Judul Asli", poster: "https://img-place.com/abc123def456_xt.jpg" })]);
  check("mergeById takes real title from later copy", m1.title === "Judul Asli" && !("titleAuto" in m1), m1.title);
  check("mergeById takes poster from later copy", m1.poster === "https://img-place.com/abc123def456_xt.jpg");
  const [m2] = lc.mergeById([byse({ title: "Judul Pertama" }), byse({ title: "Judul Lain" })]);
  check("mergeById never replaces a real title", m2.title === "Judul Pertama", m2.title);
  const [m3] = lc.mergeById([byse({ title: "Judul Pertama" }), byse({ title: "x", hidden: true, hidden_reason: "minor" })]);
  check("mergeById keeps a hidden flag from a duplicate", m3.hidden === true && m3.hidden_reason === "minor");
  const vid = { id: "Abc12345", embed: "https://videy.co/v?id=Abc12345", title: "Koleksi Dr. Pinguin Bokep 1" };
  const [m4] = lc.mergeById([vid, { ...vid, title: "Lain" }]);
  check("mergeById leaves Videy alone", m4.title === "Koleksi Dr. Pinguin Bokep 1");

  // poster-fill.ts title helpers
  check("wantsTitle: generic Byse", pf.wantsTitle(byse({ title: "Koleksi Dr. Pinguin Bokep 9" })));
  check("wantsTitle: never Videy", !pf.wantsTitle(vid));
  check("wantsTitle: never a real title", !pf.wantsTitle(byse({ title: "Judul Asli" })));
  check("siteTitleFrom brands a real title", pf.siteTitleFrom("Judul Asli") === "Judul Asli - koleksidrpinguin.com");
  check("siteTitleFrom drops a placeholder", pf.siteTitleFrom("Jelajahi video ExaStream") === "");

  // Real catalog (bundled data/): before this fix 359 non-Videy published videos had generic titles
  // (348 Byse + 11 IndoAV file names). Byse/Lulu ones with a known real title must be restored.
  const c = lc.seedLocalCache();
  const pub = c.items.filter((it) => !sh.isVidey(it));
  const gen = pub.filter((it) => g.isGenericTitle(it.title, it));
  check("generic non-Videy titles <= 40 on real data", gen.length <= 40, `${gen.length} left`);
  const byId = new Map(c.items.map((it) => [it.id, it]));
  for (const id of ["by-ko9n6kdb8ggo", "by-48oc3gkm4at5", "by-889qzeaqwqw6"]) {
    const it = byId.get(id);
    check(`real title restored ${id}`, Boolean(it && !g.isGenericTitle(it.title, it)), it?.title || "missing");
  }
  check("poster restored by-48oc3gkm4at5", /img-place\.com\/48oc3gkm4at5_xt\.jpg/.test(sh.thumbOf(byId.get("by-48oc3gkm4at5") || {}, c.posters) || ""));
  // Minor/school titles behind the generic ones stay unpublished.
  const autoHidden = Object.entries((await import("../data/auto-meta.json", { with: { type: "json" } })).default).filter(([, e]) => e.hidden);
  check("auto-meta hides the flagged titles (6 minor/school + 3 detector-review)", autoHidden.length === 9, `${autoHidden.length}`);
  for (const [id] of autoHidden) {
    check(`stays hidden ${id}`, !byId.has(id) && c.raw.some((it) => it.id === id));
  }
  // Every auto-meta title still passes the hidden rules (none of them may publish a flagged title).
  const auto = (await import("../data/auto-meta.json", { with: { type: "json" } })).default;
  let leaked = 0;
  for (const [id, e] of Object.entries(auto)) {
    const it = byId.get(id);
    if (it && e.hidden) leaked += 1;
  }
  check("no auto-meta hidden entry is published", leaked === 0, `${leaked}`);
  // And no published title restored from auto-meta trips the minor/school/detector checks.
  const ml = await server.ssrLoadModule("/src/lib/catalog/minor-lock.js");
  const md = await server.ssrLoadModule("/src/lib/catalog/minor-detector.js");
  const flagged = Object.keys(auto)
    .map((id) => byId.get(id))
    .filter((it) => it && (ml.lockedMinorReason(it.title) || ml.schoolReason(it.title) || md.minorContentReason(it.title)));
  check("no published auto-meta title is minor/school/review-flagged", flagged.length === 0, flagged.map((it) => it.id).join(", "));
} finally {
  await server.close();
}
if (failed) {
  console.log(`\n${failed} gagal`);
  process.exit(1);
}
console.log("\nsemua lulus");
