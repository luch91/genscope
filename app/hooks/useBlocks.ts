"use client";
import { useEffect, useRef } from "react";
import { getBlockByNumber, getLatestBlockNumber } from "../lib/genlayer";
import { parseBlock } from "../lib/parsers";
import { useSceneState } from "./useSceneState";
import { BLOCK_POLL_INTERVAL, INITIAL_BLOCK_FETCH, OLDER_BLOCKS_FETCH } from "../lib/constants";

const BLOCK_FETCH_CONCURRENCY = 5;
const MAX_RECONCILE_BLOCKS_PER_POLL = 50;

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
  const contiguousCheckpointRef = useRef<number>(0);
  const fetchedNumbersRef = useRef<Set<number>>(new Set());
  const failedBlocksRef = useRef<Set<number>>(new Set());
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
        contiguousCheckpointRef.current = floor - 1;
        const result = await fetchBlockBatch(blockNumbers);
        for (const block of result.blocks) {
          fetchedNumbersRef.current.add(block.number);
          if (!cancelled) addBlock(block);
        }
        for (const blockNumber of result.failed) failedBlocksRef.current.add(blockNumber);
        while (fetchedNumbersRef.current.has(contiguousCheckpointRef.current + 1)) {
          contiguousCheckpointRef.current += 1;
          failedBlocksRef.current.delete(contiguousCheckpointRef.current);
        }
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

        if (latest <= latestKnownRef.current && failedBlocksRef.current.size === 0) {
          // No new blocks — still live
          setNetworkStatus("live");
          return;
        }

        setNetworkStatus("live");
        const wanted = new Set<number>(failedBlocksRef.current);
        for (let blockNum = contiguousCheckpointRef.current + 1; blockNum <= latest; blockNum++) {
          if (!fetchedNumbersRef.current.has(blockNum)) wanted.add(blockNum);
          if (wanted.size >= MAX_RECONCILE_BLOCKS_PER_POLL) break;
        }
        const result = await fetchBlockBatch([...wanted].sort((a, b) => a - b));
        for (const block of result.blocks) {
          const predecessor = useSceneState.getState().blockCache[block.number - 1];
          if (predecessor && block.parentHash !== predecessor.hash) {
            const reconcileFrom = Math.max(0, block.number - 6);
            for (let height = reconcileFrom; height <= block.number; height++) {
              fetchedNumbersRef.current.delete(height);
              failedBlocksRef.current.add(height);
            }
            contiguousCheckpointRef.current = Math.min(
              contiguousCheckpointRef.current,
              reconcileFrom - 1,
            );
          }
          fetchedNumbersRef.current.add(block.number);
          failedBlocksRef.current.delete(block.number);
          if (!cancelled) addBlock(block);
        }
        for (const blockNumber of result.failed) failedBlocksRef.current.add(blockNumber);
        while (fetchedNumbersRef.current.has(contiguousCheckpointRef.current + 1)) {
          contiguousCheckpointRef.current += 1;
          failedBlocksRef.current.delete(contiguousCheckpointRef.current);
        }
        latestKnownRef.current = Math.max(latestKnownRef.current, latest);
        if (failedBlocksRef.current.size > 0) {
          console.warn("Block reconciliation pending", {
            contiguousCheckpoint: contiguousCheckpointRef.current,
            failedBlocks: failedBlocksRef.current.size,
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
