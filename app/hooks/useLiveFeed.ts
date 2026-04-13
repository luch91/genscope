"use client";
import { useEffect, useRef } from "react";
import { getTransactionReceipt } from "../lib/genlayer";
import { parseReceipt, extractGenLayerTxId } from "../lib/parsers";
import { useSceneState } from "./useSceneState";

// Direct call — explorer API has open CORS (access-control-allow-origin: *)
const EXPLORER_TX_URL = "https://explorer-api.testnet-chain.genlayer.com/transactions";
const POLL_MS = 2500;
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

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      try {
        const res = await fetch(
          `${EXPLORER_TX_URL}?limit=${FETCH_LIMIT}`,
          { signal: AbortSignal.timeout(8_000) }
        );
        if (!res.ok || cancelled) return;

        const json = await res.json();
        const items: ExplorerTx[] = json?.items ?? [];

        // Process in parallel — skip already-seen GL TX IDs
        await Promise.all(
          items.map(async (item) => {
            if (cancelled) return;

            // Extract GenLayer TX ID from the calldata (selector 4 bytes + 32-byte arg)
            const glId = extractGenLayerTxId(item.data);
            if (!glId) return;
            if (seenRef.current.has(glId)) return;
            seenRef.current.add(glId);

            try {
              const raw = await getTransactionReceipt(glId);
              if (!raw || cancelled) return;
              const tx = parseReceipt(raw, glId, item.blockNumber);
              addFeedTx(tx);
            } catch {
              // Individual receipt failures are silent — feed keeps running
            }
          })
        );
      } catch {
        // Poll failure is silent — will retry next interval
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
