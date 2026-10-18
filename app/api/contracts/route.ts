import { NextRequest, NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { enforceRateLimit, RpcPolicyError } from "../rpc/policy";
import { readBoundedJsonResponse } from "../_shared/bounded-body";
import {
  candidateClassificationUnresolved,
  candidatePage,
  cursorWithinLookback,
  GHOST_SELECTOR,
  parseNonNegativeCursor,
  planContinuations,
  sortCandidates,
} from "./pagination";

const NETWORKS = {
  "testnet-bradbury": { rpcUrl: "https://rpc-bradbury.genlayer.com", consensus: "0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D", studio: false },
  "testnet-asimov": { rpcUrl: "https://rpc.asimov.genlayer.com", consensus: "0x6CAFF6769d70824745AD895663409DC70aB5B28E", studio: false },
  studionet: { rpcUrl: "https://studio.genlayer.com/api", consensus: "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575", studio: true },
} as const;

const NEW_TX_TOPIC = "0xdab9102861c7483a187584d6371d88316f005af507982ccf95c110879f3ed5a5";
const CHUNK_SIZE = 10_000;
const CHUNKS_PER_PAGE = 4;
const MAX_SUBREQUESTS = 45;
const MAX_CURSOR_LOOKBACK = 1_000_000;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

type NetworkName = keyof typeof NETWORKS;
type ContractEntry = { address: string; methods: string[]; blockNumber: number; network: string };

class RequestBudget {
  used = 0;
  take() {
    if (this.used >= MAX_SUBREQUESTS) throw new Error("SUBREQUEST_BUDGET_EXHAUSTED");
    this.used += 1;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

async function rpc(rpcUrl: string, method: string, params: unknown[], budget: RequestBudget): Promise<unknown> {
  budget.take();
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: budget.used, method, params }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`RPC_HTTP_${response.status}`);
  const json = await readBoundedJsonResponse(response, 2 * 1024 * 1024) as { result?: unknown; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "RPC_ERROR");
  return json.result;
}

function extractAddress(topic: string): string | null {
  return /^0x[0-9a-fA-F]{64}$/.test(topic) ? `0x${topic.slice(-40).toLowerCase()}` : null;
}

async function getContractMethods(
  network: (typeof NETWORKS)[NetworkName],
  address: string,
  budget: RequestBudget,
): Promise<{ methods: string[] | null; failed: boolean }> {
  try {
    // Bradbury/Asimov accept {code}, not an address. Fetching code first mirrors current genlayer-js.
    const schema = network.studio
      ? await rpc(network.rpcUrl, "gen_getContractSchema", [address], budget)
      : await rpc(network.rpcUrl, "gen_getContractSchema", [{
          code: await rpc(network.rpcUrl, "gen_getContractCode", [{ address }], budget),
        }], budget);
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return { methods: null, failed: false };
    const methods = (schema as Record<string, unknown>).methods;
    return {
      methods: methods && typeof methods === "object" && !Array.isArray(methods) ? Object.keys(methods) : null,
      failed: false,
    };
  } catch {
    return { methods: null, failed: true };
  }
}

async function isGhostContract(
  network: (typeof NETWORKS)[NetworkName],
  address: string,
  budget: RequestBudget,
): Promise<{ isGhost: boolean; failed: boolean }> {
  try {
    const data = GHOST_SELECTOR + address.slice(2).padStart(64, "0");
    const result = await rpc(network.rpcUrl, "eth_call", [{ to: network.consensus, data }, "latest"], budget);
    return { isGhost: typeof result === "string" && BigInt(result) === BigInt(1), failed: false };
  } catch {
    return { isGhost: false, failed: true };
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      try {
        results[current] = { status: "fulfilled", value: await mapper(items[current]) };
      } catch (reason) {
        results[current] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function GET(request: NextRequest) {
  const networkName = request.nextUrl.searchParams.get("network") ?? "testnet-bradbury";
  if (!(networkName in NETWORKS)) {
    return NextResponse.json({ error: "Unsupported network" }, { status: 400, headers: CORS });
  }
  const network = NETWORKS[networkName as NetworkName];
  const budget = new RequestBudget();

  try {
    const clientKey = request.headers.get("cf-connecting-ip")
      ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "unknown";
    await enforceRateLimit(env.CONTRACT_RATE_LIMITER, clientKey, {
      code: "CONTRACT_DISCOVERY_RATE_LIMITED",
      message: "Contract discovery rate limit exceeded",
      retryAfter: 60,
    });
    const cursor = parseNonNegativeCursor(request.nextUrl.searchParams.get("cursor"), "INVALID_CURSOR");
    const candidateCursor = parseNonNegativeCursor(
      request.nextUrl.searchParams.get("candidateCursor"),
      "INVALID_CANDIDATE_CURSOR",
    ) ?? 0;
    const latestHex = await rpc(network.rpcUrl, "eth_blockNumber", [], budget);
    if (typeof latestHex !== "string" || !/^0x[0-9a-f]+$/i.test(latestHex)) throw new Error("INVALID_LATEST_BLOCK");
    const latest = Number.parseInt(latestHex, 16);
    if (!cursorWithinLookback(latest, cursor, MAX_CURSOR_LOOKBACK)) {
      throw new Error("CURSOR_LOOKBACK_EXCEEDED");
    }
    const toBlock = Math.min(cursor ?? latest, latest);
    const fromBlock = Math.max(0, toBlock - CHUNK_SIZE * CHUNKS_PER_PAGE + 1);
    const chunks: Array<[number, number]> = [];
    for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
      chunks.push([start, Math.min(start + CHUNK_SIZE - 1, toBlock)]);
    }

    const logPages = await mapWithConcurrency(chunks, 2, ([from, to]) => rpc(network.rpcUrl, "eth_getLogs", [{
      address: network.consensus,
      topics: [NEW_TX_TOPIC],
      fromBlock: `0x${from.toString(16)}`,
      toBlock: `0x${to.toString(16)}`,
    }], budget));

    const seen = new Map<string, number>();
    let failedChunks = 0;
    for (const page of logPages) {
      if (page.status === "rejected" || !Array.isArray(page.value)) {
        failedChunks += 1;
        continue;
      }
      for (const rawLog of page.value) {
        if (!rawLog || typeof rawLog !== "object" || Array.isArray(rawLog)) continue;
        const log = rawLog as { topics?: unknown; blockNumber?: unknown };
        if (!Array.isArray(log.topics) || typeof log.topics[2] !== "string" || typeof log.blockNumber !== "string") continue;
        const address = extractAddress(log.topics[2]);
        const blockNumber = Number.parseInt(log.blockNumber, 16);
        if (!address || !Number.isSafeInteger(blockNumber)) continue;
        const previous = seen.get(address);
        if (previous === undefined || blockNumber < previous) seen.set(address, blockNumber);
      }
    }

    const allCandidates = sortCandidates(seen.entries());
    if (candidateCursor > allCandidates.length) throw new Error("INVALID_CANDIDATE_CURSOR");
    const candidatePlan = candidatePage(allCandidates, candidateCursor, MAX_SUBREQUESTS - budget.used);
    const discovered = await mapWithConcurrency(candidatePlan.candidates, 3, async ([address, blockNumber]) => {
      const schema = await getContractMethods(network, address, budget);
      if (schema.methods) {
        return { address, contract: { address, methods: schema.methods, blockNumber, network: networkName }, failed: false };
      }
      const ghost = await isGhostContract(network, address, budget);
      return {
        address,
        contract: ghost.isGhost ? { address, methods: [], blockNumber, network: networkName } : null,
        failed: candidateClassificationUnresolved({
          schemaFailed: schema.failed,
          ghostCheckFailed: ghost.failed,
          isGhost: ghost.isGhost,
        }),
      };
    });
    const contracts: ContractEntry[] = discovered
      .filter((item) => item.status === "fulfilled" && item.value.contract !== null)
      .map((item) => (item as PromiseFulfilledResult<{ address: string; contract: ContractEntry; failed: boolean }>).value.contract)
      .sort((a, b) => b.blockNumber - a.blockNumber);
    const candidateFailures = discovered.filter(
      (item) => item.status === "rejected" || (item.status === "fulfilled" && item.value.failed),
    ).length;
    const partial = failedChunks > 0 || candidateFailures > 0;
    const unresolvedCandidates = discovered.flatMap((item, index) =>
      item.status === "rejected" || item.value.failed
        ? [candidatePlan.candidates[index][0]]
        : [],
    );
    const olderCursor = fromBlock > 0 ? fromBlock - 1 : null;
    const { continuation, retryContinuation } = planContinuations({
      failedChunks,
      candidateFailures,
      candidateCursor,
      nextCandidateCursor: candidatePlan.nextCandidateCursor,
      toBlock,
      olderCursor,
    });

    return NextResponse.json({
      contracts,
      pagination: {
        fromBlock,
        toBlock,
        nextCursor: continuation?.cursor ?? null,
        nextCandidateCursor: continuation?.candidateCursor ?? null,
        continuation,
        retryContinuation,
        complete: continuation === null && !partial,
      },
      coverage: {
        candidatesFound: allCandidates.length,
        candidateOffset: candidateCursor,
        candidatesProcessed: candidatePlan.candidates.length,
        candidatesRemaining: Math.max(0, allCandidates.length - candidateCursor - candidatePlan.candidates.length),
        logChunksTotal: chunks.length,
        logChunksSucceeded: chunks.length - failedChunks,
      },
      partial,
      failures: { logChunks: failedChunks, candidates: candidateFailures, unresolvedCandidates },
      budget: { used: budget.used, limit: MAX_SUBREQUESTS },
    }, {
      headers: { ...CORS, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    if (error instanceof RpcPolicyError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        {
          status: error.status,
          headers: {
            ...CORS,
            ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}),
          },
        },
      );
    }
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = code === "INVALID_CURSOR" || code === "INVALID_CANDIDATE_CURSOR" || code === "CURSOR_LOOKBACK_EXCEEDED" ? 400 : 502;
    console.warn(JSON.stringify({ event: "contract_discovery_failed", network: networkName, code, subrequests: budget.used }));
    return NextResponse.json(
      { error: code, partial: true, budget: { used: budget.used, limit: MAX_SUBREQUESTS } },
      { status, headers: CORS },
    );
  }
}
