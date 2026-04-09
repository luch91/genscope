"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useSceneState } from "../../hooks/useSceneState";
import { fetchAndAddBlock } from "../../hooks/useBlocks";
import { getTransactionReceipt } from "../../lib/genlayer";
import { parseReceipt, truncateHash, truncateAddress } from "../../lib/parsers";
import { formatDistanceToNow } from "date-fns";
import type { Block, GenLayerTransaction } from "../../types";
import StatusBadge from "./StatusBadge";

// ── Query detection ────────────────────────────────────────────────────────────

type QueryKind = "block" | "tx" | "address" | "unknown";

interface DetectedQuery {
  kind: QueryKind;
  blockNumber?: number;
  hash?: string;
  address?: string;
}

function detectQuery(raw: string): DetectedQuery {
  const q = raw.trim();
  if (!q) return { kind: "unknown" };
  if (/^\d+$/.test(q)) return { kind: "block", blockNumber: parseInt(q, 10) };
  if (/^0x[0-9a-fA-F]{64}$/.test(q)) return { kind: "tx", hash: q.toLowerCase() };
  if (/^0x[0-9a-fA-F]{40}$/.test(q)) return { kind: "address", address: q.toLowerCase() };
  return { kind: "unknown" };
}

// ── Result types ───────────────────────────────────────────────────────────────

type SearchResult =
  | { kind: "block"; block: Block }
  | { kind: "tx"; tx: GenLayerTransaction }
  | { kind: "address"; address: string; txs: GenLayerTransaction[] }
  | { kind: "error"; message: string }
  | { kind: "empty"; message: string };

