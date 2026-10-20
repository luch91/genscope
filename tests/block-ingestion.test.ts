import { describe, expect, it } from "vitest";
import { blockPollDelay, fetchBlockBatch, sortBlocksForReconciliation } from "../app/hooks/useBlocks";
import { BlockRecoveryTracker, MAX_RECONCILE_BLOCKS_PER_POLL } from "../app/lib/block-recovery";
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
  it("polls visible tabs every second and backs off when hidden or failing", () => {
    expect(blockPollDelay({ visible: true, consecutiveFailures: 0 })).toBe(1_000);
    expect(blockPollDelay({ visible: true, consecutiveFailures: 1 })).toBe(2_000);
    expect(blockPollDelay({ visible: true, consecutiveFailures: 10 })).toBe(30_000);
    expect(blockPollDelay({ visible: false, consecutiveFailures: 0 })).toBe(15_000);
  });

  it("subtracts request duration to preserve start cadence without overlap", () => {
    expect(blockPollDelay({ visible: true, consecutiveFailures: 0, elapsedMs: 250 })).toBe(750);
    expect(blockPollDelay({ visible: true, consecutiveFailures: 0, elapsedMs: 1_500 })).toBe(0);
    expect(blockPollDelay({ visible: false, consecutiveFailures: 0, elapsedMs: 2_000 })).toBe(15_000);
    expect(blockPollDelay({ visible: true, consecutiveFailures: 2, elapsedMs: 1_500 })).toBe(4_000);
  });
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

  it("recovers hundreds of missing blocks with bounded batches and bookkeeping", () => {
    const tracker = new BlockRecoveryTracker(0);
    const attempts = new Map<number, number>();
    let largestBatch = 0;
    let largestBookkeeping = 0;

    for (let poll = 0; poll < 1_000 && tracker.checkpoint < 600; poll++) {
      const batch = tracker.plan(600);
      largestBatch = Math.max(largestBatch, batch.length);
      const succeeded: number[] = [];
      const failed: number[] = [];
      for (const height of batch) {
        const count = (attempts.get(height) ?? 0) + 1;
        attempts.set(height, count);
        if (height % 7 === 0 && count < 3) failed.push(height);
        else succeeded.push(height);
      }
      tracker.record(succeeded, failed);
      largestBookkeeping = Math.max(
        largestBookkeeping,
        tracker.pendingCount + tracker.failedCount,
      );
    }

    expect(tracker.checkpoint).toBe(600);
    expect(largestBatch).toBeLessThanOrEqual(MAX_RECONCILE_BLOCKS_PER_POLL);
    expect(largestBookkeeping).toBeLessThanOrEqual(MAX_RECONCILE_BLOCKS_PER_POLL);
  });

  it("rewinds a bounded window for chain reorganisation recovery", () => {
    const tracker = new BlockRecoveryTracker(100);
    tracker.rewind(95);
    expect(tracker.checkpoint).toBe(94);
    expect(tracker.plan(110)).toEqual(Array.from({ length: 16 }, (_, index) => 95 + index));
  });

  it("reconciles a multi-block reorganisation in canonical height order", () => {
    const tracker = new BlockRecoveryTracker(502);
    tracker.rewind(500);
    expect(tracker.plan(502)).toEqual([500, 501, 502]);

    const replacements = sortBlocksForReconciliation([
      { number: 502, hash: "0xb502" },
      { number: 500, hash: "0xb500" },
      { number: 501, hash: "0xb501" },
    ]);
    tracker.record(replacements.map((item) => item.number), []);

    expect(replacements.map((item) => item.number)).toEqual([500, 501, 502]);
    expect(new Set(replacements.map((item) => item.hash)).size).toBe(3);
    expect(tracker.checkpoint).toBe(502);
    expect(tracker.pendingCount).toBe(0);
    expect(tracker.failedCount).toBe(0);
  });
});
