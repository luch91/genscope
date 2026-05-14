import { NextRequest, NextResponse } from "next/server";

// ─── Network config ───────────────────────────────────────────────────────────

const RPC_URLS: Record<string, string> = {
  "testnet-bradbury": "https://rpc-bradbury.genlayer.com",
  "testnet-asimov":   "https://rpc.asimov.genlayer.com",
  studionet:          "https://studio.genlayer.com/api",
};

const CONSENSUS_CONTRACTS: Record<string, string> = {
  "testnet-bradbury": "0x0112Bf6e83497965A5fdD6Dad1E447a6E004271D",
  "testnet-asimov":   "0x6CAFF6769d70824745AD895663409DC70aB5B28E",
  studionet:          "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575",
};

// ─── Constants ────────────────────────────────────────────────────────────────

// keccak256('NewTransaction(bytes32,address,address)')
const NEW_TX_TOPIC =
  "0xdab9102861c7483a187584d6371d88316f005af507982ccf95c110879f3ed5a5";

// keccak256('ghostContracts(address)')[0:4]
const GHOST_SELECTOR = "0x7440c21b";

const CHUNK_SIZE = 10_000;  // node-enforced max block range per eth_getLogs call
const MAX_SCAN   = 500_000; // total window (≤50 parallel chunks)
const MAX_CANDIDATES = 100;

// ─── CORS headers (all responses) ────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// ─── RPC helper ───────────────────────────────────────────────────────────────

async function rpc(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal:  AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return json.result;
}

// ─── IC helpers ───────────────────────────────────────────────────────────────

function extractAddress(paddedTopic: string): string {
  return "0x" + paddedTopic.slice(26).toLowerCase();
}

async function getContractMethods(
  rpcUrl: string,
  addr: string,
): Promise<string[] | null> {
  try {
    const schema = (await rpc(rpcUrl, "gen_getContractSchema", [addr])) as {
      methods?: Record<string, unknown>;
    };
    return schema?.methods ? Object.keys(schema.methods) : null;
  } catch {
    return null;
  }
}

async function isGhostContract(
  rpcUrl: string,
  consensusAddr: string,
  addr: string,
): Promise<boolean> {
  try {
    const calldata =
      GHOST_SELECTOR + addr.slice(2).toLowerCase().padStart(64, "0");
    const result = (await rpc(rpcUrl, "eth_call", [
      { to: consensusAddr, data: calldata },
      "latest",
    ])) as string;
    return BigInt(result) === BigInt(1);
  } catch {
    return false;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export type ContractEntry = {
  address:     string;
  methods:     string[];
  blockNumber: number;
  network:     string;
};

export async function GET(req: NextRequest) {
  const network = req.nextUrl.searchParams.get("network") ?? "testnet-bradbury";
  const rpcUrl      = RPC_URLS[network];
  const consensusAddr = CONSENSUS_CONTRACTS[network];

  if (!rpcUrl || !consensusAddr) {
    return NextResponse.json(
      { error: `Unknown network: ${network}` },
      { status: 400, headers: CORS },
    );
  }

  try {
    // 1. Latest block — bounds the scan window
    const latestHex = (await rpc(rpcUrl, "eth_blockNumber", [])) as string;
    const latest = parseInt(latestHex, 16);

    // 2. Build 10,000-block chunks over [scanFrom, latest]
    //    Young chains (< MAX_SCAN blocks) are scanned from block 0 — full history
    const scanFrom = Math.max(0, latest - MAX_SCAN);
    const chunks: [number, number][] = [];
    for (let start = scanFrom; start <= latest; start += CHUNK_SIZE) {
      chunks.push([start, Math.min(start + CHUNK_SIZE - 1, latest)]);
    }

    // 3. Fetch all chunks in parallel — each within the 10,000-block node limit
    const chunkResults = await Promise.allSettled(
      chunks.map(([from, to]) =>
        rpc(rpcUrl, "eth_getLogs", [
          {
            address:   consensusAddr,
            topics:    [NEW_TX_TOPIC],
            fromBlock: "0x" + from.toString(16),
            toBlock:   "0x" + to.toString(16),
          },
        ]),
      ),
    );

    // 4. Flatten and deduplicate — keep earliest block seen per recipient
    const seen = new Map<string, number>();
    for (const result of chunkResults) {
      if (result.status !== "fulfilled") continue;
      const logs = result.value as Array<{
        topics: string[];
        blockNumber: string;
      }>;
      for (const log of logs) {
        if (log.topics.length < 3) continue;
        const addr  = extractAddress(log.topics[2]);
        const block = parseInt(log.blockNumber, 16);
        const prev  = seen.get(addr);
        if (prev === undefined || block < prev) seen.set(addr, block);
      }
    }

    const candidates = Array.from(seen.entries()).slice(0, MAX_CANDIDATES);

    // 5. Confirm ICs and fetch schemas in parallel
    const icResults = await Promise.allSettled(
      candidates.map(async ([addr, blockNumber]) => {
        const methods = await getContractMethods(rpcUrl, addr);
        if (methods !== null) return { address: addr, methods, blockNumber, network };
        const isIC = await isGhostContract(rpcUrl, consensusAddr, addr);
        if (!isIC) return null;
        return { address: addr, methods: [], blockNumber, network };
      }),
    );

    const contracts: ContractEntry[] = icResults
      .filter(
        (r): r is PromiseFulfilledResult<ContractEntry> =>
          r.status === "fulfilled" && r.value !== null,
      )
      .map((r) => r.value)
      .sort((a, b) => b.blockNumber - a.blockNumber);

    return NextResponse.json(contracts, {
      headers: {
        ...CORS,
        "Cache-Control": "s-maxage=60, stale-while-revalidate=30",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message },
      { status: 502, headers: CORS },
    );
  }
}
