"use client";
import { useEffect, useRef, useState } from "react";
import { getTransactionReceipt } from "../lib/genlayer";
import { parseReceipt } from "../lib/parsers";
import { useSceneState } from "./useSceneState";

export function useTransactions() {
  const blocks = useSceneState((s) => s.blocks);
  const blockCache = useSceneState((s) => s.blockCache);
  const incompleteReceipts = useSceneState((s) => s.incompleteReceipts);
  const updateBlockTxDetails = useSceneState((s) => s.updateBlockTxDetails);
  const setIncompleteReceipts = useSceneState((s) => s.setIncompleteReceipts);
  const clearIncompleteReceipts = useSceneState((s) => s.clearIncompleteReceipts);

  // fetchingRef: blocks whose transactions are currently being fetched
  // processedRef: blocks we've already attempted (prevents infinite retries when
  //   some txs legitimately return null — e.g. receipts not yet available)
  const fetchingRef = useRef<Set<number>>(new Set());
  const processedRef = useRef<Set<number>>(new Set());
  const attemptsRef = useRef<Map<number, number>>(new Map());
  const retryTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [, triggerRetry] = useState(0);

  useEffect(() => {
    const candidates = new Map(blocks.map((block) => [block.number, block]));
    for (const blockNumber of Object.keys(incompleteReceipts).map(Number)) {
      const cached = blockCache[blockNumber];
      if (cached) candidates.set(blockNumber, cached);
    }

    for (const block of candidates.values()) {
      if (fetchingRef.current.has(block.number)) continue;
      if (processedRef.current.has(block.number)) continue;
      if (block.transactions.length === 0) {
        processedRef.current.add(block.number);
        continue;
      }

      fetchingRef.current.add(block.number);
      const blockNum = block.number;
      const alreadyResolved = new Set(block.txDetails.map((tx) => tx.hash));
      const hashes = (incompleteReceipts[block.number] ?? block.transactions)
        .filter((hash) => !alreadyResolved.has(hash));
      if (hashes.length === 0) {
        processedRef.current.add(block.number);
        clearIncompleteReceipts(block.number);
        continue;
      }

      // All txs in the block fire in parallel. Receipts can lag behind their
      // block, so incomplete batches are retried with bounded backoff.
      // gen_getTransactionReceipt returns the full receipt (consensus data included)
      // in a single RPC call — no secondary calls needed.
      Promise.all(
        hashes.map((hash) =>
          getTransactionReceipt(hash)
            .then((raw) => (raw ? parseReceipt(raw, hash, blockNum) : null))
            .catch(() => null)
        )
      )
        .then((results) => {
          const valid = results.filter((r): r is NonNullable<typeof r> => r !== null);
          if (valid.length > 0) {
            updateBlockTxDetails(blockNum, valid);
          }
          const resolved = new Set(valid.map((tx) => tx.hash));
          const missing = hashes.filter((hash) => !resolved.has(hash));
          if (missing.length === 0) {
            processedRef.current.add(blockNum);
            attemptsRef.current.delete(blockNum);
            clearIncompleteReceipts(blockNum);
            return;
          }

          setIncompleteReceipts(blockNum, missing);

          const attempts = (attemptsRef.current.get(blockNum) ?? 0) + 1;
          attemptsRef.current.set(blockNum, attempts);
          if (attempts >= 5) {
            attemptsRef.current.set(blockNum, 0);
            console.warn("Receipt fetch exhausted retry budget", {
              blockNumber: blockNum,
              missingReceipts: missing.length,
              recoveryDelayMs: 60_000,
            });
          }

          const delay = attempts >= 5 ? 60_000 : Math.min(30_000, 2_000 * 2 ** (attempts - 1));
          const timer = setTimeout(() => {
            retryTimersRef.current.delete(blockNum);
            triggerRetry((value) => value + 1);
          }, delay);
          retryTimersRef.current.set(blockNum, timer);
        })
        .catch(() => {})
        .finally(() => {
          fetchingRef.current.delete(blockNum);
        });
    }

    return () => {
      // Timers are intentionally retained between block-list updates; they are
      // cleared only when the hook unmounts by the dedicated cleanup below.
    };
  }, [blocks, blockCache, incompleteReceipts, updateBlockTxDetails, setIncompleteReceipts, clearIncompleteReceipts]);

  useEffect(() => () => {
    for (const timer of retryTimersRef.current.values()) clearTimeout(timer);
    retryTimersRef.current.clear();
  }, []);
}
