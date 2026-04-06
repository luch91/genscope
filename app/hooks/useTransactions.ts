"use client";
import { useEffect, useRef } from "react";
import { getTransactionAllData } from "../lib/genlayer";
import { parseReceipt } from "../lib/parsers";
import { useSceneState } from "./useSceneState";

export function useTransactions() {
  const { blocks, transactions, updateBlockTxDetails } = useSceneState();
  const fetchingRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    for (const block of blocks) {
      // Skip if already fetched or currently fetching
      if (fetchingRef.current.has(block.number)) continue;
      if (block.transactions.length === 0) continue;

      // Check if all tx details already loaded for this block
      const allLoaded = block.transactions.every(
        (hash) => transactions[hash] !== undefined
      );
      if (allLoaded && block.txDetails.length > 0) continue;

      fetchingRef.current.add(block.number);

      const blockNum = block.number;
      const hashes = block.transactions;

      Promise.all(
        hashes.map((hash) =>
          getTransactionAllData(hash)
            .then((raw) => {
              if (raw) return parseReceipt(raw, hash, blockNum);
              return null;
            })
            .catch((err) => {
              console.warn(`Failed to fetch receipt for ${hash}:`, err);
              return null;
            })
        )
      ).then((results) => {
        const valid = results.filter(Boolean) as ReturnType<typeof parseReceipt>[];
        if (valid.length > 0) {
          updateBlockTxDetails(blockNum, valid);
        }
        fetchingRef.current.delete(blockNum);
      });
    }
  }, [blocks, transactions, updateBlockTxDetails]);
}
