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
  EXO_ZONE,
  firePop,
  notePlayTap,
  popMaxFor,
  popOpened,
  popsLeft,
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
let openImpl: (url: string) => { opener: unknown; closed?: boolean } | null = () => ({ opener: {} });
let beacons: { id: string; host: string; event: string }[] = [];
const TS_HOST = "fozekikikiminu.com";
const EXO_URL = "https://s.pemsrv.com/v1/link.php?idzone=6055468&type=8";

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
      const w = openImpl(url);
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
    value: {
      ...(g.navigator || {}),
      sendBeacon: (_u: string, body: string) => {
        beacons.push(JSON.parse(body));
        return true;
      },
    },
  });
  if (typeof g.Element === "undefined") g.Element = class Element {};
  g.fetch = async () => new Response(null, { status: 204 });
}

beforeEach(() => {
  now = 1_700_000_000_000;
  Date.now = () => now;
  opened = [];
  beacons = [];
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

test("Videy can open 3 popunders per video after the 5s gap", () => {
  const id = "videyAAAA1";
  for (let i = 0; i < POP_MAX_VIDEY; i++) {
    assert.equal(canPop(id, POP_MAX_VIDEY), true, `videy open ${i + 1} allowed`);
    assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "ok", `videy open ${i + 1}`);
    now += POP_MIN_GAP_MS + 1;
  }
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "skip");
  assert.equal(opened.length, 3);
});

test("non-Videy player taps stop after 1 per video", () => {
  const id = "userbokep01";
  assert.equal(firePop(id, POP_MAX_OTHER, "UserBokep"), "ok");
  now += POP_MIN_GAP_MS + 1;
  assert.equal(firePop(id, POP_MAX_OTHER, "UserBokep"), "skip");
});

test("a blocked window.open is not counted and can be retried", () => {
  const id = "blockretry1";
  openImpl = () => null;
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "block");
  openImpl = () => ({ opener: {} });
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "ok");
  assert.equal(opened.length, 1);
});

test("IndoAV player taps stop after 1 per video, same as other non-Videy hosts", () => {
  const id = "indoav00001";
  assert.equal(firePop(id, POP_MAX_OTHER, "IndoAV"), "ok");
  now += POP_MIN_GAP_MS + 1;
  assert.equal(firePop(id, POP_MAX_OTHER, "IndoAV"), "skip");
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
  assert.equal(firePop("samevideo01", POP_MAX_VIDEY, "Videy"), "ok");
  now += POP_MIN_GAP_MS - 1;
  assert.equal(firePop("samevideo01", POP_MAX_VIDEY, "Videy"), "skip");
  assert.equal(firePop("newvideo001", POP_MAX_VIDEY, "Videy"), "ok");
});

test("the 5s gap then allows Videy pops #2 and #3 on the same video, and blocks #4", () => {
  const id = "gapvideo001";
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "ok");
  now += POP_MIN_GAP_MS - 1;
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "skip");
  now += 1;
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "ok");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "ok");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "skip");
});

test("A -> B -> A: a non-Videy video that already popped does not pop again after another video", () => {
  assert.equal(firePop("indoavAAAA1", POP_MAX_OTHER, "IndoAV"), "ok");
  now += POP_MIN_GAP_MS + 1;
  assert.equal(firePop("userbokepB1", POP_MAX_OTHER, "UserBokep"), "ok");
  now += POP_MIN_GAP_MS + 1;
  assert.equal(canPop("indoavAAAA1", POP_MAX_OTHER), false);
  assert.equal(firePop("indoavAAAA1", POP_MAX_OTHER, "IndoAV"), "skip");
  assert.equal(opened.length, 2);
});

test("Videy keeps max 3 per video across revisits (A -> B -> A -> B)", () => {
  const a = "videyAAAAA1";
  const b = "videyBBBBB1";
  assert.equal(firePop(a, POP_MAX_VIDEY, "Videy"), "ok");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(a, POP_MAX_VIDEY, "Videy"), "ok");
  // B pops at once (new video, no gap), then back to A: A has 1 pop left.
  assert.equal(firePop(b, POP_MAX_VIDEY, "Videy"), "ok");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(a, POP_MAX_VIDEY, "Videy"), "ok");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(a, POP_MAX_VIDEY, "Videy"), "skip", "A is at 3");
  // B again: 2 left, still with the 5s gap.
  assert.equal(firePop(b, POP_MAX_VIDEY, "Videy"), "ok");
  assert.equal(firePop(b, POP_MAX_VIDEY, "Videy"), "skip", "5s gap on B");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(b, POP_MAX_VIDEY, "Videy"), "ok");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(b, POP_MAX_VIDEY, "Videy"), "skip", "B is at 3");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(a, POP_MAX_VIDEY, "Videy"), "skip", "A still at 3 after B");
  assert.equal(opened.length, 6);
});

