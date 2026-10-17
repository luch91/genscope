import type { RawBlock, RawReceipt, RawRound, RawTx } from "./genlayer";
import type {
  Block,
  ConsensusRound,
  GenLayerTransaction,
  TransactionExecutionResult,
  TransactionStatus,
} from "../types";
import { STATUS_MAP } from "../types";
import { isIntelligentContract } from "./classifiers";

// gen_getTransactionReceipt returns status as uint8; some builds return a string name
const STATUS_NAME_TO_CODE: Record<string, number> = {
  UNINITIALIZED: 0,
  PENDING:       1,
  PROPOSING:     2,
  COMMITTING:    3,
  REVEALING:     4,
  ACCEPTED:      5,
  UNDETERMINED:  6,
  FINALIZED:     7,
  CANCELED:      8,
  APPEAL_REVEALING: 9,
  APPEAL_COMMITTING: 10,
  READY_TO_FINALIZE: 11,
  VALIDATORS_TIMEOUT: 12,
  LEADER_TIMEOUT: 13,
  LEADER_REVEALING: 14,
};

// Bradbury ResultType, mirrored by genlayer-js transactionResultNumberToName.
const RESULT_LABEL: Record<number, string> = {
  0: "IDLE",
  1: "MAJORITY_AGREE",
  2: "MAJORITY_DISAGREE",
  3: "MAJORITY_TIMEOUT",
  4: "DETERMINISTIC_VIOLATION",
  5: "NO_MAJORITY",
};

const EXECUTION_RESULT_LABEL: Record<number, TransactionExecutionResult> = {
  0: "NOT_VOTED",
  1: "FINISHED_WITH_RETURN",
  2: "FINISHED_WITH_ERROR",
  3: "TIMEOUT",
  4: "NONDET_DISAGREE",
};

const BRADBURY_CONSENSUS_MAIN = "0x0112bf6e83497965a5fdd6dad1e447a6e004271d";
const CONSENSUS_MAIN_TX_ID_SELECTORS = new Set([
  "0xa560cd0c", // activateTransaction(bytes32,address,bytes)
  "0x70ba3339", // cancelTransaction(bytes32)
  "0x85d2d274", // commitVote(bytes32,bytes32,uint256)
  "0xb2efda83", // finalizeTransaction(bytes32)
  "0x6a9c499d", // flushExternalMessages(bytes32)
  "0x5c970d28", // leaderIdleness(bytes32)
  "0xc7e6e766", // processIdleness(bytes32)
  "0x2af7cb7f", // proposeReceipt(bytes32,bytes32,uint256,address,bytes,bytes)
  "0x3bd15f70", // revealVote(bytes32,bytes32,uint8,bytes32,uint256,uint256)
  "0x8b5de1bc", // submitAppeal(bytes32)
]);
const VALIDATOR_WALLET_TX_ID_SELECTORS = new Set([
  "0xaab85d64", // activateTransaction(bytes32,bytes)
  "0xd4f6aa93", // commitTribunalAppealVote(bytes32,uint256,bytes32)
  "0x85d2d274", // commitVote(bytes32,bytes32,uint256)
  "0x0a6c701b", // proposeReceipt(bytes32,bytes32,uint256,bytes,bytes)
  "0xf402ef5e", // proposeReceiptWithFees(bytes32,bytes32,uint256,uint256,bytes,bytes)
  "0xcbc2440a", // revealTribunalAppealVote(bytes32,uint256,bytes32,uint8,bytes32,uint256)
  "0x3bd15f70", // revealVote(bytes32,bytes32,uint8,bytes32,uint256,uint256)
]);

/** Convert a Unix timestamp (number) or ISO string to ISO string. Returns "" if zero/absent. */
function normalizeTs(v: number | string | undefined | null): string {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v === "number") return v > 0 ? new Date(v * 1000).toISOString() : "";
  // Already a string — might be ISO or a stringified number
  const n = Number(v);
  if (!isNaN(n) && n > 0 && String(n) === v) return new Date(n * 1000).toISOString();
  return v;
}

/**
 * Extract the GenLayer TX ID from an ETH transaction's calldata.
 *
 * Bradbury lifecycle calls carry the GenLayer transaction ID as their first
 * bytes32 argument. Only selectors from the deployed ConsensusMain and
 * ValidatorWallet ABIs are accepted; ordinary contract calldata is never
 * interpreted as a transaction ID.
 *
 * Returns null when input is absent, too short, or all-zero.
 */
export function extractGenLayerTxId(
  input: string | undefined,
  to?: string | null,
): string | null {
  if (!input) return null;
  const hex = input.startsWith("0x") ? input.slice(2) : input;
  // Need at least 4-byte selector (8 hex) + 32-byte arg (64 hex) = 72 hex chars
  if (hex.length < 72) return null;
  const selector = `0x${hex.slice(0, 8).toLowerCase()}`;
  const target = to?.toLowerCase();
  const isConsensusMainCall = target === BRADBURY_CONSENSUS_MAIN &&
    CONSENSUS_MAIN_TX_ID_SELECTORS.has(selector);
  const isValidatorWalletCall = VALIDATOR_WALLET_TX_ID_SELECTORS.has(selector);
  if (!isConsensusMainCall && !isValidatorWalletCall) return null;
  const candidate = "0x" + hex.slice(8, 72);
  if (candidate === "0x" + "0".repeat(64)) return null;
  return candidate;
}

