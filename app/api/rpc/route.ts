import { NextRequest, NextResponse } from "next/server";

const BRADBURY_RPC = "https://rpc-bradbury.genlayer.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const upstream = await fetch(BRADBURY_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const data = await upstream.text();
    return new NextResponse(data, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "RPC proxy error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
