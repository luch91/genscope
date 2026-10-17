import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  forwardRpc,
  readBoundedJson,
  rpcErrorResponse,
} from "./policy";

const BRADBURY_RPC = process.env.BRADBURY_RPC_URL ?? "https://rpc-bradbury.genlayer.com";

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const clientKey = req.headers.get("cf-connecting-ip")
      ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "unknown";
    enforceRateLimit(clientKey);
    const payload = await readBoundedJson(req);
    const response = await forwardRpc(payload, BRADBURY_RPC);
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (error) {
    console.warn(JSON.stringify({
      event: "rpc_proxy_rejected",
      requestId,
      code: error instanceof Error ? error.name : "UnknownError",
    }));
    return rpcErrorResponse(error, requestId);
  }
}
