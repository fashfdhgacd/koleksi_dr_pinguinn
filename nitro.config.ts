import { fileURLToPath } from "node:url";

/**
 * Extra Nitro options, merged with the nitro() plugin options in vite.config.ts.
 * entry: Nitro's stock cloudflare-module handler + a 400 for malformed percent-encoded paths
 * (see scripts/cf-worker-entry.mjs). Only for the Cloudflare preset.
 */
const preset = process.env.NITRO_PRESET || "cloudflare-module";

export default preset === "cloudflare-module"
  ? { entry: fileURLToPath(new URL("./scripts/cf-worker-entry.mjs", import.meta.url)) }
  : {};