test("the per-video memory survives a fresh page (stored in localStorage)", () => {
  assert.equal(firePop("persistA001", POP_MAX_OTHER, "Streamtape"), "ok");
  const stored = (globalThis as unknown as { localStorage: Store }).localStorage.getItem("kdp_pop_v2");
  assert.ok(stored && stored.includes("persistA001"));
  now += POP_MIN_GAP_MS + 1;
  assert.equal(canPop("persistA001", POP_MAX_OTHER), false);
});

test("there is no daily cap: many different videos each pop once, no matter how many opened today", () => {
  for (let i = 0; i < 25; i++) {
    assert.equal(firePop(`nocap${String(i).padStart(2, "0")}xxx`, POP_MAX_OTHER, "UserBokep"), "ok", `video ${i + 1}`);
    now += 1_000;
  }
  assert.equal(opened.length, 25);
  assert.equal(firePop("nocap00xxx", POP_MAX_OTHER, "UserBokep"), "skip", "same video still pops only once");
  assert.equal(opened.length, 25);
  const ls = (globalThis as unknown as { localStorage: Store }).localStorage;
  assert.equal(ls.getItem("kdp_page_pop_day"), null, "no daily counter is written");
});

const tsBlocked = (url: string) => (url.includes(TS_HOST) ? null : { opener: {} });
const brandsOpened = () => opened.map((u) => (u.includes(TS_HOST) ? "ts" : u === EXO_URL ? "exo" : u));
const events = () => beacons.map((b) => b.event);

test("fallback: TrafficStars opens -> only TrafficStars, ExoClick is never touched", () => {
  assert.equal(firePop("fbok0000001", POP_MAX_OTHER, "UserBokep"), "ok");
  assert.deepEqual(brandsOpened(), ["ts"]);
  assert.deepEqual(events(), ["tap_e", "pop_n1"], "no pop_x row: counts as TrafficStars");
});

test("fallback: TrafficStars window.open returns null -> ExoClick opens in the same call, never both", () => {
  const calls: string[] = [];
  openImpl = (url) => {
    calls.push(url);
    return tsBlocked(url);
  };
  assert.equal(firePop("fbnull00001", POP_MAX_OTHER, "UserBokep"), "exo");
  assert.equal(calls.length, 2, "TrafficStars attempt, then ExoClick, synchronously");
  assert.ok(calls[0].includes(TS_HOST));
  assert.equal(calls[1], EXO_URL);
  assert.deepEqual(brandsOpened(), ["exo"], "only one tab opened");
  assert.deepEqual(events(), ["tap_e", "pop_n1", "pop_x1"]);
});

test("fallback: a window that is already closed counts as blocked and falls back to ExoClick", () => {
  openImpl = (url) => (url.includes(TS_HOST) ? { opener: {}, closed: true } : { opener: {} });
  assert.equal(firePop("fbclosed001", POP_MAX_OTHER, "IndoAV"), "exo");
  assert.ok(opened.includes(EXO_URL));
});

test("fallback: window.open throwing for TrafficStars also falls back", () => {
  openImpl = (url) => {
    if (url.includes(TS_HOST)) throw new Error("blocked");
    return { opener: {} };
  };
  assert.equal(firePop("fbthrow0001", POP_MAX_OTHER, "IndoAV"), "exo");
});

test("fallback: both blocked -> 'block', nothing counted, the tap can be retried", () => {
  const id = "fbboth00001";
  openImpl = () => null;
  assert.equal(firePop(id, POP_MAX_OTHER, "UserBokep"), "block");
  assert.equal(opened.length, 0);
  assert.deepEqual(events(), ["tap_e"], "entitled first tap is logged even when both tabs are blocked; no pop_n / pop_x");
  assert.equal(canPop(id, POP_MAX_OTHER), true, "no slot used");
  openImpl = () => ({ opener: {} });
  assert.equal(firePop(id, POP_MAX_OTHER, "UserBokep"), "ok");
});

test("fallback counts as the tap's one pop: non-Videy stays 1x per video", () => {
  const id = "fbonce00001";
  openImpl = tsBlocked;
  assert.equal(firePop(id, POP_MAX_OTHER, "UserBokep"), "exo");
  now += POP_MIN_GAP_MS + 1;
  openImpl = () => ({ opener: {} });
  assert.equal(firePop(id, POP_MAX_OTHER, "UserBokep"), "skip", "the Exo pop used the video's only slot");
  assert.equal(opened.length, 1);
});

test("fallback: Videy max 3 per video, 5s gap, with a mix of TrafficStars and ExoClick", () => {
  const id = "fbvidey0001";
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "ok");
  now += POP_MIN_GAP_MS - 1;
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "skip", "gap still applies to a fallback-capable tap");
  now += 1;
  openImpl = tsBlocked;
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "exo");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "exo");
  now += POP_MIN_GAP_MS;
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "skip", "3 per video, Exo pops included");
  assert.deepEqual(brandsOpened(), ["ts", "exo", "exo"]);
  assert.deepEqual(events(), ["tap_e", "pop_n1", "pop_n2", "pop_x2", "pop_n3", "pop_x3"]);
});