// ── Component ──────────────────────────────────────────────────────────────────

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { blocks, transactions, setSelectedBlock, setSelectedTx } = useSceneState();

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const runSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q) { setResult(null); setOpen(false); return; }

    const detected = detectQuery(q);
    setLoading(true);
    setOpen(true);

    try {
      if (detected.kind === "block") {
        const num = detected.blockNumber!;
        // Check store first
        const cached = blocks.find((b) => b.number === num);
        if (cached) {
          setResult({ kind: "block", block: cached });
        } else {
          const fetched = await fetchAndAddBlock(num);
          if (fetched !== null) {
            // Block was added to store; grab it
            const fresh = useSceneState.getState().blocks.find((b) => b.number === num);
            if (fresh) {
              setResult({ kind: "block", block: fresh });
            } else {
              setResult({ kind: "error", message: `Block #${num} not found` });
            }
          } else {
            setResult({ kind: "error", message: `Block #${num} not found on chain` });
          }
        }
        return;
      }

      if (detected.kind === "tx") {
        const hash = detected.hash!; // already lowercased by detectQuery
        const allTxsList = Object.values(transactions);

        // 1. Check store by ETH tx hash (case-insensitive)
        const cachedByEthHash = allTxsList.find(
          (tx) => tx.hash.toLowerCase() === hash
        );
        if (cachedByEthHash) {
          setResult({ kind: "tx", tx: cachedByEthHash });
          return;
        }

        // 2. Check store by GenLayer TX ID (tx.id — separate from ETH hash)
        const cachedById = allTxsList.find(
          (tx) => tx.id.toLowerCase() === hash
        );
        if (cachedById) {
          setResult({ kind: "tx", tx: cachedById });
          return;
        }

        // 3. Fetch from chain via gen_getTransactionReceipt.
        //    Accepts both the ETH tx hash (from block) and the GenLayer TX ID.
        const raw = await getTransactionReceipt(hash);
        if (raw) {
          const blockForTx = blocks.find((b) =>
            b.transactions.some((h) => h.toLowerCase() === hash)
          );
          const tx = parseReceipt(raw, hash, blockForTx?.number);
          const store = useSceneState.getState();
          if (blockForTx) {
            // Block is loaded — attach tx to the block's txDetails
            if (!blockForTx.txDetails.some((t) => t.hash === tx.hash)) {
              store.updateBlockTxDetails(blockForTx.number, [...blockForTx.txDetails, tx]);
            }
          } else {
            // Block not yet loaded — add tx directly to the transactions map
            // so TransactionPanel can find it by selectedTxHash
            store.addTransaction(tx);
          }
          setResult({ kind: "tx", tx });
          return;
        }

        setResult({ kind: "error", message: "Transaction not found on Bradbury." });
        return;
      }

      if (detected.kind === "address") {
        const addr = detected.address!;
        const allTxs = Object.values(transactions);
        const matched = allTxs.filter(
          (tx) =>
            tx.sender.toLowerCase() === addr ||
            tx.recipient.toLowerCase() === addr ||
            tx.activator.toLowerCase() === addr
        );
        if (matched.length > 0) {
          setResult({ kind: "address", address: addr, txs: matched });
        } else {
          setResult({
            kind: "empty",
            message: "No indexed transactions found for this address. Try loading more blocks.",
          });
        }
        return;
      }

      setResult({ kind: "error", message: "Enter a block number, tx hash (0x…64), or address (0x…40)" });
    } catch (err) {
      setResult({ kind: "error", message: err instanceof Error ? err.message : "Search failed" });
    } finally {
      setLoading(false);
    }
  }, [blocks, transactions]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") runSearch(query);
    if (e.key === "Escape") { setOpen(false); setQuery(""); setResult(null); }
  }

  function handleBlockClick(blockNumber: number) {
    setSelectedBlock(blockNumber);
    setOpen(false);
    setQuery("");
    setResult(null);
  }

  function handleTxClick(tx: GenLayerTransaction) {
    if (tx.blockNumber) setSelectedBlock(tx.blockNumber);
    setSelectedTx(tx.hash);
    setOpen(false);
    setQuery("");
    setResult(null);
  }

  const detected = detectQuery(query);
  const kindLabel: Record<QueryKind, string> = {
    block: "Block",
    tx: "Transaction",
    address: "Address / Contract",
    unknown: "",
  };

  return (
    <div
      ref={wrapperRef}
      style={{ position: "relative", width: "100%", maxWidth: 480 }}
    >
      {/* Input row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${open ? "#00FF8855" : "#1a1a2e"}`,
          borderRadius: 8,
          padding: "0 12px",
          gap: 8,
          transition: "border-color 0.15s",
        }}
      >
        {/* Search icon */}
        <span style={{ color: loading ? "#00FF88" : "#444", fontSize: 13, flexShrink: 0 }}>
          {loading ? "⟳" : "⌕"}
        </span>

        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) { setResult(null); setOpen(false); }
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (result) setOpen(true); }}
          placeholder="Search block №, tx hash, or address…"
          style={{
            flex: 1,
            background: "none",
            border: "none",
            outline: "none",
            color: "#fff",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            padding: "7px 0",
          }}
          spellCheck={false}
          autoComplete="off"
        />

        {/* Kind hint */}
        {query && detected.kind !== "unknown" && (
          <span
            style={{
              color: "#00FF88",
              fontSize: 9,
              fontFamily: "'JetBrains Mono', monospace",
              background: "rgba(0,255,136,0.08)",
              border: "1px solid #00FF8833",
              borderRadius: 4,
              padding: "1px 5px",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {kindLabel[detected.kind]}
          </span>
        )}

        {/* Clear */}
        {query && (
          <button
            onClick={() => { setQuery(""); setResult(null); setOpen(false); }}
            style={{
              background: "none",
              border: "none",
              color: "#444",
              cursor: "pointer",
              fontSize: 14,
              padding: 0,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        )}

        {/* Search button */}
        <button
          onClick={() => runSearch(query)}
          style={{
            background: "rgba(0,255,136,0.1)",
            border: "1px solid #00FF8833",
            borderRadius: 4,
            color: "#00FF88",
            cursor: "pointer",
            fontSize: 10,
            padding: "3px 8px",
            fontFamily: "'JetBrains Mono', monospace",
            flexShrink: 0,
          }}
        >
          GO
        </button>
      </div>

      {/* Dropdown results */}
      {open && result && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "rgba(8,8,20,0.98)",
            border: "1px solid #1a1a2e",
            borderRadius: 8,
            zIndex: 200,
            maxHeight: 400,
            overflowY: "auto",
            boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
          }}
        >
          {result.kind === "error" && (
            <ResultMessage color="#ff4444" text={result.message} icon="✕" />
          )}

          {result.kind === "empty" && (
            <ResultMessage color="#FFD700" text={result.message} icon="○" />
          )}

          {result.kind === "block" && (
            <BlockResult block={result.block} onClick={() => handleBlockClick(result.block.number)} />
          )}

          {result.kind === "tx" && (
            <TxResult tx={result.tx} onClick={() => handleTxClick(result.tx)} />
          )}

          {result.kind === "address" && (
            <>
              <div
                style={{
                  padding: "8px 12px",
                  color: "#555",
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  borderBottom: "1px solid #1a1a2e",
                }}
              >
                {result.txs.length} transaction{result.txs.length !== 1 ? "s" : ""} found for{" "}
                <span style={{ color: "#00FF88" }}>{truncateAddress(result.address, 6)}</span>
              </div>
              {result.txs.slice(0, 20).map((tx) => (
                <TxResult key={tx.hash} tx={tx} onClick={() => handleTxClick(tx)} compact />
              ))}
              {result.txs.length > 20 && (
                <div style={{ padding: "6px 12px", color: "#444", fontSize: 10, textAlign: "center" }}>
                  +{result.txs.length - 20} more (load more blocks to see all)
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ResultMessage({ color, text, icon }: { color: string; text: string; icon: string }) {
  return (
    <div
      style={{
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        color,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      }}
    >
      <span>{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function BlockResult({ block, onClick }: { block: Block; onClick: () => void }) {
  const intelligentCount = block.txDetails.filter((t) => t.isIntelligent).length;
  const standardCount = block.txDetails.filter((t) => !t.isIntelligent).length;
  const timeAgo = block.timestamp
    ? formatDistanceToNow(new Date(block.timestamp * 1000), { addSuffix: true })
    : "";

  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 16px",
        cursor: "pointer",
        borderBottom: "1px solid #0d0d1a",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "rgba(0,255,136,0.04)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}
    >
      <div
        style={{
          width: 32,
          height: 32,
          background: "rgba(0,255,136,0.1)",
          border: "1px solid #00FF8833",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        ◼
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ color: "#00FF88", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13 }}>
            Block #{block.number.toLocaleString()}
          </span>
          <span style={{ color: "#555", fontSize: 10 }}>{timeAgo}</span>
        </div>
        <div style={{ color: "#555", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {truncateHash(block.hash, 10)}
        </div>
        <div style={{ marginTop: 3, display: "flex", gap: 8 }}>
          <span style={{ color: "#aaa", fontSize: 10 }}>{block.transactions.length} txs</span>
          {intelligentCount > 0 && <span style={{ color: "#FFD700", fontSize: 10 }}>⚡ {intelligentCount} intelligent</span>}
          {standardCount > 0 && <span style={{ color: "#4488ff", fontSize: 10 }}>→ {standardCount} standard</span>}
        </div>
      </div>
      <span style={{ color: "#444", fontSize: 12 }}>→</span>
    </div>
  );
}

function TxResult({ tx, onClick, compact }: { tx: GenLayerTransaction; onClick: () => void; compact?: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: compact ? "8px 12px" : "12px 16px",
        cursor: "pointer",
        borderBottom: "1px solid #0d0d1a",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}
    >
      <span style={{ fontSize: compact ? 12 : 16, flexShrink: 0 }}>
        {tx.isIntelligent ? "⚡" : "→"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span
            style={{
              color: tx.isIntelligent ? "#FFD700" : "#4488ff",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {truncateHash(tx.hash, 8)}
          </span>
          <StatusBadge status={tx.status} small />
        </div>
        {!compact && (
          <div style={{ color: "#555", fontFamily: "'JetBrains Mono', monospace", fontSize: 9 }}>
            {truncateAddress(tx.sender, 6)} → {tx.recipient ? truncateAddress(tx.recipient, 6) : "deploy"}
          </div>
        )}
        {tx.blockNumber && (
          <div style={{ color: "#333", fontSize: 9 }}>Block #{tx.blockNumber}</div>
        )}
      </div>
      <span style={{ color: "#444", fontSize: 12, flexShrink: 0 }}>→</span>
    </div>
  );
}
