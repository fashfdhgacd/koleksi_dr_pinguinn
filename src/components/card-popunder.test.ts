import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = new URL(`../${specifier.slice(2)}`, import.meta.url);
      for (const ext of ["", ".ts", ".tsx", ".js"]) {
        const url = new URL(base.href + ext);
        if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const {
  POP_MAX_OTHER,
  POP_MAX_VIDEY,
  POP_MIN_GAP_MS,
  canPop,
  firePop,
  popMaxFor,
} = await import("./card-popunder.ts");
type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; clear(): void };

function memoryStore(): Store {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => {
      m.set(k, String(v));
    },
    removeItem: (k) => {
      m.delete(k);
    },
    clear: () => m.clear(),
  };
}

let now = 1_700_000_000_000;
const realNow = Date.now;
let opened: string[] = [];
let openImpl: () => { opener: unknown } | null = () => ({ opener: {} });

function installBrowser() {
  const session = memoryStore();
  const local = memoryStore();
  let cookie = "";
  const g = globalThis as typeof globalThis & {
    window: { open: (url: string, target?: string) => { opener: unknown } | null };
    sessionStorage: Store;
    localStorage: Store;
    document: { cookie: string };
    navigator: { sendBeacon?: () => boolean };
  };
  g.window = {
    open: (url: string) => {
      const w = openImpl();
      if (w) opened.push(url);
      return w;
    },
  };
  g.sessionStorage = session;
  g.localStorage = local;
  Object.defineProperty(g, "document", {
    configurable: true,
    value: {
      get cookie() {
        return cookie;
      },
      set cookie(v: string) {
        const [pair] = String(v).split(";");
        const eq = pair.indexOf("=");
        const name = pair.slice(0, eq);
        const val = pair.slice(eq + 1);
        const rest = cookie
          .split("; ")
          .filter((p) => p && !p.startsWith(`${name}=`));
        rest.push(`${name}=${val}`);
        cookie = rest.join("; ");
      },
    },
  });
  Object.defineProperty(g, "navigator", {
    configurable: true,
    value: { ...(g.navigator || {}), sendBeacon: () => true },
  });
  if (typeof g.Element === "undefined") g.Element = class Element {};
  g.fetch = async () => new Response(null, { status: 204 });
}

beforeEach(() => {
  now = 1_700_000_000_000;
  Date.now = () => now;
  opened = [];
  openImpl = () => ({ opener: {} });
  installBrowser();
});

afterEach(() => {
  Date.now = realNow;
});

test("player tap caps: Videy 3 per video, other hosts 1, 5s gap", () => {
  assert.equal(popMaxFor("Videy"), 3);
  assert.equal(popMaxFor("Videy"), POP_MAX_VIDEY);
  assert.equal(POP_MAX_VIDEY, 3);
  assert.equal(POP_MIN_GAP_MS, 5_000);
  assert.equal(popMaxFor("UserBokep"), 1);
  assert.equal(popMaxFor("UserBokep"), POP_MAX_OTHER);
  assert.equal(popMaxFor("IndoAV"), POP_MAX_OTHER);
  assert.equal(popMaxFor("Streamtape"), POP_MAX_OTHER);
  assert.equal(popMaxFor("Putarin"), POP_MAX_OTHER);
});

test("Videy can open 3 popunders per video after the 5s gap, ignoring the daily page cap", () => {
  const id = "videyAAAA1";
  // Fill the shared daily cap first with non-Videy first-play taps; Videy (daily=false) must still be allowed.
  for (let i = 0; i < 6; i++) {
    assert.equal(firePop(`other${i}xxxx`, POP_MAX_OTHER, "UserBokep", true), "ok");
    now += POP_MIN_GAP_MS + 1;
  }
  assert.equal(canPop("other6xxxx", POP_MAX_OTHER, true), false);

  for (let i = 0; i < POP_MAX_VIDEY; i++) {
    assert.equal(canPop(id, POP_MAX_VIDEY, false), true, `videy open ${i + 1} allowed`);
    assert.equal(firePop(id, POP_MAX_VIDEY, "Videy", false), "ok", `videy open ${i + 1}`);
    now += POP_MIN_GAP_MS + 1;
  }
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy", false), "skip");
  assert.equal(opened.length, 6 + 3);
});

test("non-Videy player taps stop after 1 per video and share the daily cap", () => {
  const id = "userbokep01";
  assert.equal(firePop(id, POP_MAX_OTHER, "UserBokep", true), "ok");
  now += POP_MIN_GAP_MS + 1;
  assert.equal(firePop(id, POP_MAX_OTHER, "UserBokep", true), "skip");
});

