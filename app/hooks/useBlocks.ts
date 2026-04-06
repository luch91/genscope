"use client";
import { useEffect, useRef } from "react";
import { getBlockByNumber, getLatestBlockNumber } from "../lib/genlayer";
import { parseBlock } from "../lib/parsers";
import { useSceneState } from "./useSceneState";
import { BLOCK_POLL_INTERVAL, INITIAL_BLOCK_FETCH, OLDER_BLOCKS_FETCH } from "../lib/constants";

export function useBlocks() {
  const { addBlock, setNetworkStatus, setLatestBlockNumber } = useSceneState();
  const latestKnownRef = useRef<number>(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchInitialBlocks() {
      try {
        setNetworkStatus("live");
        const latest = await getLatestBlockNumber();
        latestKnownRef.current = latest;
        setLatestBlockNumber(latest);

        const promises: Promise<void>[] = [];
        for (let i = 0; i < INITIAL_BLOCK_FETCH; i++) {
          const blockNum = latest - i;
          if (blockNum < 0) break;
          promises.push(
            getBlockByNumber(blockNum, true).then((raw) => {
              if (!cancelled && raw) addBlock(parseBlock(raw));
            }).catch(() => {})
          );
        }
        await Promise.all(promises);
      } catch (err) {
        console.error("Initial block fetch error:", err);
        setNetworkStatus("reconnecting");
      }
    }

    async function pollNewBlocks() {
      try {
        const latest = await getLatestBlockNumber();
        setLatestBlockNumber(latest);
        if (latest <= latestKnownRef.current) return;

        setNetworkStatus("live");
        const toFetch: Promise<void>[] = [];

        for (let blockNum = latestKnownRef.current + 1; blockNum <= latest; blockNum++) {
          const num = blockNum;
          toFetch.push(
            getBlockByNumber(num, true).then((raw) => {
              if (!cancelled && raw) addBlock(parseBlock(raw));
            }).catch(() => {})
          );
        }

        await Promise.all(toFetch);
        latestKnownRef.current = latest;
      } catch (err) {
        console.error("Block poll error:", err);
        setNetworkStatus("reconnecting");
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
  const { blocks, addBlock, setLoadingOlder } = useSceneState.getState();
  if (blocks.length === 0) return;

  const oldestNumber = Math.min(...blocks.map((b) => b.number));
  if (oldestNumber <= 1) return;

  setLoadingOlder(true);
  try {
    const promises: Promise<void>[] = [];
    for (let i = 1; i <= OLDER_BLOCKS_FETCH; i++) {
      const blockNum = oldestNumber - i;
      if (blockNum < 0) break;
      promises.push(
        getBlockByNumber(blockNum, true)
          .then((raw) => { if (raw) addBlock(parseBlock(raw)); })
          .catch(() => {})
      );
    }
    await Promise.all(promises);
  } finally {
    setLoadingOlder(false);
  }
}

/**
 * Fetch a single block by number and add to store.
 * Returns the block number if found, null if not.
 */
export async function fetchAndAddBlock(blockNumber: number): Promise<number | null> {
  try {
    const raw = await getBlockByNumber(blockNumber, true);
    if (!raw) return null;
    const block = parseBlock(raw);
    useSceneState.getState().addBlock(block);
    return block.number;
  } catch {
    return null;
  }
}
