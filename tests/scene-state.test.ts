import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_CACHED_BLOCKS,
  MAX_INCOMPLETE_BLOCKS,
  useSceneState,
} from "../app/hooks/useSceneState";
import type { Block, GenLayerTransaction } from "../app/types";
import { receiptProcessingKey } from "../app/hooks/useTransactions";

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

function transaction(hash: string, blockNumber: number): GenLayerTransaction {
  return {
    hash, id: hash, txOrigin: "", sender: "", recipient: "", activator: "",
    status: "FINALIZED", statusCode: 7, finalizationOutcome: "FINALIZED",
    timestamps: { Created: "", Pending: "", Activated: "", Proposed: "", Committed: "", LastVote: "" },
    numOfInitialValidators: 0, consumedValidators: [], roundData: [], eqBlocksOutputs: "c0",
    txData: "", readStateBlockRange: { ActivationBlock: 0, ProcessingBlock: 0, ProposalBlock: 0 },
    isIntelligent: false, blockNumber,
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
    useSceneState.getState().updateBlockTxDetails(42, historical.hash, [transaction]);
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
      useSceneState.getState().updateBlockTxDetails(
        42,
        useSceneState.getState().blockCache[42].hash,
        [transaction],
        true,
      );
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

  it("replaces a same-height block and hydrates only its canonical transaction", () => {
    const blockA = { ...block(500), hash: "0xblock-a", transactions: ["0xtx-x"] };
    const blockB = { ...block(500), hash: "0xblock-b", transactions: ["0xtx-y"] };
    const txX = transaction("0xtx-x", 500);
    const txY = transaction("0xtx-y", 500);

    useSceneState.getState().setBlocks([blockA]);
    useSceneState.getState().updateBlockTxDetails(500, blockA.hash, [txX], true);
    useSceneState.getState().setSelectedTx(txX.hash);
    useSceneState.getState().setIncompleteReceipts(500, [txX.hash]);
    useSceneState.getState().addBlock(blockB);
    useSceneState.getState().updateBlockTxDetails(500, blockB.hash, [txY], true);

    const state = useSceneState.getState();
    expect(state.blockCache[500]).toMatchObject({ hash: blockB.hash, transactions: [txY.hash] });
    expect(state.blockCache[500].txDetails.map((tx) => tx.hash)).toEqual([txY.hash]);
    expect(state.transactions[txX.hash]).toBeUndefined();
    expect(state.transactions[txY.hash]).toBeDefined();
    expect(state.feedTxs.map((tx) => tx.hash)).toEqual([txY.hash]);
    expect(state.selectedTxHash).toBeNull();
    expect(state.incompleteReceipts[500]).toBeUndefined();
    expect(receiptProcessingKey(blockA)).not.toBe(receiptProcessingKey(blockB));
  });

  it("rejects an in-flight receipt batch for an orphaned block hash", () => {
    const blockA = { ...block(500), hash: "0xblock-a", transactions: ["0xtx-x"] };
    const blockB = { ...block(500), hash: "0xblock-b", transactions: ["0xtx-y"] };
    const txX = transaction("0xtx-x", 500);
    const txY = transaction("0xtx-y", 500);
    useSceneState.getState().setBlocks([blockA]);
    useSceneState.getState().addBlock(blockB);
    useSceneState.getState().updateBlockTxDetails(500, blockB.hash, [txY], true);

    // Simulates block A's older request resolving after block B became canonical.
    useSceneState.getState().updateBlockTxDetails(500, blockA.hash, [txX], true);

    const state = useSceneState.getState();
    expect(state.blockCache[500].hash).toBe(blockB.hash);
    expect(state.blockCache[500].txDetails.map((tx) => tx.hash)).toEqual([txY.hash]);
    expect(state.transactions[txX.hash]).toBeUndefined();
    expect(state.feedTxs.map((tx) => tx.hash)).toEqual([txY.hash]);
  });

  it("removes stale transactions across a consecutive multi-block reorganisation", () => {
    const oldBlocks = [500, 501, 502].map((height) => ({
      ...block(height),
      hash: `0xold-${height}`,
      parentHash: height === 500 ? "0xparent" : `0xold-${height - 1}`,
      transactions: [`0xold-tx-${height}`],
    }));
    useSceneState.getState().setBlocks(oldBlocks);
    for (const oldBlock of oldBlocks) {
      useSceneState.getState().updateBlockTxDetails(
        oldBlock.number,
        oldBlock.hash,
        [transaction(oldBlock.transactions[0], oldBlock.number)],
        true,
      );
    }

    const replacements = [500, 501, 502].map((height) => ({
      ...block(height),
      hash: `0xnew-${height}`,
      parentHash: height === 500 ? "0xparent" : `0xnew-${height - 1}`,
      transactions: [`0xnew-tx-${height}`],
    }));
    for (const replacement of replacements) {
      useSceneState.getState().addBlock(replacement);
      useSceneState.getState().updateBlockTxDetails(
        replacement.number,
        replacement.hash,
        [transaction(replacement.transactions[0], replacement.number)],
        true,
      );
    }

    const state = useSceneState.getState();
    expect([500, 501, 502].map((height) => state.blockCache[height].hash)).toEqual(
      replacements.map((replacement) => replacement.hash),
    );
    expect(Object.keys(state.transactions).sort()).toEqual(
      replacements.map((replacement) => replacement.transactions[0]).sort(),
    );
    expect(state.feedTxs).toHaveLength(3);
    expect(new Set(state.feedTxs.map((tx) => tx.hash)).size).toBe(3);
    expect(state.totalTxCount).toBe(3);
  });
});
