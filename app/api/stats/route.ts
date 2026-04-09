import { NextResponse } from "next/server";

const STATS_URL = "https://explorer-api.testnet-chain.genlayer.com/stats";

export async function GET() {
  try {
    const res = await fetch(STATS_URL, { next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stats fetch error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
