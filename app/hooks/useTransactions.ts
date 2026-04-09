"use client";
import { useEffect, useRef } from "react";
import { getTransactionReceipt } from "../lib/genlayer";
import { parseReceipt } from "../lib/parsers";
import { useSceneState } from "./useSceneState";

export function useTransactions() {
  const blocks = useSceneState((s) => s.blocks);
  const updateBlockTxDetails = useSceneState((s) => s.updateBlockTxDetails);

  // fetchingRef: blocks whose transactions are currently being fetched
  // processedRef: blocks we've already attempted (prevents infinite retries when
  //   some txs legitimately return null — e.g. receipts not yet available)
  const fetchingRef = useRef<Set<number>>(new Set());
  const processedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    for (const block of blocks) {
      if (fetchingRef.current.has(block.number)) continue;
      if (processedRef.current.has(block.number)) continue;
      if (block.transactions.length === 0) {
        processedRef.current.add(block.number);
        continue;
      }

      fetchingRef.current.add(block.number);
      const blockNum = block.number;
      const hashes = [...block.transactions];

      // All txs in the block fire in parallel.
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
        })
        .catch(() => {})
        .finally(() => {
          fetchingRef.current.delete(blockNum);
          processedRef.current.add(blockNum);
        });
    }
  }, [blocks, updateBlockTxDetails]);
}
