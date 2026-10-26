import { readdirSync } from "node:fs";
import { join, resolve as pathResolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";
import { isMigrationFile } from "./scripts/migration-plan.mjs";
import { isRealMinor } from "./src/lib/minor-terms.ts";

/**
 * Client bundle: buang item katalog dengan istilah minor sungguhan dari JSON
 * .
 */
function stripMinorFromClientCatalog(): Plugin {
  return {
    name: "kdp:strip-minor-client-catalog",
    enforce: "pre",
    transform(code, id) {
      if (this.environment?.name !== "client") return null;
      const file = id.split("?")[0] ?? "";
      if (!/[\\/](src[\\/]lib[\\/]catalog|data)[\\/][^\\/]+\.json$/.test(file)) return null;
      let data: unknown;
      try {
        data = JSON.parse(code);
      } catch {
        return null;
      }
      const strip = (v: unknown) =>
        Array.isArray(v) ? v.filter((x) => !(x && typeof x === "object" && isRealMinor(x as never))) : v;
      if (Array.isArray(data)) data = strip(data);
      else if (data && typeof data === "object") {
        const o = data as Record<string, unknown>;
        for (const k of ["items", "videos", "data"]) if (Array.isArray(o[k])) o[k] = strip(o[k]);
      } else return null;
      return { code: JSON.stringify(data), map: null };
    },
  };
}

/** The files `src/lib/db.ts` globs — same directory, same non-recursive scope. */
function hasGlobbedMigrations(root: string): boolean {
  try {
    return readdirSync(join(root, "migrations")).some(isMigrationFile);
  } catch {
    return false;
  }
}

/**
 * Finish PGLite bootstrap during dev-server setup (before traffic). Vite awaits
 * async `configureServer` hooks. Production: `src/lib/db` kicks `ensureDbReady`
 * on import.
 *
 * Vite awaiting the hook puts this on time-to-first-render, so an app with no
 * migrations — no schema to apply — skips it entirely rather than paying for a
 * PGLite instance it never queries.
 */
function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "app-builder:pglite-bootstrap",
    apply: "serve",
    async configureServer() {
      if (!hasGlobbedMigrations(process.cwd())) return;
      const { ensureDbReady } = await import("./src/lib/db");
      await ensureDbReady();
    },
  };
}

function authPopupPlugin(): Plugin {
  return {
    name: "app-builder:auth-popup",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";
        if (!url.startsWith("/auth/popup")) return next();
        try {
          const request = new Request(new URL(url, "http://localhost").toString(), {
            method: req.method,
            headers: req.headers as HeadersInit,
          });
          const mod = (await server.ssrLoadModule("/src/lib/auth/popup.server.ts")) as {
            handleAuthPopupRequest: (req: Request) => Promise<Response>;
          };
          const response = await mod.handleAuthPopupRequest(request);

          res.statusCode = response.status;
          const setCookies =
            typeof response.headers.getSetCookie === "function"
              ? response.headers.getSetCookie()
              : [];
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() === "set-cookie") return;
            res.setHeader(key, value);
          });
          for (const cookie of setCookies) {
            res.appendHeader("set-cookie", cookie);
          }
          const body = Buffer.from(await response.arrayBuffer());
          res.end(body);
        } catch (err) {
          console.error("[app-builder] /auth/popup handler failed:", err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("auth popup failed");
          }
        }
      });
    },
  };
}

// `0.0.0.0:8080` is the live-preview contract — don't change host/port.
// The dev server starts once `src/router.tsx` and `src/routes/` exist — see
// AGENTS.md § "First scaffold".
/** Videy ids that already have a frame (public/videy-thumbs/<id>.jpg); see videyMissingThumb. */
function videyThumbIds(): string[] | null {
  try {
    return readdirSync(join(__dirname, "public", "videy-thumbs"))
      .filter((f) => f.endsWith(".jpg"))
      .map((f) => f.slice(0, -4));
  } catch {
    return null;
  }
}

export default defineConfig(({ command, isPreview }) => ({
  define: {
    __VIDEY_THUMB_IDS__: JSON.stringify(videyThumbIds()),
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@": pathResolve(__dirname, "./src"),
    },
  },
  plugins: [
    pgliteBootstrapPlugin(),
    stripMinorFromClientCatalog(),
    // Before tanstackStart so /auth/popup never falls through to the SPA.
    authPopupPlugin(),
    // Dev-only /__app-env, read by scripts/check-auth-invariant.mjs.
    appEnvPlugin(),
    // PWA head + ?install=1 tutorial page; runs before Start/Nitro.
    grokPwaPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            // Production = Cloudflare Workers (wrangler deploy)
            preset: process.env.NITRO_PRESET || "cloudflare-module",
            cloudflare: {
              nodeCompat: true,
              deployConfig: true,
            },
            // Auto-registers server/middleware/*
            serverDir: "./server",
          }),
        ]
      : []),
    viteReact(),
  ],
}));
