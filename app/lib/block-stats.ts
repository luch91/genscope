import type { Block } from "../types";

function uniqueHashes(values: string[]): Set<string> {
  return new Set(values.filter((hash) => typeof hash === "string" && hash.length > 0));
}

export function selectedBlockTransactionStats(block: Block) {
  const identified = uniqueHashes(block.transactions);
  const hydrated = uniqueHashes(
    block.txDetails
      .map((transaction) => transaction.hash)
      .filter((hash) => identified.has(hash)),
  );
  return {
    total: identified.size,
    loaded: hydrated.size,
    pending: Math.max(0, identified.size - hydrated.size),
  };
}
