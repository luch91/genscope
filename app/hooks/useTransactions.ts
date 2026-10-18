"use client";
import { useEffect, useRef, useState } from "react";
import { getBlockByNumber, getTransactionReceiptResult } from "../lib/genlayer";
import {
  isTerminalTransactionStatus,
  isValidatorWalletForTransaction,
  parseBlock,
  parseReceipt,
} from "../lib/parsers";
import { useSceneState } from "./useSceneState";

export function receiptProcessingKey(block: { number: number; hash: string }): string {
  return `${block.number}:${block.hash.toLowerCase()}`;
}

export function receiptRetryDelay(attempts: number, visible = true): number {
  if (!visible) return 15_000;
  if (attempts >= 5) return 60_000;
  return Math.min(15_000, 1_000 * 2 ** Math.max(0, attempts - 1));
}

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
  const fetchingRef = useRef<Set<string>>(new Set());
  const processedRef = useRef<Set<string>>(new Set());
  const attemptsRef = useRef<Map<string, number>>(new Map());
  const retryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [, triggerRetry] = useState(0);
  const recoveryHydratedRef = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("genscope.incompleteReceipts.v1");
    try {
      if (!stored) return;
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        const blockNumber = Number(key);
        const hashes = Array.isArray(value)
          ? value.filter((item): item is string => typeof item === "string")
          : [];
        if (!Number.isSafeInteger(blockNumber) || hashes.length === 0) continue;
        setIncompleteReceipts(blockNumber, hashes);
        if (!useSceneState.getState().blockCache[blockNumber]) {
          void getBlockByNumber(blockNumber, true).then((raw) => {
            if (raw) useSceneState.getState().addBlock(parseBlock(raw));
          }).catch(() => undefined);
        }
      }
    } catch {
      window.localStorage.removeItem("genscope.incompleteReceipts.v1");
    } finally {
      queueMicrotask(() => {
        recoveryHydratedRef.current = true;
        triggerRetry((value) => value + 1);
      });
    }
  }, [setIncompleteReceipts]);

  useEffect(() => {
    if (!recoveryHydratedRef.current) return;
    if (Object.keys(incompleteReceipts).length === 0) {
      window.localStorage.removeItem("genscope.incompleteReceipts.v1");
    } else {
      window.localStorage.setItem(
        "genscope.incompleteReceipts.v1",
        JSON.stringify(incompleteReceipts),
      );
    }
  }, [incompleteReceipts]);

  useEffect(() => {
    const activeKeys = new Set(Object.values(blockCache).map(receiptProcessingKey));
    for (const key of processedRef.current) {
      if (!activeKeys.has(key)) processedRef.current.delete(key);
    }
    for (const key of attemptsRef.current.keys()) {
      if (!activeKeys.has(key)) attemptsRef.current.delete(key);
    }
    for (const [key, timer] of retryTimersRef.current) {
      if (!activeKeys.has(key)) {
        clearTimeout(timer);
        retryTimersRef.current.delete(key);
      }
    }

    const candidates = new Map(blocks.map((block) => [block.number, block]));
    for (const blockNumber of Object.keys(incompleteReceipts).map(Number)) {
      const cached = blockCache[blockNumber];
      if (cached) candidates.set(blockNumber, cached);
    }

    for (const block of candidates.values()) {
      const processingKey = receiptProcessingKey(block);
      if (fetchingRef.current.has(processingKey)) continue;
      if (processedRef.current.has(processingKey)) continue;
      if (block.transactions.length === 0) {
        processedRef.current.add(processingKey);
        continue;
      }

      fetchingRef.current.add(processingKey);
      const blockNum = block.number;
      const blockHash = block.hash;
      const existing = new Map(block.txDetails.map((tx) => [tx.hash, tx]));
      const persistedHashes = (incompleteReceipts[block.number] ?? [])
        .filter((hash) => block.transactions.includes(hash));
      const hashes = (persistedHashes.length > 0 ? persistedHashes : block.transactions)
        .filter((hash) => {
          const transaction = existing.get(hash);
          return !transaction || !isTerminalTransactionStatus(transaction.status);
        });
      if (hashes.length === 0) {
        processedRef.current.add(processingKey);
        fetchingRef.current.delete(processingKey);
        clearIncompleteReceipts(block.number);
        continue;
      }

      // All txs in the block fire in parallel. Receipts can lag behind their
      // block, so incomplete batches are retried with bounded backoff.
      // gen_getTransactionReceipt returns the full receipt (consensus data included)
      // in a single RPC call — no secondary calls needed.
      Promise.all(
        hashes.map((hash) =>
          getTransactionReceiptResult(hash).then((outcome) => ({ hash, outcome }))
        )
      )
        .then((results) => {
          if (useSceneState.getState().blockCache[blockNum]?.hash !== blockHash) return;

          const rejectedCandidates = new Set<string>();
          const valid = results.flatMap(({ hash, outcome }) => {
            if (outcome.kind !== "available") return [];
            const transaction = parseReceipt(outcome.receipt, hash, blockNum);
            const context = block.transactionContexts?.[hash];
            if (context?.kind === "validator-wallet" &&
                !context.destinations.some((destination) =>
                  isValidatorWalletForTransaction(destination, transaction),
                )) {
              rejectedCandidates.add(hash);
              console.warn("Rejected inconclusive ValidatorWallet lifecycle candidate", {
                blockNumber: blockNum,
                transactionId: hash,
              });
              return [];
            }
            return [transaction];
          });
          if (valid.length > 0) {
            updateBlockTxDetails(blockNum, blockHash, valid, true);
          }
          const resolved = new Set([
            ...valid
              .filter((tx) => isTerminalTransactionStatus(tx.status))
              .map((tx) => tx.hash),
            ...rejectedCandidates,
            // A definitive zero/not-found response is not a temporary RPC
            // failure. Provisional calldata candidates without a GenLayer
            // receipt are ignored rather than polled forever.
            ...results.flatMap(({ hash, outcome }) => outcome.kind === "not_found" ? [hash] : []),
          ]);
          const missing = hashes.filter((hash) => !resolved.has(hash));
          if (missing.length === 0) {
            processedRef.current.add(processingKey);
            attemptsRef.current.delete(processingKey);
            clearIncompleteReceipts(blockNum);
            return;
          }

          setIncompleteReceipts(blockNum, missing);

          const outcomeCounts = results.reduce<Record<string, number>>((counts, result) => {
            counts[result.outcome.kind] = (counts[result.outcome.kind] ?? 0) + 1;
            return counts;
          }, {});

          const attempts = (attemptsRef.current.get(processingKey) ?? 0) + 1;
          attemptsRef.current.set(processingKey, attempts);
          if (attempts >= 5) {
            attemptsRef.current.set(processingKey, 0);
            console.warn("Receipt fetch exhausted retry budget", {
              blockNumber: blockNum,
              missingReceipts: missing.length,
              recoveryDelayMs: 60_000,
              outcomes: outcomeCounts,
            });
          }

          const delay = receiptRetryDelay(
            attempts,
            document.visibilityState === "visible",
          );
          const timer = setTimeout(() => {
            retryTimersRef.current.delete(processingKey);
            if (useSceneState.getState().blockCache[blockNum]?.hash === blockHash) {
              triggerRetry((value) => value + 1);
            }
          }, delay);
          retryTimersRef.current.set(processingKey, timer);
        })
        .catch(() => {})
        .finally(() => {
          fetchingRef.current.delete(processingKey);
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

  useEffect(() => {
    function refreshOnVisibility() {
      if (document.visibilityState === "visible") {
        triggerRetry((value) => value + 1);
      }
    }
    document.addEventListener("visibilitychange", refreshOnVisibility);
    return () => document.removeEventListener("visibilitychange", refreshOnVisibility);
  }, []);
}
