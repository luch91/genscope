const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 8_000;

export const READ_ONLY_RPC_METHODS = new Set([
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "gen_getTransactionReceipt",
  "gen_syncing",
]);

type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params: unknown[];
};

export interface SharedRateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export class RpcPolicyError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export async function enforceRateLimit(limiter: SharedRateLimiter, key: string): Promise<void> {
  const { success } = await limiter.limit({ key });
  if (!success) {
    throw new RpcPolicyError(
      429,
      "RATE_LIMITED",
      "RPC request rate limit exceeded",
      60,
    );
  }
}

export function validateRpcPayload(value: unknown): JsonRpcRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RpcPolicyError(400, "INVALID_REQUEST", "Expected one JSON-RPC request object");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.jsonrpc !== "2.0") {
    throw new RpcPolicyError(400, "INVALID_REQUEST", "jsonrpc must be '2.0'");
  }
  if (typeof candidate.method !== "string" || !READ_ONLY_RPC_METHODS.has(candidate.method)) {
    throw new RpcPolicyError(403, "METHOD_NOT_ALLOWED", "RPC method is not permitted");
  }
  if (!Array.isArray(candidate.params)) {
    throw new RpcPolicyError(400, "INVALID_PARAMS", "params must be an array");
  }
  const id = candidate.id;
  if (id !== null && typeof id !== "string" && typeof id !== "number") {
    throw new RpcPolicyError(400, "INVALID_REQUEST", "id must be a string, number, or null");
  }
  return {
    jsonrpc: "2.0",
    id,
    method: candidate.method,
    params: candidate.params,
  };
}

export async function readBoundedJson(request: Request): Promise<JsonRpcRequest> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new RpcPolicyError(413, "REQUEST_TOO_LARGE", "RPC request body is too large");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_REQUEST_BYTES) {
    throw new RpcPolicyError(413, "REQUEST_TOO_LARGE", "RPC request body is too large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new RpcPolicyError(400, "INVALID_JSON", "Request body is not valid JSON");
  }
  return validateRpcPayload(parsed);
}

async function readBoundedResponse(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new RpcPolicyError(502, "UPSTREAM_RESPONSE_TOO_LARGE", "RPC upstream response is too large");
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new RpcPolicyError(502, "UPSTREAM_RESPONSE_TOO_LARGE", "RPC upstream response is too large");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function forwardRpc(
  payload: JsonRpcRequest,
  upstreamUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetcher(upstreamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const bytes = await readBoundedResponse(upstream);
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof RpcPolicyError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new RpcPolicyError(504, "UPSTREAM_TIMEOUT", "RPC upstream timed out");
    }
    throw new RpcPolicyError(502, "UPSTREAM_UNAVAILABLE", "RPC upstream is unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

export function rpcErrorResponse(error: unknown, requestId: string): Response {
  const policyError = error instanceof RpcPolicyError
    ? error
    : new RpcPolicyError(500, "INTERNAL_ERROR", "Unexpected RPC proxy error");
  const headers: HeadersInit = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Request-Id": requestId,
  };
  if (policyError.retryAfter) headers["Retry-After"] = String(policyError.retryAfter);
  return Response.json(
    { error: { code: policyError.code, message: policyError.message }, requestId },
    { status: policyError.status, headers },
  );
}
