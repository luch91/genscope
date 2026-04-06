import type { RawBlock, RawReceipt, RawRound, RawTx } from "./genlayer";
import type {
  Block,
  ConsensusRound,
  GenLayerTransaction,
  TransactionStatus,
} from "../types";
import { STATUS_MAP } from "../types";
import { isIntelligentContract } from "./classifiers";

export function parseBlock(raw: RawBlock): Block {
  const transactions: string[] = Array.isArray(raw.transactions)
    ? raw.transactions.map((tx) =>
        typeof tx === "string" ? tx : (tx as RawTx).hash
      )
    : [];

  return {
    number: parseInt(raw.number, 16),
    hash: raw.hash,
    parentHash: raw.parentHash,
    timestamp: parseInt(raw.timestamp, 16),
    transactions,
    miner: raw.miner,
    gasUsed: raw.gasUsed,
    gasLimit: raw.gasLimit,
    txDetails: [],
    hasIntelligent: false,
    hasStandard: false,
    addedAt: Date.now(),
  };
}

export function parseReceipt(
  raw: RawReceipt,
  txHash: string,
  blockNumber?: number
): GenLayerTransaction {
  const statusCode = raw.status ?? 0;
  const status: TransactionStatus = STATUS_MAP[statusCode] ?? "UNINITIALIZED";

  const roundData: ConsensusRound[] = (raw.roundData ?? []).map(
    (r: RawRound) => ({
      round: r.round,
      leaderIndex: r.leaderIndex,
      votesCommitted: r.votesCommitted,
      votesRevealed: r.votesRevealed,
      rotationsLeft: r.rotationsLeft,
      result: r.result ?? "",
      roundValidators: r.roundValidators ?? [],
      validatorVotes: r.validatorVotes ?? "",
      validatorVotesHash: r.validatorVotesHash ?? "",
    })
  );

  const tx: GenLayerTransaction = {
    hash: txHash,
    id: raw.id ?? txHash,
    txOrigin: raw.txOrigin ?? "",
    sender: raw.sender ?? "",
    recipient: raw.recipient ?? "",
    activator: raw.activator ?? "",
    status,
    statusCode,
    timestamps: {
      Created: raw.timestamps?.Created ?? "",
      Pending: raw.timestamps?.Pending ?? "",
      Activated: raw.timestamps?.Activated ?? "",
      Proposed: raw.timestamps?.Proposed ?? "",
      Committed: raw.timestamps?.Committed ?? "",
      LastVote: raw.timestamps?.LastVote ?? "",
    },
    numOfInitialValidators: raw.numOfInitialValidators ?? 0,
    consumedValidators: raw.consumedValidators ?? [],
    roundData,
    eqBlocksOutputs: raw.eqBlocksOutputs ?? "c0",
    txData: raw.txData ?? "",
    readStateBlockRange: raw.readStateBlockRange ?? {
      ActivationBlock: 0,
      ProcessingBlock: 0,
      ProposalBlock: 0,
    },
    isIntelligent: false,
    blockNumber,
  };

  tx.isIntelligent = isIntelligentContract(tx);
  return tx;
}

export function parseFunctionSelector(txData: string): string {
  if (!txData || txData.length < 10) return "";
  const selector = txData.startsWith("0x")
    ? txData.slice(2, 10)
    : txData.slice(0, 8);
  return "0x" + selector;
}

export function truncateAddress(addr: string, chars = 6): string {
  if (!addr || addr.length < chars * 2 + 2) return addr ?? "";
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

export function truncateHash(hash: string, chars = 8): string {
  if (!hash || hash.length < chars * 2 + 2) return hash ?? "";
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}

export function decodeEqOutputs(hex: string): string {
  if (!hex || hex === "c0" || hex === "0xc0") return "Empty";
  try {
    const bytes = hexToBytes(hex.startsWith("0x") ? hex.slice(2) : hex);
    return `${bytes.length} bytes`;
  } catch {
    return hex;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
