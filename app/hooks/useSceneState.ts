"use client";
import { create } from "zustand";
import type { AppState, Block, GenLayerTransaction, NetworkStatus, SyncStatus } from "../types";
import { MAX_VISIBLE_BLOCKS } from "../lib/constants";

export const MAX_CACHED_BLOCKS = 500;
export const MAX_CACHED_TRANSACTIONS = 2_000;
export const MAX_CACHED_VALIDATORS = 1_000;
export const MAX_INCOMPLETE_BLOCKS = 200;

function pruneBlockCache(
  cache: Record<number, Block>,
  protectedNumbers: Set<number>,
): Record<number, Block> {
  const entries = Object.values(cache);
  if (entries.length <= MAX_CACHED_BLOCKS) return cache;
  const keep = entries
    .sort((a, b) => b.addedAt - a.addedAt)
    .filter((block, index) => index < MAX_CACHED_BLOCKS || protectedNumbers.has(block.number));
  return Object.fromEntries(keep.map((block) => [block.number, block]));
}

function pruneTransactions(
  transactions: Record<string, GenLayerTransaction>,
  protectedHashes: Set<string>,
): Record<string, GenLayerTransaction> {
  const entries = Object.entries(transactions);
  if (entries.length <= MAX_CACHED_TRANSACTIONS) return transactions;
  entries.sort(([, a], [, b]) => (b.blockNumber ?? 0) - (a.blockNumber ?? 0));
  return Object.fromEntries(entries.filter(
    ([hash], index) => index < MAX_CACHED_TRANSACTIONS || protectedHashes.has(hash),
  ));
}

function validatorsFromTransactions(transactions: Record<string, GenLayerTransaction>): Set<string> {
  const validators = new Set<string>();
  for (const tx of Object.values(transactions)) {
    for (const validator of tx.consumedValidators ?? []) {
      if (validators.size >= MAX_CACHED_VALIDATORS) return validators;
      validators.add(validator);
    }
    for (const round of tx.roundData ?? []) {
      for (const validator of round.roundValidators ?? []) {
        if (validators.size >= MAX_CACHED_VALIDATORS) return validators;
        validators.add(validator);
      }
    }
  }
  return validators;
}