export function parseBlock(raw: RawBlock): Block {
  const transactions: string[] = [];

  if (Array.isArray(raw.transactions)) {
    for (const tx of raw.transactions) {
      if (typeof tx === "string") {
        // Fallback when includeTransactions=false (we always use true, so rare)
        transactions.push(tx);
      } else {
        const rawTx = tx as RawTx;
        const glId = extractGenLayerTxId(rawTx.input, rawTx.to);
        if (glId) {
          // Store the GenLayer TX ID — this is what gen_getTransactionReceipt accepts
          transactions.push(glId);
        }
        // Skip txs without a parseable GL TX ID (validator/system transactions)
      }
    }
  }

  return {
    number:         parseInt(raw.number, 16),
    hash:           raw.hash,
    parentHash:     raw.parentHash,
    timestamp:      parseInt(raw.timestamp, 16),
    transactions,
    miner:          raw.miner,
    gasUsed:        raw.gasUsed,
    gasLimit:       raw.gasLimit,
    txDetails:      [],
    hasIntelligent: false,
    hasStandard:    false,
    addedAt:        Date.now(),
  };
}

export function parseReceipt(
  raw: RawReceipt,
  txHash: string,
  blockNumber?: number
): GenLayerTransaction {
  // ── Status ────────────────────────────────────────────────────────────────
  let statusCode: number;
  let status: TransactionStatus;

  if (typeof raw.status === "string") {
    const name = raw.status.toUpperCase();
    statusCode = STATUS_NAME_TO_CODE[name] ?? -1;
    status = (STATUS_NAME_TO_CODE[name] !== undefined ? name : "UNKNOWN") as TransactionStatus;
  } else {
    statusCode = typeof raw.status === "number" ? raw.status : -1;
    status = STATUS_MAP[statusCode] ?? "UNKNOWN";
  }

  // ── Round data ────────────────────────────────────────────────────────────
  const roundData: ConsensusRound[] = (raw.roundData ?? []).map((r: RawRound) => ({
    round:          r.round,
    leaderIndex:    r.leaderIndex,
    votesCommitted: r.votesCommitted,
    votesRevealed:  r.votesRevealed,
    rotationsLeft:  r.rotationsLeft,
    // result is a uint8 in the actual API
    result: typeof r.result === "number"
      ? (RESULT_LABEL[r.result] ?? String(r.result))
      : (r.result ?? ""),
    roundValidators: r.roundValidators ?? [],
    validatorVotes:  r.validatorVotes ?? "",
    // validatorVotesHash is string[] in the actual API
    validatorVotesHash: Array.isArray(r.validatorVotesHash)
      ? r.validatorVotesHash.join(",")
      : (r.validatorVotesHash ?? ""),
  }));

  // ── Field name normalisation ──────────────────────────────────────────────
  // The API returns txCallData; accept txData as a legacy alias
  const txData = raw.txCallData ?? raw.txData ?? "";

  // readStateBlockRanges is an array in the actual API; singular kept for back-compat
  const rangesArr = raw.readStateBlockRanges ??
    (raw.readStateBlockRange ? [raw.readStateBlockRange] : []);
  const readStateBlockRange = rangesArr[0] ?? {
    ActivationBlock: 0,
    ProcessingBlock: 0,
    ProposalBlock:   0,
  };

  // eqBlocksOutputs: empty string means no equivalence data (treat same as "c0")
  const rawEq = raw.eqBlocksOutputs ?? "";
  const eqBlocksOutputs = rawEq === "" ? "c0" : rawEq;

  // consumedValidators: derive from roundData if not present in response
  const consumedValidators =
    raw.consumedValidators ??
    roundData.flatMap((r) => r.roundValidators);

  // ── Timestamps ───────────────────────────────────────────────────────────
  const ts = raw.timestamps ?? ({} as RawReceipt["timestamps"]);

  // ── Assemble ─────────────────────────────────────────────────────────────
  const tx: GenLayerTransaction = {
    hash:      txHash,
    id:        raw.id ?? txHash,
    txOrigin:  raw.txOrigin  ?? "",
    sender:    raw.sender    ?? "",
    recipient: raw.recipient ?? "",
    activator: raw.activator ?? "",
    status,
    statusCode,
    rawStatus: raw.status,
    consensusDecisionCode: raw.result,
    consensusDecision: raw.result === undefined
      ? roundData.at(-1)?.result
      : (RESULT_LABEL[raw.result] ?? `UNKNOWN_${raw.result}`),
    executionResultCode: raw.txExecutionResult,
    executionResult: raw.txExecutionResult === undefined
      ? undefined
      : (EXECUTION_RESULT_LABEL[raw.txExecutionResult] ?? "UNKNOWN"),
    finalizationOutcome: status === "FINALIZED"
      ? "FINALIZED"
      : status === "CANCELED"
        ? "CANCELED"
        : "NOT_FINALIZED",
    timestamps: {
      Created:   normalizeTs(ts.Created),
      Pending:   normalizeTs(ts.Pending),
      Activated: normalizeTs(ts.Activated),
      Proposed:  normalizeTs(ts.Proposed),
      Committed: normalizeTs(ts.Committed),
      LastVote:  normalizeTs(ts.LastVote),
    },
    numOfInitialValidators: raw.numOfInitialValidators ?? 0,
    consumedValidators,
    roundData,
    eqBlocksOutputs,
    txData,
    readStateBlockRange,
    isIntelligent: false,
    blockNumber,
  };

  tx.isIntelligent = isIntelligentContract(tx);
  return tx;
}

export function parseFunctionSelector(txData: string): string {
  if (!txData || txData.length < 10) return "";
  // txCallData from the API is raw hex without 0x prefix
  const hex = txData.startsWith("0x") ? txData.slice(2) : txData;
  return "0x" + hex.slice(0, 8);
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
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = hexToBytes(clean);
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
