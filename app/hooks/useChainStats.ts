"use client";
import { useEffect } from "react";
import { useSceneState } from "./useSceneState";
import { SYNC_POLL_INTERVAL } from "../lib/constants";
import { chainStatsFreshness, type ChainStatsPayload } from "../lib/chain-stats";

export function parseChainStatsResponse(data: unknown, now = Date.now()): (ChainStatsPayload & {
  status: "fresh" | "stale";
}) | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Partial<ChainStatsPayload> & { error?: unknown };
  if (
    record.error
    || (record.lastSealedBlock !== null && typeof record.lastSealedBlock !== "number")
    || (record.lastVerifiedBlock !== null && typeof record.lastVerifiedBlock !== "number")
    || (record.totalTransactions !== null && typeof record.totalTransactions !== "number")
    || (record.delivery !== "live" && record.delivery !== "last-known-good")
    || !record.source
    || !record.freshness
    || typeof record.freshness.observedAt !== "string"
    || typeof record.freshness.maxAgeSeconds !== "number"
  ) return null;
  return {
    ...record as ChainStatsPayload,
    status: record.delivery === "last-known-good"
      ? "stale"
      : chainStatsFreshness(record.freshness.observedAt, record.freshness.maxAgeSeconds, now),
  };
}

async function fetchStats(): Promise<ReturnType<typeof parseChainStatsResponse>> {
  try {
    const res = await fetch("/api/stats");
    if (!res.ok) return null;
    return parseChainStatsResponse(await res.json());
  } catch {
    return null;
  }
}

export function useChainStats() {
  const setVerifiedBlockNumber = useSceneState((s) => s.setVerifiedBlockNumber);
  const setChainStats = useSceneState((s) => s.setChainStats);

  useEffect(() => {
    async function poll() {
      if (document.visibilityState === "hidden") return;
      const stats = await fetchStats();
      if (stats) {
        setVerifiedBlockNumber(stats.lastVerifiedBlock ?? 0);
        setChainStats(
          stats.totalTransactions,
          stats.freshness.observedAt,
          stats.lastVerifiedBlock === null && stats.totalTransactions === null
            ? "unavailable"
            : stats.status,
        );
      } else {
        const current = useSceneState.getState();
        setChainStats(
          current.chainTxCount,
          current.chainStatsObservedAt,
          current.chainTxCount === null ? "unavailable" : "stale",
        );
      }
    }

    poll();
    const interval = setInterval(poll, SYNC_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [setVerifiedBlockNumber, setChainStats]);
}
