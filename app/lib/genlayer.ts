/**
 * GenLayer RPC client — Bradbury testnet
 *
 * Root cause of missing round data (confirmed by ABI inspection):
 *   getTransactionAllData(bytes32) returns TWO values:
 *     [0] transaction  — main struct (no rounds inside)
 *     [1] roundsData   — RoundData[] array (all rounds)
 *   The genlayer-js SDK's getTransaction() only pulls txExecutionResult from [0]
 *   and discards [1] with the _ prefix. We call the contract directly with viem
 *   so we capture both outputs.
 *
 * For timestamps we also call getTransactionData(bytes32, uint256) which returns
 * createdTimestamp and lastVoteTimestamp.
 */

import { encodeFunctionData, decodeFunctionResult } from "viem";
import { RPC_URL } from "./constants";

const CONSENSUS_DATA_CONTRACT =
  "0x85D7bf947A512Fc640C75327A780c90847267697" as const;

// ─── Minimal inline ABI ────────────────────────────────────────────────────────
// Extracted from genlayer-js/dist/chunk-SGAVFNGA.js  CONSENSUS_DATA_CONTRACT4
// Only the two functions we need — keeps the bundle light.

const GET_ALL_DATA_ABI = [
  {
    name: "getTransactionAllData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_tx_id", type: "bytes32" }],
    outputs: [
      {
        name: "transaction",
        type: "tuple",
        components: [
          { name: "result",              type: "uint8"   },
          { name: "txExecutionResult",   type: "uint8"   },
          { name: "previousStatus",      type: "uint8"   },
          { name: "status",              type: "uint8"   },
          { name: "txOrigin",            type: "address" },
          { name: "sender",              type: "address" },
          { name: "recipient",           type: "address" },
          { name: "activator",           type: "address" },
          { name: "txSlot",              type: "uint256" },
          { name: "initialRotations",    type: "uint256" },
          { name: "numOfInitialValidators", type: "uint256" },
          { name: "epoch",               type: "uint256" },
          { name: "id",                  type: "bytes32" },
          { name: "randomSeed",          type: "bytes32" },
          { name: "txExecutionHash",     type: "bytes32" },
          { name: "resultHash",          type: "bytes32" },
          { name: "txCalldata",          type: "bytes"   },
          { name: "eqBlocksOutputs",     type: "bytes"   },
          {
            name: "readStateBlockRanges",
            type: "tuple[]",
            components: [
              { name: "activationBlock",  type: "uint256" },
              { name: "processingBlock",  type: "uint256" },
              { name: "proposalBlock",    type: "uint256" },
            ],
          },
          { name: "validUntil",  type: "uint256" },
          { name: "value",       type: "uint256" },
        ],
      },
      {
        name: "roundsData",
        type: "tuple[]",
        components: [
          { name: "round",              type: "uint256"   },
          { name: "leaderIndex",        type: "uint256"   },
          { name: "votesCommitted",     type: "uint256"   },
          { name: "votesRevealed",      type: "uint256"   },
          { name: "appealBond",         type: "uint256"   },
          { name: "rotationsLeft",      type: "uint256"   },
          { name: "result",             type: "uint8"     },
          { name: "roundValidators",    type: "address[]" },
          { name: "validatorVotes",     type: "uint8[]"   },  // VoteType enum
          { name: "validatorVotesHash", type: "bytes32[]" },
          { name: "validatorResultHash",type: "bytes32[]" },
        ],
      },
    ],
  },
] as const;

