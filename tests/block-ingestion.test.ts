import { describe, expect, it } from "vitest";
import { fetchBlockBatch } from "../app/hooks/useBlocks";
import type { RawBlock } from "../app/lib/genlayer";

function rawBlock(number: number): RawBlock {
  const hex = number.toString(16);
  return {
    number: `0x${hex}`,
    hash: `0x${hex.padStart(64, "0")}`,
    parentHash: `0x${Math.max(0, number - 1).toString(16).padStart(64, "0")}`,
    timestamp: "0x1",
    transactions: [],
    miner: "0x0",
    gasUsed: "0x0",
    gasLimit: "0x0",
  };
}

describe("block ingestion recovery", () => {
  it("tracks intermittent failures and recovers every missing block", async () => {
    const attempts = new Map<number, number>();
    const fetcher = async (number: number) => {
      attempts.set(number, (attempts.get(number) ?? 0) + 1);
      if ((number === 102 || number === 104) && attempts.get(number) === 1) {
        throw new Error("injected RPC failure");
      }
      return rawBlock(number);
    };

    const first = await fetchBlockBatch([101, 102, 103, 104, 105], fetcher, 2);
    expect(first.blocks.map((block) => block.number).sort()).toEqual([101, 103, 105]);
    expect(first.failed.sort()).toEqual([102, 104]);

    const recovery = await fetchBlockBatch(first.failed, fetcher, 2);
    expect(recovery.failed).toEqual([]);
    expect(recovery.blocks.map((block) => block.number).sort()).toEqual([102, 104]);
  });

  it("never exceeds the requested fetch concurrency", async () => {
    let active = 0;
    let peak = 0;
    const fetcher = async (number: number) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return rawBlock(number);
    };

    await fetchBlockBatch([1, 2, 3, 4, 5, 6], fetcher, 3);
    expect(peak).toBeLessThanOrEqual(3);
  });
});
