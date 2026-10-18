"use client";
import { useEffect, useRef } from "react";
import { getTransactionReceipt } from "../lib/genlayer";
import { parseReceipt, extractGenLayerTxId } from "../lib/parsers";
import { useSceneState } from "./useSceneState";

// Legacy, currently unmounted pathway. DataOrchestrator obtains the active
// feed through useTransactions. Remove this hook and /api/transactions in a
// separate maintenance PR after confirming no external API consumers remain.
// Same-origin proxy avoids the Explorer API's same-origin resource policy and
// adds shared edge caching, response limits, and an upstream deadline.
const EXPLORER_TX_URL = "/api/transactions";
const POLL_MS = 10_000;
const FETCH_LIMIT = 20;
const MAX_BACKFILL_PAGES = 5;
const RECEIPT_CONCURRENCY = 5;
const MAX_SEEN = 1_000;

export interface ExplorerTx {
  hash: string;
  data: string;
  blockNumber: number;
  receivedAt: string;
  from: string;
  to: string | null;
}

export async function collectFeedBackfill(
  fetchPage: (page: number) => Promise<ExplorerTx[]>,
  previousWatermark: string | null,
  maxPages = MAX_BACKFILL_PAGES,
): Promise<{ items: ExplorerTx[]; newestHash: string | null; watermarkFound: boolean }> {
  const items: ExplorerTx[] = [];
  let watermarkFound = previousWatermark === null;
  let newestHash: string | null = null;

  for (let page = 1; page <= maxPages; page++) {
    const pageItems = await fetchPage(page);
    if (page === 1) newestHash = pageItems[0]?.hash ?? null;
    const watermarkIndex = previousWatermark
      ? pageItems.findIndex((item) => item.hash === previousWatermark)
      : -1;
    if (watermarkIndex >= 0) {
      items.push(...pageItems.slice(0, watermarkIndex));
      watermarkFound = true;
      break;
    }
    items.push(...pageItems);
    if (pageItems.length < FETCH_LIMIT || previousWatermark === null) break;
  }

  return { items, newestHash, watermarkFound };
}

export function useLiveFeed() {
  const addFeedTx = useSceneState((s) => s.addFeedTx);
  const seenRef = useRef<Set<string>>(new Set()); // GL TX IDs already processed
  const seenOrderRef = useRef<string[]>([]);
  const watermarkRef = useRef<string | null>(null); // newest verified Explorer ETH hash
  const pendingItemsRef = useRef<Map<string, ExplorerTx>>(new Map());
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
        const previousWatermark = watermarkRef.current;
        const backfill = await collectFeedBackfill(async (page) => {
          const res = await fetch(
            `${EXPLORER_TX_URL}?limit=${FETCH_LIMIT}&page=${page}`,
            { signal: AbortSignal.timeout(8_000) },
          );
          if (!res.ok) throw new Error(`Transaction feed HTTP ${res.status}`);
          const json = await res.json() as { items?: ExplorerTx[] };
          return json.items ?? [];
        }, previousWatermark);
        if (cancelled) return;
        if (previousWatermark && !backfill.watermarkFound) {
          console.warn("Live-feed backfill exceeded bounded window", {
            previousWatermark,
            pagesChecked: MAX_BACKFILL_PAGES,
          });
        }
        if (backfill.newestHash) watermarkRef.current = backfill.newestHash;
        failuresRef.current = 0;
        nextPollAllowedRef.current = 0;

        for (const item of backfill.items) pendingItemsRef.current.set(item.hash, item);
        // Process oldest first with bounded receipt concurrency. Items remain in
        // this recovery map until a receipt is available, including across polls.
        const items = [...pendingItemsRef.current.values()].reverse();
        let cursor = 0;
        async function worker() {
          while (cursor < items.length) {
            const item = items[cursor++];
            if (cancelled) return;

            // Extract GenLayer TX ID from the calldata (selector 4 bytes + 32-byte arg)
            const glId = extractGenLayerTxId(item.data, item.to);
            if (!glId) {
              pendingItemsRef.current.delete(item.hash);
              continue;
            }
            if (seenRef.current.has(glId)) {
              pendingItemsRef.current.delete(item.hash);
              continue;
            }

            try {
              const raw = await getTransactionReceipt(glId);
              if (!raw || cancelled) return;
              const tx = parseReceipt(raw, glId, item.blockNumber);
              addFeedTx(tx);
              pendingItemsRef.current.delete(item.hash);
              seenRef.current.add(glId);
              seenOrderRef.current.push(glId);
              while (seenOrderRef.current.length > MAX_SEEN) {
                const expired = seenOrderRef.current.shift();
                if (expired) seenRef.current.delete(expired);
              }
            } catch {
              // Individual receipt failures are silent — feed keeps running
            }
          }
        }
        await Promise.all(Array.from(
          { length: Math.min(RECEIPT_CONCURRENCY, items.length) },
          () => worker(),
        ));
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
