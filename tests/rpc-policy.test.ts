import { describe, expect, it, vi } from "vitest";
import {
  enforceRateLimit,
  forwardRpc,
  readBoundedJson,
  RpcPolicyError,
  validateRpcPayload,
} from "../app/api/rpc/policy";

describe("RPC proxy policy", () => {
  it("uses the shared platform rate limiter", async () => {
    const allowed = { limit: vi.fn(async () => ({ success: true })) };
    await expect(enforceRateLimit(allowed, "203.0.113.1")).resolves.toBeUndefined();
    expect(allowed.limit).toHaveBeenCalledWith({ key: "203.0.113.1" });

    const denied = { limit: vi.fn(async () => ({ success: false })) };
    await expect(enforceRateLimit(denied, "203.0.113.1")).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      retryAfter: 60,
    });
  });

  it("accepts explorer read methods", () => {
    expect(validateRpcPayload({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBlockByNumber",
      params: ["0x1", true],
    }).method).toBe("eth_getBlockByNumber");
  });

  it("rejects state-changing and batch requests", () => {
    expect(() => validateRpcPayload({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_sendRawTransaction",
      params: ["0x00"],
    })).toThrowError(RpcPolicyError);
    expect(() => validateRpcPayload([])).toThrowError(/one JSON-RPC request/);
  });

  it("rejects oversized bodies before parsing", async () => {
    const request = new Request("https://example.test/api/rpc", {
      method: "POST",
      headers: { "Content-Length": String(65 * 1024) },
      body: "{}",
    });
    await expect(readBoundedJson(request)).rejects.toMatchObject({ status: 413 });
  });

  it("preserves valid upstream JSON responses", async () => {
    const fetcher = vi.fn(async () => Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: "0x2a",
    }));
    const response = await forwardRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: [],
    }, "https://rpc.example.test", fetcher);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: "0x2a" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("blocks oversized upstream responses", async () => {
    const fetcher = vi.fn(async () => new Response("{}", {
      headers: { "Content-Length": String(2 * 1024 * 1024 + 1) },
    }));
    await expect(forwardRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: [],
    }, "https://rpc.example.test", fetcher)).rejects.toMatchObject({
      code: "UPSTREAM_RESPONSE_TOO_LARGE",
    });
  });
});
