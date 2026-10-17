import { beforeEach, describe, expect, it } from "vitest";
import { useSceneState } from "../app/hooks/useSceneState";
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
    useSceneState.setState({ blocks: [], blockCache: {} });
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
});
