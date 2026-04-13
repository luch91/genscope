"use client";
import { useEffect } from "react";
import { getSyncStatus } from "../lib/genlayer";
import { useSceneState } from "./useSceneState";
import { SYNC_POLL_INTERVAL } from "../lib/constants";

export function useSyncStatus() {
  const { setSyncStatus, setNetworkStatus } = useSceneState();

  useEffect(() => {
    async function checkSync() {
      try {
        const result = await getSyncStatus();
        if (result === false) {
          // Node confirmed fully synced
          setSyncStatus({ blocksBehind: 0, synced: true });
          setNetworkStatus("live");
        } else if (result && typeof result === "object") {
          const behind = result.blocksBehind ?? 0;
          setSyncStatus({ blocksBehind: behind, synced: behind <= 10 });
          // On Bradbury, gen_syncing regularly returns blocksBehind 1–5 as
          // normal GenLayer consensus lag — only flag SYNCING for large gaps.
          setNetworkStatus(behind > 10 ? "syncing" : "live");
        }
      } catch {
        // gen_syncing unavailable — don't flip to reconnecting,
        // that is useBlocks' responsibility based on eth_blockNumber failures
      }
    }

    checkSync();
    const interval = setInterval(checkSync, SYNC_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [setSyncStatus, setNetworkStatus]);
}
