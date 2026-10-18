import { bindings, defineConfig, defineWorker } from "cf/config";
import { createWorkersCacheConfig } from "@vinext/cloudflare/cache/config";

const cache = await createWorkersCacheConfig();
const workerName = process.env.GENSCOPE_WORKER_NAME ?? "genscope-staging";
if (workerName !== "genscope-staging" && workerName !== "genscope") {
  throw new Error(`Refusing to deploy unexpected Worker: ${workerName}`);
}
const rateLimitNamespace = workerName === "genscope" ? "1002" : "1001";
const contractRateLimitNamespace = workerName === "genscope" ? "2002" : "2001";

export default defineConfig({
  worker: defineWorker({
    ...cache,
    name: workerName,
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
        namespace: rateLimitNamespace,
        // Initial block/receipt hydration is bursty, and IP keys may represent
        // multiple users behind one NAT. Keep abuse bounded without starving
        // two concurrent explorer sessions.
        simple: { limit: 600, period: 60 },
      }),
      CONTRACT_RATE_LIMITER: bindings.rateLimit({
        namespace: contractRateLimitNamespace,
        // Discovery can spend up to 45 upstream calls, so constrain it
        // separately from lightweight explorer RPC traffic.
        simple: { limit: 12, period: 60 },
      }),
    },
  }),
});
