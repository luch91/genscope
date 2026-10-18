import { describe, expect, it } from "vitest";
import {
  CHAIN_STATS_SOURCE,
  chainStatsFreshness,
  normalizeChainStats,
  transactionCountPresentation,
} from "../app/lib/chain-stats";
import { parseChainStatsResponse } from "../app/hooks/useChainStats";

describe("chain statistics provenance", () => {
  it("preserves a valid explorer-reported cumulative total and provenance", () => {
    const stats = normalizeChainStats(
      { lastSealedBlock: 25_451_660, lastVerifiedBlock: 25_450_085, totalTransactions: 98_876_305 },
      "2026-10-18T10:38:29.000Z",
      "Sun, 18 Oct 2026 10:38:32 GMT",
    );
    expect(stats.totalTransactions).toBe(98_876_305);
    expect(stats.source).toEqual(CHAIN_STATS_SOURCE);
    expect(stats.source.independentlyVerified).toBe(false);
  });

  it("represents a missing upstream total as unavailable rather than zero", () => {
    const stats = normalizeChainStats({ lastSealedBlock: 10, lastVerifiedBlock: 9 });
    expect(stats.totalTransactions).toBeNull();
    expect(transactionCountPresentation(stats.totalTransactions, 2, null).network).toBe("Unavailable");
  });

  it("marks cached statistics stale after the declared freshness window", () => {
    const observedAt = "2026-10-18T10:00:00.000Z";
    expect(chainStatsFreshness(observedAt, 45, Date.parse("2026-10-18T10:00:44.000Z"))).toBe("fresh");
    expect(chainStatsFreshness(observedAt, 45, Date.parse("2026-10-18T10:00:46.000Z"))).toBe("stale");
  });

  it("keeps network, locally loaded, and selected-block counts distinct", () => {
    expect(transactionCountPresentation(98_864_090, 2, 1)).toEqual({
      network: "98,864,090",
      local: "2",
      selectedBlock: "1",
    });
  });

  it("rejects malformed metadata and exposes stale API responses", () => {
    const payload = normalizeChainStats(
      { lastSealedBlock: 10, lastVerifiedBlock: 9, totalTransactions: 20 },
      "2026-10-18T10:00:00.000Z",
    );
    expect(parseChainStatsResponse(payload, Date.parse("2026-10-18T10:01:00.000Z"))?.status).toBe("stale");
    expect(parseChainStatsResponse({ ...payload, freshness: null })).toBeNull();
  });
});