const GET_TX_DATA_ABI = [
  {
    name: "getTransactionData",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_txId",      type: "bytes32" },
      { name: "_timestamp", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "currentTimestamp",  type: "uint256"  },
          { name: "sender",            type: "address"  },
          { name: "recipient",         type: "address"  },
          { name: "initialRotations",  type: "uint256"  },
          { name: "txSlot",            type: "uint256"  },
          { name: "createdTimestamp",  type: "uint256"  },
          { name: "lastVoteTimestamp", type: "uint256"  },
          { name: "randomSeed",        type: "bytes32"  },
          { name: "result",            type: "uint8"    },
          { name: "txExecutionHash",   type: "bytes32"  },
          { name: "txCalldata",        type: "bytes"    },
          { name: "eqBlocksOutputs",   type: "bytes"    },
          { name: "queueType",         type: "uint8"    },
          { name: "queuePosition",     type: "uint256"  },
          { name: "activator",         type: "address"  },
          { name: "lastLeader",        type: "address"  },
          { name: "status",            type: "uint8"    },
          { name: "txId",              type: "bytes32"  },
          {
            name: "readStateBlockRange",
            type: "tuple",
            components: [
              { name: "activationBlock",  type: "uint256" },
              { name: "processingBlock",  type: "uint256" },
              { name: "proposalBlock",    type: "uint256" },
            ],
          },
          { name: "numOfRounds", type: "uint256" },
          // lastRound omitted — we get full rounds from getTransactionAllData
        ],
      },
    ],
  },
] as const;

// VoteType number → label
const VOTE_LABEL: Record<number, string> = {
  0: "NOT_VOTED",
  1: "AGREE",
  2: "DISAGREE",
  3: "TIMEOUT",
  4: "DETERMINISTIC_VIOLATION",
};

// ResultType number → label
const RESULT_LABEL: Record<number, string> = {
  0: "IDLE",
  1: "AGREE",
  2: "DISAGREE",
  3: "TIMEOUT",
  4: "DETERMINISTIC_VIOLATION",
  5: "NO_MAJORITY",
  6: "MAJORITY_AGREE",
  7: "MAJORITY_DISAGREE",
};

// ─── Core RPC helper ──────────────────────────────────────────────────────────

let _reqId = 1;

export async function rpcCall<T = unknown>(
  method: string,
  params: unknown[],
): Promise<T> {
  const id = _reqId++;
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message ?? JSON.stringify(data.error));
  return data.result as T;
}

// ─── Block helpers ────────────────────────────────────────────────────────────

export async function getLatestBlockNumber(): Promise<number> {
  const hex = await rpcCall<string>("eth_blockNumber", []);
  return parseInt(hex, 16);
}

export async function getBlockByNumber(
  blockNumber: number,
  includeTransactions = true,
): Promise<RawBlock | null> {
  return rpcCall<RawBlock | null>("eth_getBlockByNumber", [
    "0x" + blockNumber.toString(16),
    includeTransactions,
  ]);
}

// ─── Transaction data ─────────────────────────────────────────────────────────

/**
 * Fetch full GenLayer transaction data by calling the consensusDataContract directly.
 *
 * IMPORTANT: The ETH tx hash in eth_getBlockByNumber is NOT the GenLayer TX ID.
 * The real GenLayer TX ID is emitted in the transaction receipt's event logs (topics[1]).
 * We must first fetch the receipt to get the GenLayer TX ID, then query the contract.
 */
