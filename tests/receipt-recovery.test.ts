import { afterEach, describe, expect, it, vi } from "vitest";
import { getTransactionReceiptResult } from "../app/lib/genlayer";

afterEach(() => vi.unstubAllGlobals());

describe("receipt recovery outcomes", () => {
  it("distinguishes pending and invalid responses", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: {
        id: `0x${"0".repeat(64)}`,
        sender: "0x0000000000000000000000000000000000000000",
        status: 0,
      } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { id: "0x1", sender: "0x1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await expect(getTransactionReceiptResult("0xpending")).resolves.toEqual({ kind: "pending" });
    await expect(getTransactionReceiptResult("0xother-network")).resolves.toEqual({ kind: "not_found" });
    await expect(getTransactionReceiptResult("0xinvalid")).resolves.toEqual({ kind: "invalid_response" });
  });

  it("distinguishes rate limits, timeouts, and upstream failures", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response("limited", { status: 429, statusText: "Too Many Requests" }))
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))
      .mockRejectedValueOnce(new Error("connection reset"));
    vi.stubGlobal("fetch", fetch);

    await expect(getTransactionReceiptResult("0xlimited")).resolves.toEqual({ kind: "rate_limited" });
    await expect(getTransactionReceiptResult("0xtimeout")).resolves.toEqual({ kind: "timeout" });
    await expect(getTransactionReceiptResult("0xfailure")).resolves.toMatchObject({ kind: "upstream_failure" });
  });
});
