export type TransactionStatus =
  | "UNINITIALIZED"
  | "PENDING"
  | "PROPOSING"
  | "COMMITTING"
  | "REVEALING"
  | "ACCEPTED"
  | "UNDETERMINED"
  | "FINALIZED"
  | "CANCELED"
  | "APPEAL_REVEALING"
  | "APPEAL_COMMITTING"
  | "READY_TO_FINALIZE"
  | "VALIDATORS_TIMEOUT"
  | "LEADER_TIMEOUT"
  | "LEADER_REVEALING"
  | "UNKNOWN";

export const STATUS_MAP: Record<number, TransactionStatus> = {
  0: "UNINITIALIZED",
  1: "PENDING",
  2: "PROPOSING",
  3: "COMMITTING",
  4: "REVEALING",
  5: "ACCEPTED",
  6: "UNDETERMINED",
  7: "FINALIZED",
  8: "CANCELED",
  9: "APPEAL_REVEALING",
  10: "APPEAL_COMMITTING",
  11: "READY_TO_FINALIZE",
  12: "VALIDATORS_TIMEOUT",
  13: "LEADER_TIMEOUT",
  14: "LEADER_REVEALING",
};

export type TransactionExecutionResult =
  | "NOT_VOTED"
  | "FINISHED_WITH_RETURN"
  | "FINISHED_WITH_ERROR"
  | "TIMEOUT"
  | "NONDET_DISAGREE"
  | "UNKNOWN";

export type TransactionFinalizationOutcome =
  | "FINALIZED"
  | "CANCELED"
  | "NOT_FINALIZED";

export interface ConsensusRound {
  round: number;
  leaderIndex: number;
  votesCommitted: number;
  votesRevealed: number;
  rotationsLeft: number;
  result: string;
  roundValidators: string[];
  validatorVotes: string; // base64
  validatorVotesHash: string;
}

export interface TransactionTimestamps {
  Created: string;
  Pending: string;
  Activated: string;
  Proposed: string;
  Committed: string;
  LastVote: string;
}

export interface ReadStateBlockRange {
  ActivationBlock: number;
  ProcessingBlock: number;
  ProposalBlock: number;
}

export interface GenLayerTransaction {
  hash: string;
  id: string;
  txOrigin: string;
  sender: string;
  recipient: string;
  activator: string;
  status: TransactionStatus;
  statusCode: number;
  rawStatus?: number | string;
  consensusDecision?: string;
  consensusDecisionCode?: number;
  executionResult?: TransactionExecutionResult;
  executionResultCode?: number;
  finalizationOutcome?: TransactionFinalizationOutcome;
  timestamps: TransactionTimestamps;
  numOfInitialValidators: number;
  consumedValidators: string[];
  roundData: ConsensusRound[];
  eqBlocksOutputs: string;
  txData: string;
  readStateBlockRange: ReadStateBlockRange;
  isIntelligent: boolean;
  blockNumber?: number;
}

export interface Block {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  transactions: string[];
  miner: string;
  gasUsed: string;
  gasLimit: string;
  // derived
  txDetails: GenLayerTransaction[];
  hasIntelligent: boolean;
  hasStandard: boolean;
  // visual
  addedAt: number; // Date.now() when added to store
}

export type NetworkStatus = "live" | "syncing" | "reconnecting";

export interface SyncStatus {
  blocksBehind: number;
  synced: boolean;
}

export interface AppState {
  blocks: Block[];
  blockCache: Record<number, Block>; // fetched history, independent of render window
  transactions: Record<string, GenLayerTransaction>;
  feedTxs: GenLayerTransaction[]; // real-time tx feed, newest first
  selectedBlockNumber: number | null;
  selectedTxHash: string | null;
  syncStatus: SyncStatus;
  networkStatus: NetworkStatus;
  totalTxCount: number;
  intelligentTxCount: number;
  activeValidators: Set<string>;
  latestBlockNumber: number;   // actual chain head from eth_blockNumber (≈ lastSealedBlock)
  verifiedBlockNumber: number; // lastVerifiedBlock from explorer stats API
  chainTxCount: number;        // totalTransactions from explorer stats API (chain-wide)
  loadingOlder: boolean;       // true while fetching older blocks
  incompleteReceipts: Record<number, string[]>;

  // actions
  addFeedTx: (tx: GenLayerTransaction) => void;
  addBlock: (block: Block) => void;
  addOlderBlocks: (blocks: Block[]) => void;
  setBlocks: (blocks: Block[]) => void;
  addTransaction: (tx: GenLayerTransaction) => void;
  setSelectedBlock: (num: number | null) => void;
  setSelectedTx: (hash: string | null) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setNetworkStatus: (status: NetworkStatus) => void;
  setLatestBlockNumber: (n: number) => void;
  setVerifiedBlockNumber: (n: number) => void;
  setChainTxCount: (n: number) => void;
  setLoadingOlder: (loading: boolean) => void;
  updateBlockTxDetails: (blockNumber: number, txs: GenLayerTransaction[]) => void;
  setIncompleteReceipts: (blockNumber: number, hashes: string[]) => void;
  clearIncompleteReceipts: (blockNumber: number) => void;
}
