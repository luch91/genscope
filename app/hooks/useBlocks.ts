"use client";
import { useEffect, useRef } from "react";
import { getBlockByNumber, getLatestBlockNumber } from "../lib/genlayer";
import { parseBlock } from "../lib/parsers";
import { useSceneState } from "./useSceneState";
import {
  BLOCK_POLL_INTERVAL,
  HIDDEN_BLOCK_POLL_INTERVAL,
  INITIAL_BLOCK_FETCH,
  MAX_BLOCK_POLL_BACKOFF,
  OLDER_BLOCKS_FETCH,
} from "../lib/constants";
import {
  BlockRecoveryTracker,
  MAX_RECONCILE_BLOCKS_PER_POLL,
} from "../lib/block-recovery";

const BLOCK_FETCH_CONCURRENCY = 5;

export function blockPollDelay({
  visible,
  consecutiveFailures,
  elapsedMs = 0,
}: {
  visible: boolean;
  consecutiveFailures: number;
  elapsedMs?: number;
}): number {
  if (!visible) return HIDDEN_BLOCK_POLL_INTERVAL;
  if (consecutiveFailures > 0) {
    return Math.min(
      MAX_BLOCK_POLL_BACKOFF,
      BLOCK_POLL_INTERVAL * 2 ** consecutiveFailures,
    );
  }
  // Keep request starts on the target cadence without overlapping requests.
  // Slow responses cause the next poll to start immediately after completion;
  // fast responses wait only for the remainder of the interval.
  return Math.max(0, BLOCK_POLL_INTERVAL - elapsedMs);
}

export function sortBlocksForReconciliation<T extends { number: number }>(blocks: T[]): T[] {
  return [...blocks].sort((a, b) => a.number - b.number);
}

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
  const initialHydrationRef = useRef(true);
  const consecutiveFailuresRef = useRef(0);
  const isPollingRef = useRef(false); // prevent concurrent poll calls
  const isReconcilingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

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
        // Start cheap chain-head checks immediately; initial full-block
        // hydration can take several seconds on a cold Bradbury connection.
        scheduleNextPoll();
        const result = await fetchBlockBatch(blockNumbers);
        for (const block of sortBlocksForReconciliation(result.blocks)) {
          if (!cancelled) addBlock(block);
        }
        recoveryRef.current.record(result.blocks.map((block) => block.number), result.failed);
        initialHydrationRef.current = false;
      } catch (err) {
        initialHydrationRef.current = false;
        console.error("Initial block fetch error:", err);
        setNetworkStatus("reconnecting");
      }
    }

    async function reconcileBlocks(latest: number) {
      if (isReconcilingRef.current || cancelled) return;
      isReconcilingRef.current = true;
      try {
        const wanted = recoveryRef.current.plan(latest, MAX_RECONCILE_BLOCKS_PER_POLL);
        const result = await fetchBlockBatch(wanted);
        let reorgFrom: number | null = null;
        const canonicalBlocks = sortBlocksForReconciliation(result.blocks);
        for (const block of canonicalBlocks) {
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
          recoveryRef.current.record(canonicalBlocks.map((block) => block.number), result.failed);
        }
        latestKnownRef.current = Math.max(latestKnownRef.current, latest);
        if (recoveryRef.current.failedCount > 0) {
          console.warn("Block reconciliation pending", {
            contiguousCheckpoint: recoveryRef.current.checkpoint,
            failedBlocks: recoveryRef.current.failedCount,
          });
        }
      } finally {
        isReconcilingRef.current = false;
      }
    }

    async function pollNewBlocks() {
      if (isPollingRef.current) return; // skip if previous poll still in flight
      isPollingRef.current = true;
      try {
        const latest = await getLatestBlockNumber();
        if (latest !== useSceneState.getState().latestBlockNumber) {
          setLatestBlockNumber(latest);
        }
        consecutiveFailuresRef.current = 0;

        if (initialHydrationRef.current) {
          setNetworkStatus("live");
          return;
        }

        if (latest <= latestKnownRef.current && recoveryRef.current.checkpoint >= latest) {
          // No new blocks — still live
          setNetworkStatus("live");
          return;
        }

        setNetworkStatus("live");
        void reconcileBlocks(latest);
      } catch (err) {
        // Ignore intentional aborts (timeout or cleanup)
        if (err instanceof Error && err.name === "AbortError") return;
        consecutiveFailuresRef.current += 1;
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

    function scheduleNextPoll(immediate = false, previousPollDurationMs = 0) {
      if (cancelled) return;
      if (pollTimer) clearTimeout(pollTimer);
      const visible = document.visibilityState === "visible";
      const delay = immediate
        ? 0
        : blockPollDelay({
            visible,
            consecutiveFailures: consecutiveFailuresRef.current,
            elapsedMs: previousPollDurationMs,
          });
      pollTimer = setTimeout(async () => {
        // Hidden tabs use a low-frequency health probe. Returning to the page
        // triggers an immediate reconciliation via the visibility handler.
        const pollStartedAt = performance.now();
        await pollNewBlocks();
        scheduleNextPoll(false, performance.now() - pollStartedAt);
      }, delay);
    }

    function handleVisibilityChange() {
      scheduleNextPoll(document.visibilityState === "visible");
    }

    void fetchInitialBlocks().finally(() => scheduleNextPoll());

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (pollTimer) clearTimeout(pollTimer);
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
