"use client";
import { useEffect } from "react";
import { useSceneState } from "./useSceneState";
import { SYNC_POLL_INTERVAL } from "../lib/constants";

async function fetchStats(): Promise<{
  lastSealedBlock: number;
  lastVerifiedBlock: number;
  totalTransactions: number;
} | null> {
  try {
    const res = await fetch("/api/stats");
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    if (data.error) return null;
    if (
      typeof data.lastSealedBlock !== "number"
      || typeof data.lastVerifiedBlock !== "number"
      || typeof data.totalTransactions !== "number"
    ) return null;
    return {
      lastSealedBlock: data.lastSealedBlock,
      lastVerifiedBlock: data.lastVerifiedBlock,
      totalTransactions: data.totalTransactions,
    };
  } catch {
    return null;
  }
}

export function useChainStats() {
  const setVerifiedBlockNumber = useSceneState((s) => s.setVerifiedBlockNumber);
  const setChainTxCount = useSceneState((s) => s.setChainTxCount);

  useEffect(() => {
    async function poll() {
      if (document.visibilityState === "hidden") return;
      const stats = await fetchStats();
      if (stats) {
        setVerifiedBlockNumber(stats.lastVerifiedBlock);
        setChainTxCount(stats.totalTransactions);
      }
    }

    poll();
    const interval = setInterval(poll, SYNC_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [setVerifiedBlockNumber, setChainTxCount]);
}
