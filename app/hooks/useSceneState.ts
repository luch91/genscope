"use client";
import { create } from "zustand";
import type { AppState, Block, GenLayerTransaction, NetworkStatus, SyncStatus } from "../types";
import { MAX_VISIBLE_BLOCKS } from "../lib/constants";

export const useSceneState = create<AppState>((set) => ({
  blocks: [],
  transactions: {},
  selectedBlockNumber: null,
  selectedTxHash: null,
  syncStatus: { blocksBehind: 0, synced: true },
  networkStatus: "live",
  totalTxCount: 0,
  intelligentTxCount: 0,
  activeValidators: new Set<string>(),
  latestBlockNumber: 0,
  verifiedBlockNumber: 0,
  loadingOlder: false,

  addBlock: (block: Block) => {
    set((state) => {
      if (state.blocks.find((b) => b.number === block.number)) return state;
      const newBlocks = [block, ...state.blocks]
        .sort((a, b) => b.number - a.number)
        .slice(0, MAX_VISIBLE_BLOCKS);
      return { blocks: newBlocks };
    });
  },

  setBlocks: (blocks: Block[]) => {
    const sorted = [...blocks].sort((a, b) => b.number - a.number).slice(0, MAX_VISIBLE_BLOCKS);
    set({ blocks: sorted });
  },

  addTransaction: (tx: GenLayerTransaction) => {
    set((state) => {
      if (state.transactions[tx.hash]) return state;
      const newTxs = { ...state.transactions, [tx.hash]: tx };
      const allTxs = Object.values(newTxs);
      const intelligentCount = allTxs.filter((t) => t.isIntelligent).length;
      const newValidators = new Set(state.activeValidators);
      tx.consumedValidators?.forEach((v) => newValidators.add(v));
      tx.roundData?.forEach((r) => r.roundValidators?.forEach((v) => newValidators.add(v)));
      return {
        transactions: newTxs,
        totalTxCount: allTxs.length,
        intelligentTxCount: intelligentCount,
        activeValidators: newValidators,
      };
    });
  },

  setSelectedBlock: (num: number | null) => {
    set({ selectedBlockNumber: num, selectedTxHash: null });
  },

  setSelectedTx: (hash: string | null) => {
    set({ selectedTxHash: hash });
  },

  setSyncStatus: (status: SyncStatus) => {
    set({ syncStatus: status });
  },

  setNetworkStatus: (status: NetworkStatus) => {
    set({ networkStatus: status });
  },

  setLatestBlockNumber: (n: number) => {
    set({ latestBlockNumber: n });
  },

  setVerifiedBlockNumber: (n: number) => {
    set({ verifiedBlockNumber: n });
  },

  setLoadingOlder: (loading: boolean) => {
    set({ loadingOlder: loading });
  },

  updateBlockTxDetails: (blockNumber: number, txs: GenLayerTransaction[]) => {
    set((state) => {
      // Deduplicate by hash (last write wins for metadata, keeps order stable)
      const txMap = new Map<string, GenLayerTransaction>();
      txs.forEach((tx) => txMap.set(tx.hash, tx));
      const dedupedTxs = Array.from(txMap.values());

      const newTxMap = { ...state.transactions };
      dedupedTxs.forEach((tx) => { newTxMap[tx.hash] = tx; });

      const hasIntelligent = dedupedTxs.some((t) => t.isIntelligent);
      const hasStandard = dedupedTxs.some((t) => !t.isIntelligent);

      const newBlocks = state.blocks.map((b) =>
        b.number === blockNumber
          ? { ...b, txDetails: dedupedTxs, hasIntelligent, hasStandard }
          : b
      );

      const allTxs = Object.values(newTxMap);
      const intelligentCount = allTxs.filter((t) => t.isIntelligent).length;

      const newValidators = new Set(state.activeValidators);
      dedupedTxs.forEach((tx) => {
        tx.consumedValidators?.forEach((v) => newValidators.add(v));
        tx.roundData?.forEach((r) => r.roundValidators?.forEach((v) => newValidators.add(v)));
      });

      return {
        blocks: newBlocks,
        transactions: newTxMap,
        totalTxCount: allTxs.length,
        intelligentTxCount: intelligentCount,
        activeValidators: newValidators,
      };
    });
  },
}));
