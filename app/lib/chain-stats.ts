export const CHAIN_STATS_SOURCE = {
  name: "GenLayer Chain Explorer Stats API",
  url: "https://explorer-api.testnet-chain.genlayer.com/stats",
  network: "GenLayer Chain Testnet (chain ID 4221)",
  semantics: "Explorer-reported cumulative network transaction total",
  independentlyVerified: false,
} as const;

export const CHAIN_STATS_MAX_AGE_SECONDS = 45;

export interface ChainStatsPayload {
  lastSealedBlock: number;
  lastVerifiedBlock: number;
  totalTransactions: number | null;
  source: typeof CHAIN_STATS_SOURCE;
  freshness: {
    observedAt: string;
    upstreamDate: string | null;
    maxAgeSeconds: number;
  };
}

function nonNegativeInteger(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function normalizeChainStats(
  value: unknown,
  observedAt = new Date().toISOString(),
  upstreamDate: string | null = null,
): ChainStatsPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_UPSTREAM_RESPONSE");
  }
  const record = value as Record<string, unknown>;
  const lastSealedBlock = nonNegativeInteger(record.lastSealedBlock);
  const lastVerifiedBlock = nonNegativeInteger(record.lastVerifiedBlock);
  if (lastSealedBlock === null || lastVerifiedBlock === null) {
    throw new Error("INVALID_UPSTREAM_RESPONSE");
  }

  return {
    lastSealedBlock,
    lastVerifiedBlock,
    // A missing total is not zero. Preserve its unavailable state while still
    // serving independently valid block statistics.
    totalTransactions: nonNegativeInteger(record.totalTransactions),
    source: CHAIN_STATS_SOURCE,
    freshness: {
      observedAt,
      upstreamDate,
      maxAgeSeconds: CHAIN_STATS_MAX_AGE_SECONDS,
    },
  };
}

export function chainStatsFreshness(
  observedAt: string,
  maxAgeSeconds: number,
  now = Date.now(),
): "fresh" | "stale" {
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed) || now - observed > maxAgeSeconds * 1_000) return "stale";
  return "fresh";
}

export function transactionCountPresentation(
  network: number | null,
  local: number,
  selectedBlock: number | null,
) {
  return {
    network: network === null ? "Unavailable" : network.toLocaleString("en-US"),
    local: local.toLocaleString("en-US"),
    selectedBlock: selectedBlock === null ? "No block selected" : selectedBlock.toLocaleString("en-US"),
  };
}
