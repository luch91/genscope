import { NextRequest, NextResponse } from "next/server";
import { BoundedBodyError, readBoundedJsonResponse } from "../_shared/bounded-body";

const EXPLORER_TX_URL = "https://explorer-api.testnet-chain.genlayer.com/transactions";
const MAX_RESPONSE_BYTES = 512 * 1024;

// Legacy endpoint retained for backward compatibility. The active
// DataOrchestrator does not poll it; removal belongs in a separate maintenance
// PR after external consumers have been checked.

export async function GET(request: NextRequest) {
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? "20");
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(20, Math.max(1, requestedLimit))
    : 20;
  const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage)
    ? Math.min(500, Math.max(1, requestedPage))
    : 1;

  try {
    const upstream = await fetch(`${EXPLORER_TX_URL}?limit=${limit}&page=${page}`, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/json" },
    });
    if (!upstream.ok) {
      console.warn("Explorer transaction request failed", { status: upstream.status });
      return NextResponse.json(
        { error: { code: "UPSTREAM_ERROR", message: "Transaction feed is temporarily unavailable" } },
        { status: 502 },
      );
    }

    const payload = await readBoundedJsonResponse(upstream, MAX_RESPONSE_BYTES);
    if (!payload || typeof payload !== "object" || !Array.isArray((payload as { items?: unknown }).items)) {
      throw new BoundedBodyError("INVALID_UPSTREAM_JSON");
    }

    return NextResponse.json(payload, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
      },
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    const responseInvalid = error instanceof BoundedBodyError;
    console.warn("Explorer transaction request exception", { timeout, responseInvalid });
    return NextResponse.json(
      { error: { code: timeout ? "UPSTREAM_TIMEOUT" : responseInvalid ? "INVALID_UPSTREAM_RESPONSE" : "UPSTREAM_ERROR", message: "Transaction feed is temporarily unavailable" } },
      { status: timeout ? 504 : 502 },
    );
  }
}
