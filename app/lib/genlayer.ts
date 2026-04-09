/**
 * GenLayer RPC client — Bradbury testnet
 *
 * All transaction data is fetched with gen_getTransactionReceipt in a single
 * RPC call. No viem, no ABI encoding, no multi-step log parsing.
 *
 * The txId passed to gen_getTransactionReceipt is the transaction hash as
 * returned by eth_getBlockByNumber — the same hash that appears in each
 * block's transaction list.
 *
 * All calls are proxied through /api/rpc (Next.js API route) to avoid
 * browser-side network restrictions when fetching from the Bradbury node.
 */

import { RPC_URL } from "./constants";

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
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result as T;
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
 * Fetch the full GenLayer transaction receipt (consensus data included) in one call.
 *
 * txId is the transaction hash from eth_getBlockByNumber — or a GenLayer TX ID
 * if searching by the id field from a previous receipt.
 *
 * Returns null when the transaction is not found or has no data yet.
 */
export async function getTransactionReceipt(txId: string): Promise<RawReceipt | null> {
  try {
    const result = await rpcCall<RawReceipt | null>(
      "gen_getTransactionReceipt",
      [{ txId }],
    );
    if (!result) return null;
    // Filter out empty/zero results
    if (
      !result.sender ||
      result.sender === "0x0000000000000000000000000000000000000000"
    ) {
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

export async function getSyncStatus(): Promise<RawSyncStatus | false> {
  return rpcCall<RawSyncStatus | false>("gen_syncing", []);
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
  /** uint8 status code (0/1/5/7/8); some RPC versions return a string name */
  status:    number | string;
  /** Timestamp values: actual API returns Unix epoch numbers; handle both number and string */
  timestamps: {
    Created:   number | string;
    Pending:   number | string;
    Activated: number | string;
    Proposed:  number | string;
    Committed: number | string;
    LastVote:  number | string;
  };
  numOfInitialValidators: number;
  /** Not always present in the raw response; derive from roundData if absent */
  consumedValidators?:    string[];
  roundData:              RawRound[];
  /** hex or empty string — treat "" the same as "c0" (empty) */
  eqBlocksOutputs:        string;
  /** Actual API field name is txCallData; txData kept for back-compat */
  txCallData?:            string;
  txData?:                string;
  /** Actual API returns an array; singular kept for back-compat */
  readStateBlockRanges?:  Array<{ ActivationBlock: number; ProcessingBlock: number; ProposalBlock: number }>;
  readStateBlockRange?:   { ActivationBlock: number; ProcessingBlock: number; ProposalBlock: number };
}

export interface RawRound {
  round:              number;
  leaderIndex:        number;
  votesCommitted:     number;
  votesRevealed:      number;
  rotationsLeft:      number;
  /** Actual API returns a number (ResultType enum); string accepted for back-compat */
  result:             number | string;
  roundValidators:    string[];
  /** base64-encoded validator votes */
  validatorVotes:     string;
  /** Actual API returns string[]; string kept for back-compat */
  validatorVotesHash: string | string[];
}

export interface RawSyncStatus {
  syncedBlock?:  string;
  latestBlock?:  string;
  blocksBehind?: number;
}