test("a blocked window.open is not counted and can be retried", () => {
  const id = "blockretry1";
  openImpl = () => null;
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy", false), "block");
  openImpl = () => ({ opener: {} });
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy", false), "ok");
  assert.equal(opened.length, 1);
});

test("IndoAV player taps stop after 1 per video, same as other non-Videy hosts", () => {
  const id = "indoav00001";
  assert.equal(firePop(id, POP_MAX_OTHER, "IndoAV", true), "ok");
  now += POP_MIN_GAP_MS + 1;
  assert.equal(firePop(id, POP_MAX_OTHER, "IndoAV", true), "skip");
  assert.equal(opened.length, 1);
});

test("catalog, hero, and card-popunder sources have no page-click popunder trigger", () => {
  const here = new URL(".", import.meta.url);
  const files = ["card-popunder.ts", "video/video-grid.tsx", "video/hero.tsx"];
  for (const rel of files) {
    const src = readFileSync(new URL(rel, here), "utf8");
    assert.equal(src.includes("onCatalogCardClick"), false, `${rel} still mentions onCatalogCardClick`);
  }
});

test("the 5s gap blocks a second Videy open on the same video, not on a new video", () => {
  assert.equal(firePop("samevideo01", POP_MAX_VIDEY, "Videy", false), "ok");
  now += POP_MIN_GAP_MS - 1;
  assert.equal(firePop("samevideo01", POP_MAX_VIDEY, "Videy", false), "skip");
  assert.equal(firePop("newvideo001", POP_MAX_VIDEY, "Videy", false), "ok");
});

test("the 5s gap then allows Videy pops #2 and #3 on the same video, and blocks #4", () => {
  const id = "gapvideo001";
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy", false), "ok");
  now += POP_MIN_GAP_MS - 1;
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy", false), "skip");
  now += 1;
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy", false), "ok");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy", false), "ok");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy", false), "skip");
});

test("A -> B -> A: a non-Videy video that already popped does not pop again after another video", () => {
  assert.equal(firePop("indoavAAAA1", POP_MAX_OTHER, "IndoAV", true), "ok");
  now += POP_MIN_GAP_MS + 1;
  assert.equal(firePop("userbokepB1", POP_MAX_OTHER, "UserBokep", true), "ok");
  now += POP_MIN_GAP_MS + 1;
  assert.equal(canPop("indoavAAAA1", POP_MAX_OTHER, true), false);
  assert.equal(firePop("indoavAAAA1", POP_MAX_OTHER, "IndoAV", true), "skip");
  assert.equal(opened.length, 2);
});

test("Videy keeps max 3 per video across revisits (A -> B -> A -> B)", () => {
  const a = "videyAAAAA1";
  const b = "videyBBBBB1";
  assert.equal(firePop(a, POP_MAX_VIDEY, "Videy", false), "ok");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(a, POP_MAX_VIDEY, "Videy", false), "ok");
  // B pops at once (new video, no gap), then back to A: A has 1 pop left.
  assert.equal(firePop(b, POP_MAX_VIDEY, "Videy", false), "ok");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(a, POP_MAX_VIDEY, "Videy", false), "ok");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(a, POP_MAX_VIDEY, "Videy", false), "skip", "A is at 3");
  // B again: 2 left, still with the 5s gap.
  assert.equal(firePop(b, POP_MAX_VIDEY, "Videy", false), "ok");
  assert.equal(firePop(b, POP_MAX_VIDEY, "Videy", false), "skip", "5s gap on B");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(b, POP_MAX_VIDEY, "Videy", false), "ok");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(b, POP_MAX_VIDEY, "Videy", false), "skip", "B is at 3");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(a, POP_MAX_VIDEY, "Videy", false), "skip", "A still at 3 after B");
  assert.equal(opened.length, 6);
});

test("the per-video memory survives a fresh page (stored in localStorage)", () => {
  assert.equal(firePop("persistA001", POP_MAX_OTHER, "Streamtape", true), "ok");
  const stored = (globalThis as unknown as { localStorage: Store }).localStorage.getItem("kdp_pop_v2");
  assert.ok(stored && stored.includes("persistA001"));
  now += POP_MIN_GAP_MS + 1;
  assert.equal(canPop("persistA001", POP_MAX_OTHER, true), false);
});

test("the non-Videy daily cap of 6 still applies with per-video memory", () => {
  for (let i = 0; i < 6; i++) assert.equal(firePop(`dailyvid${i}x`, POP_MAX_OTHER, "UserBokep", true), "ok");
  assert.equal(firePop("dailyvid6x", POP_MAX_OTHER, "UserBokep", true), "skip");
  assert.equal(opened.length, 6);
});
