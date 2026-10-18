"use client";
import { useEffect, useRef } from "react";
import { getBlockByNumber, getLatestBlockNumber } from "../lib/genlayer";
import { parseBlock } from "../lib/parsers";
import { useSceneState } from "./useSceneState";
import { BLOCK_POLL_INTERVAL, INITIAL_BLOCK_FETCH, OLDER_BLOCKS_FETCH } from "../lib/constants";
import {
  BlockRecoveryTracker,
  MAX_RECONCILE_BLOCKS_PER_POLL,
} from "../lib/block-recovery";

const BLOCK_FETCH_CONCURRENCY = 5;

export async function fetchBlockBatch(
  blockNumbers: number[],
  fetcher = getBlockByNumber,
  concurrency = BLOCK_FETCH_CONCURRENCY,
): Promise<{ blocks: ReturnType<typeof parseBlock>[]; failed: number[] }> {
  const blocks: ReturnType<typeof parseBlock>[] = [];
  const failed: number[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < blockNumbers.length) {
      const blockNumber = blockNumbers[cursor++];
      try {
        const raw = await fetcher(blockNumber, true);
        if (raw) blocks.push(parseBlock(raw));
        else failed.push(blockNumber);
      } catch {
        failed.push(blockNumber);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, blockNumbers.length) }, () => worker()),
  );
  return { blocks, failed };
}

export function useBlocks() {
  const { addBlock, setNetworkStatus, setLatestBlockNumber } = useSceneState();
  const latestKnownRef = useRef<number>(0);
  const recoveryRef = useRef(new BlockRecoveryTracker());
  const initializedRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);
  const isPollingRef = useRef(false); // prevent concurrent poll calls
  const nextPollAllowedRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchInitialBlocks() {
      try {
        setNetworkStatus("live");
        const latest = await getLatestBlockNumber();
        latestKnownRef.current = latest;
        setLatestBlockNumber(latest);
        consecutiveFailuresRef.current = 0;

        const blockNumbers: number[] = [];
        for (let i = 0; i < INITIAL_BLOCK_FETCH; i++) {
          const blockNum = latest - i;
          if (blockNum < 0) break;
          blockNumbers.push(blockNum);
        }
        const floor = Math.min(...blockNumbers);
        recoveryRef.current = new BlockRecoveryTracker(floor - 1);
        const result = await fetchBlockBatch(blockNumbers);
        for (const block of result.blocks) {
          if (!cancelled) addBlock(block);
        }
        recoveryRef.current.record(result.blocks.map((block) => block.number), result.failed);
      } catch (err) {
        console.error("Initial block fetch error:", err);
        setNetworkStatus("reconnecting");
      }
    }

    async function pollNewBlocks() {
      if (document.visibilityState === "hidden") return;
      if (Date.now() < nextPollAllowedRef.current) return;
      if (isPollingRef.current) return; // skip if previous poll still in flight
      isPollingRef.current = true;
      try {
        const latest = await getLatestBlockNumber();
        setLatestBlockNumber(latest);
        consecutiveFailuresRef.current = 0;
        nextPollAllowedRef.current = 0;

        if (latest <= latestKnownRef.current && recoveryRef.current.checkpoint >= latest) {
          // No new blocks — still live
          setNetworkStatus("live");
          return;
        }

        setNetworkStatus("live");
        const wanted = recoveryRef.current.plan(latest, MAX_RECONCILE_BLOCKS_PER_POLL);
        const result = await fetchBlockBatch(wanted);
        let reorgFrom: number | null = null;
        for (const block of result.blocks) {
          const predecessor = useSceneState.getState().blockCache[block.number - 1];
          if (predecessor && block.parentHash !== predecessor.hash) {
            const reconcileFrom = Math.max(0, block.number - 6);
            reorgFrom = reorgFrom === null ? reconcileFrom : Math.min(reorgFrom, reconcileFrom);
          }
          if (!cancelled) addBlock(block);
        }
        if (reorgFrom !== null) {
          recoveryRef.current.rewind(reorgFrom);
        } else {
          recoveryRef.current.record(result.blocks.map((block) => block.number), result.failed);
        }
        latestKnownRef.current = Math.max(latestKnownRef.current, latest);
        if (recoveryRef.current.failedCount > 0) {
          console.warn("Block reconciliation pending", {
            contiguousCheckpoint: recoveryRef.current.checkpoint,
            failedBlocks: recoveryRef.current.failedCount,
          });
        }
      } catch (err) {
        // Ignore intentional aborts (timeout or cleanup)
        if (err instanceof Error && err.name === "AbortError") return;
        consecutiveFailuresRef.current += 1;
        nextPollAllowedRef.current = Date.now() + Math.min(
          30_000,
          BLOCK_POLL_INTERVAL * 2 ** consecutiveFailuresRef.current,
        );
        // Only show reconnecting after 2 consecutive failures — single transient
        // errors are common and should not alarm the user
        if (consecutiveFailuresRef.current >= 2) {
          console.error("Block poll error:", err);
          setNetworkStatus("reconnecting");
        }
      } finally {
        isPollingRef.current = false;
      }
    }

    if (!initializedRef.current) {
      initializedRef.current = true;
      fetchInitialBlocks();
    }

    const interval = setInterval(pollNewBlocks, BLOCK_POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Standalone (non-hook) function — safe to call from event handlers.
 * Fetches OLDER_BLOCKS_FETCH blocks before the oldest block currently in the store.
 */
export async function loadOlderBlocks(): Promise<void> {
  const { blocks, addOlderBlocks, setLoadingOlder } = useSceneState.getState();
  if (blocks.length === 0) return;

  const oldestNumber = Math.min(...blocks.map((b) => b.number));
  if (oldestNumber <= 1) return;

  setLoadingOlder(true);
  try {
    const blockNumbers: number[] = [];
    for (let i = 1; i <= OLDER_BLOCKS_FETCH; i++) {
      const blockNum = oldestNumber - i;
      if (blockNum < 0) break;
      blockNumbers.push(blockNum);
    }
    const { blocks: olderBlocks } = await fetchBlockBatch(blockNumbers);
    if (olderBlocks.length > 0) addOlderBlocks(olderBlocks);
  } finally {
    setLoadingOlder(false);
  }
}

/**
 * Fetch a single block by number and add to store.
 * Returns the block number if found, null if not.
 */
export async function fetchAndAddBlock(blockNumber: number): Promise<ReturnType<typeof parseBlock> | null> {
  try {
    const raw = await getBlockByNumber(blockNumber, true);
    if (!raw) return null;
    const block = parseBlock(raw);
    useSceneState.getState().addBlock(block);
    return block;
  } catch {
    return null;
  }
}
