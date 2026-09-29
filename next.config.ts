import type { NextConfig } from "next";
import path from "node:path";

const onVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = onVercel
  ? {
      // Vercel has no Cloudflare D1 binding. The client falls back to
      // device-local persistence when this shim reports no database.
      turbopack: {
        resolveAlias: {
          "cloudflare:workers": "./lib/vercel-cloudflare-workers.ts",
        },
      },
      webpack(config) {
        config.resolve.alias["cloudflare:workers"] = path.resolve(
          process.cwd(),
          "lib/vercel-cloudflare-workers.ts",
        );
        return config;
      },
    }
  : {};

export default nextConfig;