export async function getTransactionAllData(
  txHash: string,
): Promise<RawReceipt | null> {
  const ethHash = (txHash.startsWith("0x") ? txHash : "0x" + txHash) as `0x${string}`;

  try {
    // Step 1: Fetch receipt to extract the GenLayer TX ID from event logs.
    // The GenLayer TX ID is indexed as topics[1] in every emitted event.
    const receipt = await rpcCall<{ logs: Array<{ topics: string[] }> } | null>(
      "eth_getTransactionReceipt",
      [ethHash],
    ).catch(() => null);

    if (!receipt || !Array.isArray(receipt.logs) || receipt.logs.length === 0) {
      return null;
    }

    // Find first log that has a non-zero topics[1]
    const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";
    let genLayerTxId: `0x${string}` | null = null;
    for (const log of receipt.logs) {
      if (Array.isArray(log.topics) && log.topics.length >= 2 && log.topics[1] !== ZERO) {
        genLayerTxId = log.topics[1] as `0x${string}`;
        break;
      }
    }
    if (!genLayerTxId) return null;

    const nowSec = BigInt(Math.floor(Date.now() / 1000));

    // Step 2: Encode both contract calls using the real GenLayer TX ID
    const allDataCalldata = encodeFunctionData({
      abi: GET_ALL_DATA_ABI,
      functionName: "getTransactionAllData",
      args: [genLayerTxId],
    });

    const txDataCalldata = encodeFunctionData({
      abi: GET_TX_DATA_ABI,
      functionName: "getTransactionData",
      args: [genLayerTxId, nowSec],
    });

    // Fire both in parallel
    const [allDataHex, txDataHex] = await Promise.all([
      rpcCall<string>("eth_call", [
        { to: CONSENSUS_DATA_CONTRACT, data: allDataCalldata },
        "latest",
      ]).catch(() => null),
      rpcCall<string>("eth_call", [
        { to: CONSENSUS_DATA_CONTRACT, data: txDataCalldata },
        "latest",
      ]).catch(() => null),
    ]);

    if (!allDataHex || allDataHex === "0x") return null;

    // Decode
    const [tx, roundsRaw] = decodeFunctionResult({
      abi: GET_ALL_DATA_ABI,
      functionName: "getTransactionAllData",
      data: allDataHex as `0x${string}`,
    }) as unknown as [AllDataTx, RoundDataRaw[]];

    // Check for zero/null transaction
    if (
      !tx ||
      tx.sender === "0x0000000000000000000000000000000000000000"
    ) {
      return null;
    }

    // Decode timestamps if available
    let createdTs = 0;
    let lastVoteTs = 0;
    if (txDataHex && txDataHex !== "0x") {
      try {
        const txd = decodeFunctionResult({
          abi: GET_TX_DATA_ABI,
          functionName: "getTransactionData",
          data: txDataHex as `0x${string}`,
        }) as TxDataResult;
        createdTs = Number(txd.createdTimestamp ?? 0);
        lastVoteTs = Number(txd.lastVoteTimestamp ?? 0);
      } catch {
        // timestamps optional
      }
    }

    const makeTs = (unix: number): string =>
      unix > 0 ? new Date(unix * 1000).toISOString() : "";

    // Map roundsData
    const roundData: RawRound[] = (roundsRaw ?? []).map((r) => ({
      round:          Number(r.round),
      leaderIndex:    Number(r.leaderIndex),
      votesCommitted: Number(r.votesCommitted),
      votesRevealed:  Number(r.votesRevealed),
      rotationsLeft:  Number(r.rotationsLeft),
      result:         RESULT_LABEL[Number(r.result)] ?? String(r.result),
      roundValidators: (r.roundValidators ?? []) as string[],
      // validatorVotes is uint8[] (VoteType enum) — decode to names
      validatorVotes: (r.validatorVotes ?? [])
        .map((v) => VOTE_LABEL[Number(v)] ?? String(v))
        .join(","),
      validatorVotesHash: (r.validatorVotesHash ?? []).join(","),
    }));

    // eqBlocksOutputs is `bytes` from the contract — convert to hex string
    const eqRaw = tx.eqBlocksOutputs;
    const eqHex: string =
      eqRaw instanceof Uint8Array
        ? Array.from(eqRaw).map((b) => b.toString(16).padStart(2, "0")).join("")
        : typeof eqRaw === "string"
        ? eqRaw.replace(/^0x/, "")
        : "";
    const eqBlocksOutputs = eqHex.length === 0 || eqHex === "c0" ? "c0" : eqHex;

    // txCalldata is `bytes` — convert to hex string
    const cdRaw = tx.txCalldata;
    const txData: string =
      cdRaw instanceof Uint8Array
        ? "0x" + Array.from(cdRaw).map((b) => b.toString(16).padStart(2, "0")).join("")
        : typeof cdRaw === "string"
        ? cdRaw
        : "";

    const ranges = tx.readStateBlockRanges ?? [];

    return {
      id:        genLayerTxId,
      txOrigin:  String(tx.txOrigin ?? tx.sender),
      sender:    String(tx.sender),
      recipient: String(tx.recipient),
      activator: String(tx.activator),
      status:    Number(tx.status),
      timestamps: {
        Created:   makeTs(createdTs),
        Pending:   "",
        Activated: "",
        Proposed:  "",
        Committed: "",
        LastVote:  makeTs(lastVoteTs),
      },
      numOfInitialValidators: Number(tx.numOfInitialValidators),
      consumedValidators: roundData.flatMap((r) => r.roundValidators),
      roundData,
      eqBlocksOutputs,
      txData,
      readStateBlockRange: {
        ActivationBlock:  Number(ranges[0]?.activationBlock ?? 0),
        ProcessingBlock:  Number(ranges[0]?.processingBlock ?? 0),
        ProposalBlock:    Number(ranges[0]?.proposalBlock   ?? 0),
      },
    };
  } catch (err) {
    console.error("getTransactionAllData failed:", err);
    return null;
  }
}

