import { NextResponse } from "next/server";
import { readBoundedJsonResponse } from "../_shared/bounded-body";
import { normalizeChainStats } from "../../lib/chain-stats";

const STATS_URL = "https://explorer-api.testnet-chain.genlayer.com/stats";

export async function GET() {
  try {
    const res = await fetch(STATS_URL, {
      next: { revalidate: 15 },
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("UPSTREAM_HTTP_ERROR");
    const data = await readBoundedJsonResponse(res, 64 * 1024);
    const safe = normalizeChainStats(data, new Date().toISOString(), res.headers.get("date"));
    return NextResponse.json(safe, {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    console.warn("Explorer statistics request failed", { timeout });
    return NextResponse.json(
      { error: { code: timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR", message: "Network statistics are temporarily unavailable" } },
      { status: timeout ? 504 : 502 },
    );
  }
}
