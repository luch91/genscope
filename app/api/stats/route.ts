import { NextResponse } from "next/server";
import { readBoundedJsonResponse } from "../_shared/bounded-body";

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
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("INVALID_UPSTREAM_RESPONSE");
    const record = data as Record<string, unknown>;
    const safe = {
      lastSealedBlock: Number(record.lastSealedBlock),
      lastVerifiedBlock: Number(record.lastVerifiedBlock),
      totalTransactions: Number(record.totalTransactions),
    };
    if (Object.values(safe).some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw new Error("INVALID_UPSTREAM_RESPONSE");
    }
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