test("fallback: no daily cap, many videos each pop once whichever brand opens", () => {
  openImpl = tsBlocked;
  for (let i = 0; i < 25; i++) {
    assert.equal(firePop(`fbnocap${String(i).padStart(2, "0")}xx`, POP_MAX_OTHER, "UserBokep"), "exo");
    now += 1_000;
  }
  assert.equal(opened.length, 25);
});

test("fallback: the memory key and shape (kdp_pop_v2) are unchanged", () => {
  openImpl = tsBlocked;
  firePop("fbmem000001", POP_MAX_OTHER, "UserBokep");
  const ls = (globalThis as unknown as { localStorage: Store }).localStorage;
  const stored = JSON.parse(ls.getItem("kdp_pop_v2") || "[]");
  const mine = stored.filter((e: { id: string }) => e.id === "fbmem000001");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].n, 1);
  assert.deepEqual(Object.keys(mine[0]).sort(), ["at", "id", "n"]);
  assert.ok(stored.length <= 50, "still the last 50 videos");
});

test("popOpened is true for TrafficStars and ExoClick, false for block/skip", () => {
  assert.equal(popOpened("ok"), true);
  assert.equal(popOpened("exo"), true);
  assert.equal(popOpened("block"), false);
  assert.equal(popOpened("skip"), false);
});

test("first entitled play tap logs tap_e and still opens the popunder; a retry does not log again", () => {
  const id = "tape0000001";
  assert.equal(notePlayTap(id, POP_MAX_OTHER, "UserBokep"), "entitled");
  assert.deepEqual(events(), ["tap_e"]);
  assert.equal(firePop(id, POP_MAX_OTHER, "UserBokep"), "ok");
  assert.equal(opened.length, 1);
  assert.deepEqual(events(), ["tap_e", "pop_n1"], "tap_e is once per session even when firePop also tries to log it");
});

test("Videy later taps (#2 and #3) do not log a new tap_e or tap_r", () => {
  const id = "tapvidey001";
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "ok");
  now += POP_MIN_GAP_MS + 1;
  assert.equal(notePlayTap(id, POP_MAX_VIDEY, "Videy"), "later");
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "ok");
  now += POP_MIN_GAP_MS + 1;
  assert.equal(notePlayTap(id, POP_MAX_VIDEY, "Videy"), "later");
  assert.equal(firePop(id, POP_MAX_VIDEY, "Videy"), "ok");
  assert.equal(events().filter((e) => e === "tap_e").length, 1);
  assert.equal(events().includes("tap_r"), false);
  assert.deepEqual(events().filter((e) => e.startsWith("pop_n")), ["pop_n1", "pop_n2", "pop_n3"]);
});

test("a revisit of a video already at its cap logs tap_r and firePop does not open a tab", () => {
  const id = "tapr0000001";
  assert.equal(firePop(id, POP_MAX_OTHER, "UserBokep"), "ok");
  beacons = [];
  opened = [];
  now += POP_MIN_GAP_MS + 1;
  assert.equal(popsLeft(id, POP_MAX_OTHER), false);
  assert.equal(notePlayTap(id, POP_MAX_OTHER, "UserBokep"), "revisit");
  assert.deepEqual(events(), ["tap_r"]);
  assert.equal(firePop(id, POP_MAX_OTHER, "UserBokep"), "skip");
  assert.equal(opened.length, 0);
  assert.deepEqual(events(), ["tap_r"], "skip does not log another tap");
});

test("sources: ExoClick zone is not a satellite zone, only the tap paths open it, and never on owner paths", () => {
  assert.equal(EXO_ZONE, "6055468");
  assert.notEqual(EXO_ZONE, "6088480");
  assert.notEqual(EXO_ZONE, "6088490");
  const here = new URL(".", import.meta.url);
  const src = readFileSync(new URL("card-popunder.ts", here), "utf8");
  assert.equal((src.match(/window\.open\(/g) || []).length, 1, "a single window.open call site (openTab)");
  for (const rel of ["tap-popunder.tsx", "ts-videy-popunder.tsx"]) {
    const t = readFileSync(new URL(rel, here), "utf8");
    assert.equal(t.includes("pemsrv"), false, `${rel} must not hold its own ad URL`);
    assert.equal(t.includes("notePlayTap"), true, `${rel} must log first play taps through notePlayTap`);
  }
  const client = readFileSync(new URL("../lib/player-log-client.ts", here), "utf8");
  assert.equal(client.includes('"tap_e"'), true);
  assert.equal(client.includes('"tap_r"'), true);
});
