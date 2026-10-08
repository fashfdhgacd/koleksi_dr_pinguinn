/**
 * Cloudflare Worker entry (Nitro `entry` option, set in nitro.config.ts).
 *
 * Wraps Nitro's stock cloudflare-module handler with one guard: a request whose path is not valid
 * percent-encoding (e.g. "/%", "/kategori/%ff") used to throw `URIError: URI malformed` inside h3's
 * H3Event constructor, before any middleware could run, so Cloudflare answered with error 1101 (500).
 * Such requests now get a plain 400. Everything else (static assets, scheduled, queues...) is the
 * unchanged Nitro handler.
 *
 * nitro is pinned to an exact version in package.json, so this internal path is stable; if a future
 * nitro moves it, `vite build` fails loudly instead of deploying something broken.
 */
import nitroHandler from "../node_modules/nitro/dist/presets/cloudflare/runtime/cloudflare-module.mjs";

function badRequest() {
  return new Response("Bad Request", {
    status: 400,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-robots-tag": "noindex",
      "x-content-type-options": "nosniff",
    },
  });
}

function hasMalformedPath(request) {
  try {
    decodeURI(new URL(request.url).pathname);
    return false;
  } catch {
    return true;
  }
}

export default {
  ...nitroHandler,
  async fetch(request, env, context) {
    if (hasMalformedPath(request)) return badRequest();
    return nitroHandler.fetch(request, env, context);
  },
};
