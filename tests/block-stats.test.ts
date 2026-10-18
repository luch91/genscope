import { describe, expect, it } from "vitest";
import { selectedBlockTransactionStats } from "../app/lib/block-stats";
import type { Block, GenLayerTransaction } from "../app/types";

const hashes = ["0xa", "0xb", "0xc", "0xd", "0xe"];
const tx = (hash: string): GenLayerTransaction => ({
  hash, id: hash, txOrigin: "", sender: "", recipient: "", activator: "",
  status: "PENDING", statusCode: 1,
  timestamps: { Created: "", Pending: "", Activated: "", Proposed: "", Committed: "", LastVote: "" },
  numOfInitialValidators: 0, consumedValidators: [], roundData: [], eqBlocksOutputs: "c0",
  txData: "", readStateBlockRange: { ActivationBlock: 0, ProcessingBlock: 0, ProposalBlock: 0 },
  isIntelligent: false, blockNumber: 50,
});
const block = (details: GenLayerTransaction[]): Block => ({
  number: 50, hash: "0xblock", parentHash: "0xparent", timestamp: 1,
  transactions: hashes, miner: "0x0", gasUsed: "0x0", gasLimit: "0x0",
  txDetails: details, hasIntelligent: false, hasStandard: true, addedAt: 1,
});

describe("selected block transaction statistics", () => {
  it.each([[0, 5], [2, 3], [5, 0]])(
    "keeps five identified transactions with %i loaded details",
    (loaded, pending) => {
      expect(selectedBlockTransactionStats(block(hashes.slice(0, loaded).map(tx)))).toEqual({
        total: 5,
        loaded,
        pending,
      });
    },
  );

  it("keeps delayed receipts pending and ignores duplicate or unrelated details", () => {
    expect(selectedBlockTransactionStats(block([tx("0xa"), tx("0xa"), tx("0xother")]))).toEqual({
      total: 5,
      loaded: 1,
      pending: 4,
    });
  });
});
