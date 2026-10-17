import { NextRequest, NextResponse } from "next/server";

const NETWORKS = {
  "testnet-bradbury": { rpcUrl: "https://rpc-bradbury.genlayer.com", consensus: "0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D", studio: false },
  "testnet-asimov": { rpcUrl: "https://rpc.asimov.genlayer.com", consensus: "0x6CAFF6769d70824745AD895663409DC70aB5B28E", studio: false },
  studionet: { rpcUrl: "https://studio.genlayer.com/api", consensus: "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575", studio: true },
} as const;

const NEW_TX_TOPIC = "0xdab9102861c7483a187584d6371d88316f005af507982ccf95c110879f3ed5a5";
const GHOST_SELECTOR = "0x7440c21b";
const CHUNK_SIZE = 10_000;
const CHUNKS_PER_PAGE = 4;
const MAX_CANDIDATES = 10;
const MAX_SUBREQUESTS = 45;
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
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > 2 * 1024 * 1024) throw new Error("RPC_RESPONSE_TOO_LARGE");
  if (!response.ok) throw new Error(`RPC_HTTP_${response.status}`);
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 2 * 1024 * 1024) throw new Error("RPC_RESPONSE_TOO_LARGE");
  const json = JSON.parse(text) as { result?: unknown; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "RPC_ERROR");
  return json.result;
}

function parseCursor(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d{1,12}$/.test(value)) throw new Error("INVALID_CURSOR");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("INVALID_CURSOR");
  return parsed;
}

function extractAddress(topic: string): string | null {
  return /^0x[0-9a-fA-F]{64}$/.test(topic) ? `0x${topic.slice(-40).toLowerCase()}` : null;
}

async function getContractMethods(
  network: (typeof NETWORKS)[NetworkName],
  address: string,
  budget: RequestBudget,
): Promise<string[] | null> {
  try {
    // Bradbury/Asimov accept {code}, not an address. Fetching code first mirrors current genlayer-js.
    const schema = network.studio
      ? await rpc(network.rpcUrl, "gen_getContractSchema", [address], budget)
      : await rpc(network.rpcUrl, "gen_getContractSchema", [{
          code: await rpc(network.rpcUrl, "gen_getContractCode", [{ address }], budget),
        }], budget);
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return null;
    const methods = (schema as Record<string, unknown>).methods;
    return methods && typeof methods === "object" && !Array.isArray(methods) ? Object.keys(methods) : null;
  } catch {
    return null;
  }
}

async function isGhostContract(
  network: (typeof NETWORKS)[NetworkName],
  address: string,
  budget: RequestBudget,
): Promise<boolean> {
  try {
    const data = GHOST_SELECTOR + address.slice(2).padStart(64, "0");
    const result = await rpc(network.rpcUrl, "eth_call", [{ to: network.consensus, data }, "latest"], budget);
    return typeof result === "string" && BigInt(result) === BigInt(1);
  } catch {
    return false;
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
    const cursor = parseCursor(request.nextUrl.searchParams.get("cursor"));
    const latestHex = await rpc(network.rpcUrl, "eth_blockNumber", [], budget);
    if (typeof latestHex !== "string" || !/^0x[0-9a-f]+$/i.test(latestHex)) throw new Error("INVALID_LATEST_BLOCK");
    const latest = Number.parseInt(latestHex, 16);
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

    const candidates = Array.from(seen.entries()).slice(0, MAX_CANDIDATES);
    const discovered = await mapWithConcurrency(candidates, 3, async ([address, blockNumber]) => {
      const methods = await getContractMethods(network, address, budget);
      if (methods) return { address, methods, blockNumber, network: networkName };
      return await isGhostContract(network, address, budget)
        ? { address, methods: [], blockNumber, network: networkName }
        : null;
    });
    const contracts: ContractEntry[] = discovered
      .filter((item): item is PromiseFulfilledResult<ContractEntry> => item.status === "fulfilled" && item.value !== null)
      .map((item) => item.value)
      .sort((a, b) => b.blockNumber - a.blockNumber);
    const nextCursor = fromBlock > 0 ? fromBlock - 1 : null;
    const candidateFailures = discovered.filter((item) => item.status === "rejected").length;
    const partial = failedChunks > 0 || candidateFailures > 0;

    return NextResponse.json({
      contracts,
      pagination: { fromBlock, toBlock, nextCursor, complete: nextCursor === null && !partial },
      partial,
      failures: { logChunks: failedChunks, candidates: candidateFailures },
      budget: { used: budget.used, limit: MAX_SUBREQUESTS },
    }, {
      headers: { ...CORS, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = code === "INVALID_CURSOR" ? 400 : 502;
    console.warn(JSON.stringify({ event: "contract_discovery_failed", network: networkName, code, subrequests: budget.used }));
    return NextResponse.json(
      { error: code, partial: true, budget: { used: budget.used, limit: MAX_SUBREQUESTS } },
      { status, headers: CORS },
    );
  }
}
