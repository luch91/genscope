export type TransactionStatus =
  | "UNINITIALIZED"
  | "PENDING"
  | "ACCEPTED"
  | "FINALIZED"
  | "CANCELED";

export const STATUS_MAP: Record<number, TransactionStatus> = {
  0: "UNINITIALIZED",
  1: "PENDING",
  5: "ACCEPTED",
  7: "FINALIZED",
  8: "CANCELED",
};

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
  transactions: Record<string, GenLayerTransaction>;
  selectedBlockNumber: number | null;
  selectedTxHash: string | null;
  cameraTarget: [number, number, number] | null;
  syncStatus: SyncStatus;
  networkStatus: NetworkStatus;
  totalTxCount: number;
  intelligentTxCount: number;
  activeValidators: Set<string>;
  latestBlockNumber: number;   // actual chain head from eth_blockNumber
  loadingOlder: boolean;       // true while fetching older blocks

  // actions
  addBlock: (block: Block) => void;
  setBlocks: (blocks: Block[]) => void;
  addTransaction: (tx: GenLayerTransaction) => void;
  setSelectedBlock: (num: number | null) => void;
  setSelectedTx: (hash: string | null) => void;
  setCameraTarget: (target: [number, number, number] | null) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setNetworkStatus: (status: NetworkStatus) => void;
  setLatestBlockNumber: (n: number) => void;
  setLoadingOlder: (loading: boolean) => void;
  updateBlockTxDetails: (blockNumber: number, txs: GenLayerTransaction[]) => void;
}
