"use client";
import { useEffect, useRef } from "react";
import { getTransactionReceipt } from "../lib/genlayer";
import { parseReceipt, extractGenLayerTxId } from "../lib/parsers";
import { useSceneState } from "./useSceneState";

// Same-origin proxy avoids the Explorer API's same-origin resource policy and
// adds shared edge caching, response limits, and an upstream deadline.
const EXPLORER_TX_URL = "/api/transactions";
const POLL_MS = 10_000;
const FETCH_LIMIT = 20;

interface ExplorerTx {
  hash: string;
  data: string;
  blockNumber: number;
  receivedAt: string;
  from: string;
  to: string | null;
}

export function useLiveFeed() {
  const addFeedTx = useSceneState((s) => s.addFeedTx);
  const seenRef = useRef<Set<string>>(new Set()); // GL TX IDs already processed
  const isRunningRef = useRef(false);
  const failuresRef = useRef(0);
  const nextPollAllowedRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.visibilityState === "hidden") return;
      if (Date.now() < nextPollAllowedRef.current) return;
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      try {
        const res = await fetch(
          `${EXPLORER_TX_URL}?limit=${FETCH_LIMIT}`,
          { signal: AbortSignal.timeout(8_000) }
        );
        if (!res.ok || cancelled) {
          if (!cancelled) {
            failuresRef.current += 1;
            nextPollAllowedRef.current = Date.now() + Math.min(60_000, POLL_MS * 2 ** failuresRef.current);
          }
          return;
        }
        failuresRef.current = 0;
        nextPollAllowedRef.current = 0;

        const json = await res.json() as { items?: ExplorerTx[] };
        const items: ExplorerTx[] = json?.items ?? [];

        // Process in parallel — skip already-seen GL TX IDs
        await Promise.all(
          items.map(async (item) => {
            if (cancelled) return;

            // Extract GenLayer TX ID from the calldata (selector 4 bytes + 32-byte arg)
            const glId = extractGenLayerTxId(item.data, item.to);
            if (!glId) return;
            if (seenRef.current.has(glId)) return;

            try {
              const raw = await getTransactionReceipt(glId);
              if (!raw || cancelled) return;
              const tx = parseReceipt(raw, glId, item.blockNumber);
              addFeedTx(tx);
              seenRef.current.add(glId);
            } catch {
              // Individual receipt failures are silent — feed keeps running
            }
          })
        );
      } catch {
        failuresRef.current += 1;
        nextPollAllowedRef.current = Date.now() + Math.min(60_000, POLL_MS * 2 ** failuresRef.current);
      } finally {
        isRunningRef.current = false;
      }
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [addFeedTx]);
}