export const useSceneState = create<AppState>((set) => ({
  blocks: [],
  blockCache: {},
  transactions: {},
  feedTxs: [],
  selectedBlockNumber: null,
  selectedTxHash: null,
  syncStatus: { blocksBehind: 0, synced: true },
  networkStatus: "live",
  totalTxCount: 0,
  intelligentTxCount: 0,
  activeValidators: new Set<string>(),
  latestBlockNumber: 0,
  verifiedBlockNumber: 0,
  chainTxCount: 0,
  loadingOlder: false,
  incompleteReceipts: {},

  addFeedTx: (tx: GenLayerTransaction) => {
    set((state) => {
      // Deduplicate by hash; newest first; cap at 80 entries
      if (state.feedTxs.some((t) => t.hash === tx.hash)) return state;
      // Also keep in shared transactions map so TransactionPanel can find it
      const newTxMap = state.transactions[tx.hash]
        ? state.transactions
        : pruneTransactions(
            { ...state.transactions, [tx.hash]: tx },
            new Set([tx.hash, ...state.feedTxs.map((item) => item.hash), ...(state.selectedTxHash ? [state.selectedTxHash] : [])]),
          );
      return {
        feedTxs: [tx, ...state.feedTxs].slice(0, 80),
        transactions: newTxMap,
      };
    });
  },

  addBlock: (block: Block) => {
    set((state) => {
      const blockCache = pruneBlockCache(
        { ...state.blockCache, [block.number]: block },
        new Set([...state.blocks.map((item) => item.number), block.number, ...(state.selectedBlockNumber === null ? [] : [state.selectedBlockNumber])]),
      );
      if (state.blocks.find((b) => b.number === block.number)) {
        return {
          blockCache,
          blocks: state.blocks.map((existing) =>
            existing.number === block.number ? block : existing,
          ),
        };
      }
      const newBlocks = [block, ...state.blocks]
        .sort((a, b) => b.number - a.number)
        .slice(0, MAX_VISIBLE_BLOCKS);
      return { blocks: newBlocks, blockCache };
    });
  },

  addOlderBlocks: (olderBlocks: Block[]) => {
    set((state) => {
      const blockCache = { ...state.blockCache };
      for (const block of olderBlocks) blockCache[block.number] = block;

      // Shift the rendered window backwards while retaining all fetched blocks
      // in blockCache for search and forward navigation.
      const combined = [...state.blocks, ...olderBlocks];
      const unique = Array.from(
        new Map(combined.map((block) => [block.number, block])).values(),
      ).sort((a, b) => b.number - a.number);
      return {
        blocks: unique.slice(Math.max(0, unique.length - MAX_VISIBLE_BLOCKS)),
        blockCache: pruneBlockCache(
          blockCache,
          new Set([...unique.slice(-MAX_VISIBLE_BLOCKS).map((item) => item.number), ...(state.selectedBlockNumber === null ? [] : [state.selectedBlockNumber])]),
        ),
      };
    });
  },

  setBlocks: (blocks: Block[]) => {
    const sorted = [...blocks].sort((a, b) => b.number - a.number).slice(0, MAX_VISIBLE_BLOCKS);
    set((state) => ({
      blocks: sorted,
      blockCache: pruneBlockCache(
        { ...state.blockCache, ...Object.fromEntries(blocks.map((block) => [block.number, block])) },
        new Set([...sorted.map((block) => block.number), ...(state.selectedBlockNumber === null ? [] : [state.selectedBlockNumber])]),
      ),
    }));
  },

  addTransaction: (tx: GenLayerTransaction) => {
    set((state) => {
      if (state.transactions[tx.hash]) return state;
      const newTxs = pruneTransactions(
        { ...state.transactions, [tx.hash]: tx },
        new Set([tx.hash, ...state.feedTxs.map((item) => item.hash), ...(state.selectedTxHash ? [state.selectedTxHash] : [])]),
      );
      const allTxs = Object.values(newTxs);
      const intelligentCount = allTxs.filter((t) => t.isIntelligent).length;
      return {
        transactions: newTxs,
        totalTxCount: allTxs.length,
        intelligentTxCount: intelligentCount,
        activeValidators: validatorsFromTransactions(newTxs),
      };
    });
  },

  setSelectedBlock: (num: number | null) => {
    set((state) => {
      const cached = num === null ? undefined : state.blockCache[num];
      const alreadyVisible = num === null || state.blocks.some((block) => block.number === num);
      const blocks = cached && !alreadyVisible
        ? [cached, ...state.blocks.filter((block) => block.number !== cached.number)]
            .slice(0, MAX_VISIBLE_BLOCKS)
        : state.blocks;
      return { selectedBlockNumber: num, selectedTxHash: null, blocks };
    });
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

  setChainTxCount: (n: number) => {
    set({ chainTxCount: n });
  },

  setLoadingOlder: (loading: boolean) => {
    set({ loadingOlder: loading });
  },

  updateBlockTxDetails: (blockNumber: number, txs: GenLayerTransaction[]) => {
    set((state) => {
      // Deduplicate by hash (last write wins for metadata, keeps order stable)
      const txMap = new Map<string, GenLayerTransaction>();
      const cachedBlock = state.blockCache[blockNumber];
      cachedBlock?.txDetails.forEach((tx) => txMap.set(tx.hash, tx));
      txs.forEach((tx) => txMap.set(tx.hash, tx));
      const dedupedTxs = Array.from(txMap.values());

      let newTxMap = { ...state.transactions };
      dedupedTxs.forEach((tx) => { newTxMap[tx.hash] = tx; });
      newTxMap = pruneTransactions(
        newTxMap,
        new Set([...dedupedTxs.map((tx) => tx.hash), ...state.feedTxs.map((tx) => tx.hash), ...(state.selectedTxHash ? [state.selectedTxHash] : [])]),
      );

      const hasIntelligent = dedupedTxs.some((t) => t.isIntelligent);
      const hasStandard = dedupedTxs.some((t) => !t.isIntelligent);

      const updateBlock = (b: Block) =>
        b.number === blockNumber
          ? { ...b, txDetails: dedupedTxs, hasIntelligent, hasStandard }
          : b;
      const newBlocks = state.blocks.map(updateBlock);
      const updatedCachedBlock = cachedBlock ? updateBlock(cachedBlock) : undefined;

      const allTxs = Object.values(newTxMap);
      const intelligentCount = allTxs.filter((t) => t.isIntelligent).length;

      return {
        blocks: newBlocks,
        blockCache: newBlocks.reduce(
          (cache, block) => ({ ...cache, [block.number]: block }),
          updatedCachedBlock
            ? { ...state.blockCache, [blockNumber]: updatedCachedBlock }
            : state.blockCache,
        ),
        transactions: newTxMap,
        totalTxCount: allTxs.length,
        intelligentTxCount: intelligentCount,
        activeValidators: validatorsFromTransactions(newTxMap),
      };
    });
  },

  setIncompleteReceipts: (blockNumber: number, hashes: string[]) => {
    set((state) => {
      const entries = Object.entries({
        ...state.incompleteReceipts,
        [blockNumber]: [...hashes],
      }).sort(([a], [b]) => Number(b) - Number(a)).slice(0, MAX_INCOMPLETE_BLOCKS);
      return { incompleteReceipts: Object.fromEntries(entries) };
    });
  },

  clearIncompleteReceipts: (blockNumber: number) => {
    set((state) => {
      if (!(blockNumber in state.incompleteReceipts)) return state;
      const incompleteReceipts = { ...state.incompleteReceipts };
      delete incompleteReceipts[blockNumber];
      return { incompleteReceipts };
    });
  },
}));
