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
          setSyncStatus({ blocksBehind: 0, synced: true });
          setNetworkStatus("live");
        } else if (result && typeof result === "object") {
          // Bradbury returns { syncedBlock, latestBlock, blocksBehind }
          const behind = result.blocksBehind ?? 0;
          setSyncStatus({ blocksBehind: behind, synced: behind === 0 });
          setNetworkStatus(behind > 0 ? "syncing" : "live");
        }
      } catch (err) {
        console.warn("Sync status check failed:", err);
      }
    }

    checkSync();
    const interval = setInterval(checkSync, SYNC_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [setSyncStatus, setNetworkStatus]);
}