export async function getSyncStatus(): Promise<RawSyncStatus | false> {
  return rpcCall<RawSyncStatus | false>("gen_syncing", []);
}

// ─── Internal decoded types (viem ABI decode results) ────────────────────────

interface AllDataTx {
  result:               number | bigint;
  txExecutionResult:    number | bigint;
  status:               number | bigint;
  txOrigin:             string;
  sender:               string;
  recipient:            string;
  activator:            string;
  numOfInitialValidators: bigint;
  id:                   string;
  txCalldata:           `0x${string}` | Uint8Array;
  eqBlocksOutputs:      `0x${string}` | Uint8Array;
  readStateBlockRanges: Array<{
    activationBlock: bigint;
    processingBlock: bigint;
    proposalBlock:   bigint;
  }>;
}

interface RoundDataRaw {
  round:               bigint;
  leaderIndex:         bigint;
  votesCommitted:      bigint;
  votesRevealed:       bigint;
  rotationsLeft:       bigint;
  result:              number | bigint;
  roundValidators:     string[];
  validatorVotes:      (number | bigint)[];
  validatorVotesHash:  string[];
  validatorResultHash: string[];
}

interface TxDataResult {
  createdTimestamp:  bigint;
  lastVoteTimestamp: bigint;
}

// ─── Public raw types ─────────────────────────────────────────────────────────

export interface RawBlock {
  number:       string;
  hash:         string;
  parentHash:   string;
  timestamp:    string;
  transactions: RawTx[] | string[];
  miner:        string;
  gasUsed:      string;
  gasLimit:     string;
}

export interface RawTx {
  hash:   string;
  from?:  string;
  to?:    string | null;
  value?: string;
  gas?:   string;
  input?: string;
}

export interface RawReceipt {
  id:        string;
  txOrigin:  string;
  sender:    string;
  recipient: string;
  activator: string;
  status:    number;
  timestamps: {
    Created:   string;
    Pending:   string;
    Activated: string;
    Proposed:  string;
    Committed: string;
    LastVote:  string;
  };
  numOfInitialValidators: number;
  consumedValidators:     string[];
  roundData:              RawRound[];
  eqBlocksOutputs:        string;
  txData:                 string;
  readStateBlockRange: {
    ActivationBlock: number;
    ProcessingBlock: number;
    ProposalBlock:   number;
  };
}

export interface RawRound {
  round:              number;
  leaderIndex:        number;
  votesCommitted:     number;
  votesRevealed:      number;
  rotationsLeft:      number;
  result:             string;
  roundValidators:    string[];
  validatorVotes:     string; // comma-separated vote names
  validatorVotesHash: string;
}

export interface RawSyncStatus {
  syncedBlock?:  string;
  latestBlock?:  string;
  blocksBehind?: number;
}
