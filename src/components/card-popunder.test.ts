import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
  POP_MAX_PER_VIDEO,
  POP_MAX_VIDEY,
  POP_MIN_GAP_MS,
  canPop,
  firePop,
  onCatalogCardClick,
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

test("player tap caps: Videy 6 per video, other hosts 1", () => {
  assert.equal(popMaxFor("Videy"), 6);
  assert.equal(popMaxFor("Videy"), POP_MAX_VIDEY);
  assert.equal(popMaxFor("UserBokep"), 1);
  assert.equal(popMaxFor("UserBokep"), POP_MAX_OTHER);
  assert.equal(popMaxFor("Streamtape"), POP_MAX_OTHER);
  assert.equal(POP_MAX_PER_VIDEO, 3);
});

test("Videy can open 6 popunders per video after the gap, ignoring the daily page cap", () => {
  const id = "videyAAAA1";
  // Fill the shared daily cap first; Videy (daily=false) must still be allowed.
  for (let i = 0; i < 6; i++) {
    assert.equal(firePop(`other${i}xxxx`, POP_MAX_PER_VIDEO, "UserBokep", true), "ok");
    now += POP_MIN_GAP_MS + 1;
  }
  assert.equal(canPop("other6xxxx", POP_MAX_PER_VIDEO, true), false);

  for (let i = 0; i < POP_MAX_VIDEY; i++) {
    assert.equal(canPop(id, POP_MAX_VIDEY, false), true, `videy open ${i + 1} allowed`);
    assert.equal(firePop(id, POP_MAX_VIDEY, "Videy", false), "ok", `videy open ${i + 1}`);
    now += POP_MIN_GAP_MS + 1;
  }
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy", false), "skip");
  assert.equal(opened.length, 6 + 6);
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

test("IndoAV never opens a popunder from firePop or a catalog card click", () => {
  assert.equal(firePop("indoav00001", POP_MAX_OTHER, "IndoAV", true), "skip");
  assert.equal(opened.length, 0);

  const Element = (globalThis as typeof globalThis & { Element: new () => Element }).Element;
  const a = Object.assign(new Element(), {
    getAttribute: (name: string) => (name === "href" ? "/watch/indoav00001" : null),
    closest(this: { getAttribute: (n: string) => string | null }, sel: string) {
      return sel === 'a[href^="/watch/"]' ? this : null;
    },
  });
  const target = Object.assign(new Element(), {
    closest: (sel: string) => (sel === "[data-kdp-cell]" ? null : a),
  });
  onCatalogCardClick({ target }, () => "IndoAV");
  assert.equal(opened.length, 0);
});

test("the 20s gap blocks a second open on the same video, not on a new video", () => {
  assert.equal(firePop("samevideo01", POP_MAX_VIDEY, "Videy", false), "ok");
  now += POP_MIN_GAP_MS - 1;
  assert.equal(firePop("samevideo01", POP_MAX_VIDEY, "Videy", false), "skip");
  assert.equal(firePop("newvideo001", POP_MAX_VIDEY, "Videy", false), "ok");
});
