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
const inFlight = new Map<string, Promise<unknown>>();
const recent = new Map<string, { expiresAt: number; value: unknown }>();

export async function rpcCall<T = unknown>(
  method: string,
  params: unknown[],
  signal?: AbortSignal,
): Promise<T> {
  const key = JSON.stringify([method, params]);
  const cached = recent.get(key);
  if (!signal && cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (!signal && inFlight.has(key)) return inFlight.get(key) as Promise<T>;

  const operation = executeRpc<T>(method, params, signal, key);
  if (!signal) inFlight.set(key, operation);
  try {
    return await operation;
  } finally {
    if (!signal) inFlight.delete(key);
  }
}

async function executeRpc<T>(
  method: string,
  params: unknown[],
  signal: AbortSignal | undefined,
  cacheKey: string,
): Promise<T> {
  const id = _reqId++;
  // 10-second timeout per call — prevents hung requests from piling up
  const timeout = AbortSignal.timeout(10_000);
  const combined = signal
    ? AbortSignal.any([signal, timeout])
    : timeout;

  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id }),
    signal: combined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json() as { error?: { message?: string }; result?: T };
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  const result = json.result as T;
  const ttl = method === "eth_blockNumber" ? 1_500 : method === "gen_syncing" ? 10_000 : 0;
  if (!signal && ttl > 0) recent.set(cacheKey, { expiresAt: Date.now() + ttl, value: result });
  return result;
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
  const outcome = await getTransactionReceiptResult(txId);
  return outcome.kind === "available" ? outcome.receipt : null;
}

export type ReceiptFetchResult =
  | { kind: "available"; receipt: RawReceipt }
  | { kind: "pending" }
  | { kind: "not_found" }
  | { kind: "timeout" }
  | { kind: "rate_limited" }
  | { kind: "upstream_failure"; message: string }
  | { kind: "invalid_response" };

export async function getTransactionReceiptResult(txId: string): Promise<ReceiptFetchResult> {
  try {
    const result = await rpcCall<RawReceipt | null>(
      "gen_getTransactionReceipt",
      [{ txId }],
    );
    if (!result) return { kind: "pending" };
    // Filter out empty/zero results
    if (
      !result.sender ||
      result.sender === "0x0000000000000000000000000000000000000000"
    ) {
      const zeroId = "0x" + "0".repeat(64);
      return result.id === zeroId ? { kind: "not_found" } : { kind: "pending" };
    }
    if (!result.id || typeof result.status === "undefined") {
      return { kind: "invalid_response" };
    }
    return { kind: "available", receipt: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upstream failure";
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { kind: "timeout" };
    }
    if (/HTTP 429|rate.?limit/i.test(message)) return { kind: "rate_limited" };
    return { kind: "upstream_failure", message };
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
  /** Consensus decision and GenVM execution outcome are independent of lifecycle status. */
  result?: number;
  txExecutionResult?: number;
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
