import { NextResponse } from "next/server";
import { readBoundedJsonResponse } from "../_shared/bounded-body";
import {
  hasUsableChainStats,
  normalizeChainStats,
  recoverLastKnownGood,
  type ChainStatsPayload,
} from "../../lib/chain-stats";

const STATS_URL = "https://explorer-api.testnet-chain.genlayer.com/stats";
const LAST_KNOWN_GOOD_TTL_SECONDS = 7 * 24 * 60 * 60;

function statsCache(): Cache | null {
  const workerCaches = globalThis.caches as CacheStorage & { default?: Cache };
  return workerCaches?.default ?? null;
}

function cacheKey(request: Request): Request {
  return new Request(new URL("/__internal/chain-stats-last-known-good", request.url), {
    method: "GET",
  });
}

async function readLastKnownGood(request: Request): Promise<ChainStatsPayload | null> {
  const cache = statsCache();
  const response = cache ? await cache.match(cacheKey(request)) : undefined;
  if (!response) return null;
  try {
    const value = await response.json() as Record<string, unknown>;
    const freshness = value.freshness as Record<string, unknown> | undefined;
    const cached = normalizeChainStats(
      value,
      typeof freshness?.observedAt === "string" ? freshness.observedAt : new Date(0).toISOString(),
      typeof freshness?.upstreamDate === "string" ? freshness.upstreamDate : null,
    );
    return recoverLastKnownGood(cached);
  } catch {
    return null;
  }
}

async function saveLastKnownGood(request: Request, payload: ChainStatsPayload): Promise<void> {
  const cache = statsCache();
  if (!cache || !hasUsableChainStats(payload)) return;
  await cache.put(cacheKey(request), new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${LAST_KNOWN_GOOD_TTL_SECONDS}`,
    },
  }));
}

export async function GET(request: Request) {
  try {
    const res = await fetch(STATS_URL, {
      next: { revalidate: 15 },
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("UPSTREAM_HTTP_ERROR");
    const data = await readBoundedJsonResponse(res, 64 * 1024);
    const safe = normalizeChainStats(data, new Date().toISOString(), res.headers.get("date"));
    if (!hasUsableChainStats(safe)) throw new Error("UPSTREAM_STATS_UNAVAILABLE");
    await saveLastKnownGood(request, safe);
    return NextResponse.json(safe, {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
    });
  } catch (error) {
    const cached = await readLastKnownGood(request);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
          "X-GenScope-Stats": "last-known-good",
        },
      });
    }
    const timeout = error instanceof Error && error.name === "TimeoutError";
    console.warn("Explorer statistics request failed", { timeout });
    return NextResponse.json(
      { error: { code: timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR", message: "Network statistics are temporarily unavailable" } },
      { status: timeout ? 504 : 502 },
    );
  }
}
