"use client";
import { useEffect } from "react";
import { useSceneState } from "./useSceneState";
import { SYNC_POLL_INTERVAL } from "../lib/constants";

async function fetchStats(): Promise<{ lastSealedBlock: number; lastVerifiedBlock: number } | null> {
  try {
    const res = await fetch("/api/stats");
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return data;
  } catch {
    return null;
  }
}

export function useChainStats() {
  const setLatestBlockNumber = useSceneState((s) => s.setLatestBlockNumber);
  const setVerifiedBlockNumber = useSceneState((s) => s.setVerifiedBlockNumber);

  useEffect(() => {
    async function poll() {
      const stats = await fetchStats();
      if (stats) {
        setLatestBlockNumber(stats.lastSealedBlock);
        setVerifiedBlockNumber(stats.lastVerifiedBlock);
      }
    }

    poll();
    const interval = setInterval(poll, SYNC_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [setLatestBlockNumber, setVerifiedBlockNumber]);
}
