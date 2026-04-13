"use client";
import { useBlocks } from "../hooks/useBlocks";
import { useTransactions } from "../hooks/useTransactions";
import { useSyncStatus } from "../hooks/useSyncStatus";
import { useChainStats } from "../hooks/useChainStats";
import { useLiveFeed } from "../hooks/useLiveFeed";

/**
 * Mounts all data-fetching hooks once at app root level.
 * Renders nothing — purely side-effect-driven.
 */
export default function DataOrchestrator() {
  useBlocks();
  useTransactions();
  useSyncStatus();
  useChainStats();
  useLiveFeed();
  return null;
}
