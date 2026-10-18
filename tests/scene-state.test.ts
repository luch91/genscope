import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_CACHED_BLOCKS,
  MAX_INCOMPLETE_BLOCKS,
  useSceneState,
} from "../app/hooks/useSceneState";
import type { Block } from "../app/types";

function block(number: number): Block {
  return {
    number,
    hash: `0x${number.toString(16).padStart(64, "0")}`,
    parentHash: "0x0",
    timestamp: number,
    transactions: [],
    miner: "0x0",
    gasUsed: "0x0",
    gasLimit: "0x0",
    txDetails: [],
    hasIntelligent: false,
    hasStandard: false,
    addedAt: number,
  };
}

describe("block history and render window", () => {
  beforeEach(() => {
    useSceneState.setState({
      blocks: [], blockCache: {}, transactions: {}, feedTxs: [], incompleteReceipts: {},
      totalTxCount: 0, intelligentTxCount: 0, activeValidators: new Set(),
    });
  });

  it("keeps fetched history while rendering at most 100 blocks", () => {
    useSceneState.getState().setBlocks(
      Array.from({ length: 100 }, (_, index) => block(201 - index)),
    );
    useSceneState.getState().addOlderBlocks(
      Array.from({ length: 20 }, (_, index) => block(101 - index)),
    );

    const state = useSceneState.getState();
    expect(state.blocks).toHaveLength(100);
    expect(state.blocks[0].number).toBe(181);
    expect(state.blocks.at(-1)?.number).toBe(82);
    expect(Object.keys(state.blockCache)).toHaveLength(120);
    expect(state.blockCache[201].number).toBe(201);
    expect(state.blockCache[82].number).toBe(82);
  });

  it("retains historical cache when a new head block arrives", () => {
    useSceneState.getState().setBlocks([block(10), block(9)]);
    useSceneState.getState().addOlderBlocks([block(8)]);
    useSceneState.getState().addBlock(block(11));

    const state = useSceneState.getState();
    expect(state.blockCache[8]).toBeDefined();
    expect(state.blockCache[11]).toBeDefined();
  });

  it("replaces an existing height when reconciliation detects a new canonical block", () => {
    useSceneState.getState().setBlocks([block(10), block(9)]);
    const replacement = { ...block(10), hash: "0xcanonical" };
    useSceneState.getState().addBlock(replacement);

    expect(useSceneState.getState().blocks.find((item) => item.number === 10)?.hash).toBe("0xcanonical");
    expect(useSceneState.getState().blockCache[10].hash).toBe("0xcanonical");
  });

  it("moves a cached historical search result into the visible scene", () => {
    useSceneState.getState().setBlocks(Array.from({ length: 120 }, (_, index) => block(1_000 - index)));
    const historical = useSceneState.getState().blockCache[881];
    expect(useSceneState.getState().blocks.some((item) => item.number === 881)).toBe(false);

    useSceneState.getState().setSelectedBlock(historical.number);

    expect(useSceneState.getState().selectedBlockNumber).toBe(881);
    expect(useSceneState.getState().blocks[0].number).toBe(881);
    expect(useSceneState.getState().blocks).toHaveLength(100);
  });

  it("bounds historical and unresolved-receipt retention", () => {
    useSceneState.getState().setBlocks(
      Array.from({ length: MAX_CACHED_BLOCKS + 100 }, (_, index) => block(index + 1)),
    );
    expect(Object.keys(useSceneState.getState().blockCache)).toHaveLength(MAX_CACHED_BLOCKS);

    for (let index = 0; index < MAX_INCOMPLETE_BLOCKS + 20; index++) {
      useSceneState.getState().setIncompleteReceipts(index, [`0x${index}`]);
    }
    expect(Object.keys(useSceneState.getState().incompleteReceipts)).toHaveLength(MAX_INCOMPLETE_BLOCKS);
  });

  it("merges partial receipts in cached blocks and preserves recovery state", () => {
    const historical = { ...block(42), transactions: ["0xa", "0xb"] };
    useSceneState.getState().setBlocks([historical]);
    const transaction = {
      hash: "0xa", id: "0xa", txOrigin: "", sender: "", recipient: "", activator: "",
      status: "PENDING" as const, statusCode: 1,
      timestamps: { Created: "", Pending: "", Activated: "", Proposed: "", Committed: "", LastVote: "" },
      numOfInitialValidators: 0, consumedValidators: [], roundData: [], eqBlocksOutputs: "c0",
      txData: "", readStateBlockRange: { ActivationBlock: 0, ProcessingBlock: 0, ProposalBlock: 0 },
      isIntelligent: false, blockNumber: 42,
    };
    useSceneState.getState().updateBlockTxDetails(42, [transaction]);
    useSceneState.getState().setIncompleteReceipts(42, ["0xb"]);
    useSceneState.setState({ blocks: [] });

    expect(useSceneState.getState().blockCache[42].txDetails.map((tx) => tx.hash)).toEqual(["0xa"]);
    expect(useSceneState.getState().incompleteReceipts[42]).toEqual(["0xb"]);

    useSceneState.getState().clearIncompleteReceipts(42);
    expect(useSceneState.getState().incompleteReceipts[42]).toBeUndefined();
  });

  it("upserts PENDING to ACCEPTED to FINALIZED everywhere without duplicates", () => {
    const base = {
      hash: "0xlifecycle", id: "0xlifecycle", txOrigin: "", sender: "", recipient: "", activator: "",
      status: "PENDING" as const, statusCode: 1,
      consensusDecision: undefined, executionResult: undefined,
      finalizationOutcome: "NOT_FINALIZED" as const,
      timestamps: { Created: "", Pending: "", Activated: "", Proposed: "", Committed: "", LastVote: "" },
      numOfInitialValidators: 0, consumedValidators: [], roundData: [], eqBlocksOutputs: "c0",
      txData: "", readStateBlockRange: { ActivationBlock: 0, ProcessingBlock: 0, ProposalBlock: 0 },
      isIntelligent: false, blockNumber: 42,
    };
    useSceneState.getState().setBlocks([{ ...block(42), transactions: [base.hash] }]);

    for (const transaction of [
      base,
      { ...base, status: "ACCEPTED" as const, statusCode: 5, consensusDecision: "MAJORITY_AGREE" },
      {
        ...base,
        status: "FINALIZED" as const,
        statusCode: 7,
        consensusDecision: "MAJORITY_AGREE",
        executionResult: "FINISHED_WITH_ERROR" as const,
        finalizationOutcome: "FINALIZED" as const,
      },
    ]) {
      useSceneState.getState().updateBlockTxDetails(42, [transaction]);
      useSceneState.getState().addFeedTx(transaction);
      useSceneState.getState().addTransaction(transaction);
    }

    const state = useSceneState.getState();
    expect(state.blockCache[42].txDetails).toHaveLength(1);
    expect(state.blockCache[42].txDetails[0].status).toBe("FINALIZED");
    expect(state.transactions[base.hash].status).toBe("FINALIZED");
    expect(state.transactions[base.hash].executionResult).toBe("FINISHED_WITH_ERROR");
    expect(state.feedTxs.filter((transaction) => transaction.hash === base.hash)).toHaveLength(1);
    expect(state.feedTxs.find((transaction) => transaction.hash === base.hash)?.status).toBe("FINALIZED");
    expect(state.totalTxCount).toBe(1);
  });
});
