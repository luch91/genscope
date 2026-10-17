import { NextRequest, NextResponse } from "next/server";

const EXPLORER_TX_URL = "https://explorer-api.testnet-chain.genlayer.com/transactions";
const MAX_RESPONSE_BYTES = 512 * 1024;

export async function GET(request: NextRequest) {
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? "20");
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(20, Math.max(1, requestedLimit))
    : 20;

  try {
    const upstream = await fetch(`${EXPLORER_TX_URL}?limit=${limit}`, {
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

    const declaredLength = Number(upstream.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_RESPONSE_BYTES) {
      return NextResponse.json(
        { error: { code: "RESPONSE_TOO_LARGE", message: "Transaction feed response exceeded the safety limit" } },
        { status: 502 },
      );
    }
    const body = await upstream.text();
    if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
      return NextResponse.json(
        { error: { code: "RESPONSE_TOO_LARGE", message: "Transaction feed response exceeded the safety limit" } },
        { status: 502 },
      );
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
      },
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    console.warn("Explorer transaction request exception", { timeout });
    return NextResponse.json(
      { error: { code: timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR", message: "Transaction feed is temporarily unavailable" } },
      { status: timeout ? 504 : 502 },
    );
  }
}
