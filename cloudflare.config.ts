import { bindings, defineConfig, defineWorker } from "cf/config";
import { createWorkersCacheConfig } from "@vinext/cloudflare/cache/config";

const cache = await createWorkersCacheConfig();

export default defineConfig({
  worker: defineWorker({
    ...cache,
    name: "genscope-staging",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-17",
    compatibilityFlags: ["nodejs_compat"],
    observability: {
      enabled: true,
      logs: { enabled: true },
      traces: { enabled: true },
    },
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ...cache.env,
      ASSETS: bindings.assets(),
      RPC_RATE_LIMITER: bindings.rateLimit({
        namespace: "1001",
        // Initial block/receipt hydration is bursty, and IP keys may represent
        // multiple users behind one NAT. Keep abuse bounded without starving
        // two concurrent explorer sessions.
        simple: { limit: 600, period: 60 },
      }),
    },
  }),
});
