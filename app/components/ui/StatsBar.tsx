"use client";
import { useState, useEffect, useRef } from "react";
import { useSceneState } from "../../hooks/useSceneState";
import { getBlockByNumber } from "../../lib/genlayer";
import { truncateHash, truncateAddress } from "../../lib/parsers";
import { formatDistanceToNow } from "date-fns";
import SearchBar from "./SearchBar";
import StatusBadge from "./StatusBadge";
import type { RawBlock } from "../../lib/genlayer";

const STATUS_COLORS = {
  live: { color: "#00FF88", bg: "rgba(0,255,136,0.1)", border: "#00FF8833" },
  syncing: { color: "#FFD700", bg: "rgba(255,215,0,0.1)", border: "#FFD70033" },
  reconnecting: { color: "#ff4444", bg: "rgba(255,68,68,0.1)", border: "#ff444433" },
};

type PanelKind = "block" | "verified" | "txs" | null;

export default function StatsBar() {
  const {
    blocks,
    transactions,
    totalTxCount,
    intelligentTxCount,
    activeValidators,
    networkStatus,
    syncStatus,
    latestBlockNumber,
    setSelectedBlock,
    setSelectedTx,
  } = useSceneState();

  const [openPanel, setOpenPanel] = useState<PanelKind>(null);
  const [liveBlock, setLiveBlock] = useState<RawBlock | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const latestLoaded = blocks[0]?.number ?? 0;
  const intelligentPct =
    totalTxCount > 0 ? Math.round((intelligentTxCount / totalTxCount) * 100) : 0;

  const statusStyle = STATUS_COLORS[networkStatus];
  const statusLabel = {
    live: "LIVE",
    syncing: `SYNCING · ${syncStatus.blocksBehind} behind`,
    reconnecting: "RECONNECTING",
  }[networkStatus];

  const verifiedBlocks = latestBlockNumber > 0 ? latestBlockNumber + 1 : 0;

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpenPanel(null);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function togglePanel(kind: PanelKind) {
    if (openPanel === kind) {
      setOpenPanel(null);
      return;
    }
    setOpenPanel(kind);
    if (kind === "verified" && latestBlockNumber > 0) {
      setLoadingLive(true);
      setLiveBlock(null);
      getBlockByNumber(latestBlockNumber, true)
        .then((b) => setLiveBlock(b))
        .catch(() => setLiveBlock(null))
        .finally(() => setLoadingLive(false));
    }
  }

  function handleBlockStatClick() {
    if (latestLoaded > 0) {
      setSelectedBlock(latestLoaded);
    }
    togglePanel("block");
  }

  const allTxs = Object.values(transactions).sort((a, b) => (b.blockNumber ?? 0) - (a.blockNumber ?? 0));

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        backdropFilter: "blur(10px)",
        background: "rgba(8,8,20,0.96)",
        borderBottom: "1px solid #1a1a2e",
      }}
    >
      {/* Row 1: Logo + Stats + Status */}
      <div
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 4,
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 12, flexShrink: 0 }}>
          <div
            style={{
              width: 26,
              height: 26,
              background: "linear-gradient(135deg, #00FF88, #FFD700)",
              borderRadius: 5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 900,
              color: "#080810",
              fontFamily: "'JetBrains Mono', monospace",
              flexShrink: 0,
            }}
          >
            G
          </div>
          <span
            style={{
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.05em",
            }}
          >
            GenScope
          </span>
        </div>

        <Divider />

        {/* BLOCK — clickable, zooms scene to latest loaded block */}
        <ClickableStatItem
          label="BLOCK"
          value={latestLoaded > 0 ? `#${latestLoaded.toLocaleString()}` : "—"}
          accent="#00FF88"
          active={openPanel === "block"}
          onClick={handleBlockStatClick}
          title="Jump to latest loaded block"
        />
        <Divider />

        {/* VERIFIED — clickable, shows live chain head info */}
        <ClickableStatItem
          label="VERIFIED"
          value={verifiedBlocks > 0 ? verifiedBlocks.toLocaleString() : "—"}
          accent="#aaffcc"
          active={openPanel === "verified"}
          onClick={() => togglePanel("verified")}
          title="View live chain head"
        />
        <Divider />

        {/* INDEXED TXS — clickable, shows all indexed transactions */}
        <ClickableStatItem
          label="INDEXED TXS"
          value={totalTxCount.toLocaleString()}
          accent="#aaa"
          active={openPanel === "txs"}
          onClick={() => togglePanel("txs")}
          title="Browse indexed transactions"
        />
        <Divider />

        <StatItem label="INTELLIGENT" value={totalTxCount > 0 ? `${intelligentPct}%` : "—"} accent="#FFD700" />
        <Divider />
        <StatItem label="VALIDATORS" value={activeValidators.size > 0 ? activeValidators.size.toString() : "—"} accent="#4488ff" />

        <div style={{ flex: 1 }} />

        {/* Network status badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: statusStyle.bg,
            border: `1px solid ${statusStyle.border}`,
            borderRadius: 20,
            padding: "4px 12px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: statusStyle.color,
              boxShadow: `0 0 6px ${statusStyle.color}`,
            }}
          />
          <span
            style={{
              color: statusStyle.color,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Row 2: Search bar */}
      <div
        style={{
          height: 40,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          borderTop: "1px solid #0d0d1a",
          gap: 8,
        }}
      >
        <SearchBar />
      </div>

      {/* ── Dropdown panels ─────────────────────────────────────────────────── */}

      {/* BLOCK panel — just a quick confirmation that the scene jumped */}
      {openPanel === "block" && latestLoaded > 0 && (
        <DropPanel onClose={() => setOpenPanel(null)}>
          <PanelHeader icon="◼" title={`Block #${latestLoaded.toLocaleString()}`} color="#00FF88" />
          <div style={{ padding: "8px 16px 12px" }}>
            <div style={{ color: "#555", fontSize: 10, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
              {truncateHash(blocks[0]?.hash ?? "", 12)}
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
              <StatPill label="Txs" value={blocks[0]?.transactions.length.toString() ?? "0"} color="#aaa" />
              <StatPill label="Loaded" value={`${blocks.length} blocks`} color="#aaffcc" />
            </div>
            {blocks[0]?.timestamp && (
              <div style={{ color: "#444", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
                {formatDistanceToNow(new Date(blocks[0].timestamp * 1000), { addSuffix: true })}
              </div>
            )}
            <div style={{ color: "#00FF8866", fontSize: 9, marginTop: 6 }}>
              Scene navigated to this block ↑
            </div>
          </div>
        </DropPanel>
      )}

      {/* VERIFIED panel — live chain head */}
      {openPanel === "verified" && (
        <DropPanel onClose={() => setOpenPanel(null)}>
          <PanelHeader icon="◈" title="Live Chain Head" color="#aaffcc" />
          <div style={{ padding: "8px 16px 12px" }}>
            {loadingLive ? (
              <div style={{ color: "#555", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                Fetching block #{latestBlockNumber.toLocaleString()}…
              </div>
            ) : liveBlock ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                  <span style={{ color: "#aaffcc", fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                    #{parseInt(liveBlock.number, 16).toLocaleString()}
                  </span>
                  {liveBlock.timestamp && (
                    <span style={{ color: "#555", fontSize: 10 }}>
                      {formatDistanceToNow(new Date(parseInt(liveBlock.timestamp, 16) * 1000), { addSuffix: true })}
                    </span>
                  )}
                </div>
                <div style={{ color: "#333", fontSize: 9, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>
                  {truncateHash(liveBlock.hash, 14)}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <StatPill label="Txs" value={Array.isArray(liveBlock.transactions) ? liveBlock.transactions.length.toString() : "0"} color="#aaa" />
                  <StatPill label="Gas used" value={parseInt(liveBlock.gasUsed, 16).toLocaleString()} color="#4488ff" />
                  <StatPill label="Miner" value={truncateAddress(liveBlock.miner, 4)} color="#888" />
                </div>
                {latestLoaded < parseInt(liveBlock.number, 16) && (
                  <div style={{ color: "#FFD70066", fontSize: 9, marginTop: 8 }}>
                    {parseInt(liveBlock.number, 16) - latestLoaded} blocks ahead of loaded view
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: "#ff444466", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                Could not fetch block data
              </div>
            )}
          </div>
        </DropPanel>
      )}

      {/* INDEXED TXS panel — list of all indexed transactions */}
      {openPanel === "txs" && (
        <DropPanel onClose={() => setOpenPanel(null)} wide>
          <PanelHeader icon="◉" title={`${totalTxCount.toLocaleString()} Indexed Transactions`} color="#aaa" />
          <div
            style={{
              maxHeight: 320,
              overflowY: "auto",
              scrollbarWidth: "thin",
              scrollbarColor: "#1a1a2e #080810",
            }}
          >
            {allTxs.length === 0 ? (
              <div style={{ padding: "12px 16px", color: "#444", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                No transactions indexed yet…
              </div>
            ) : (
              allTxs.map((tx) => (
                <div
                  key={tx.hash}
                  onClick={() => {
                    if (tx.blockNumber) setSelectedBlock(tx.blockNumber);
                    setSelectedTx(tx.hash);
                    setOpenPanel(null);
                  }}
                  style={{
                    padding: "7px 16px",
                    borderBottom: "1px solid #0d0d1a",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}
                >
                  <span style={{ fontSize: 11, flexShrink: 0 }}>{tx.isIntelligent ? "⚡" : "→"}</span>
                  <span
                    style={{
                      color: tx.isIntelligent ? "#FFD700" : "#4488ff",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {truncateHash(tx.hash, 8)}
                  </span>
                  <span style={{ color: "#444", fontSize: 9, flexShrink: 0 }}>
                    {truncateAddress(tx.sender, 4)}
                  </span>
                  {tx.blockNumber && (
                    <span style={{ color: "#2a2a4a", fontSize: 9, flexShrink: 0 }}>#{tx.blockNumber}</span>
                  )}
                  <StatusBadge status={tx.status} small />
                </div>
              ))
            )}
          </div>
          {totalTxCount > 0 && (
            <div style={{ padding: "6px 16px", borderTop: "1px solid #1a1a2e", color: "#333", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
              {intelligentTxCount} intelligent · {totalTxCount - intelligentTxCount} standard
            </div>
          )}
        </DropPanel>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DropPanel({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        right: wide ? 0 : undefined,
        width: wide ? undefined : 280,
        background: "rgba(8,8,20,0.98)",
        border: "1px solid #1a1a2e",
        borderTop: "none",
        borderRadius: "0 0 8px 8px",
        zIndex: 200,
        boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
      }}
    >
      {children}
    </div>
  );
}

function PanelHeader({ icon, title, color }: { icon: string; title: string; color: string }) {
  return (
    <div
      style={{
        padding: "8px 16px",
        borderBottom: "1px solid #1a1a2e",
        display: "flex",
        alignItems: "center",
        gap: 8,
        color,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      <span>{icon}</span>
      <span>{title}</span>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid #1a1a2e",
        borderRadius: 4,
        padding: "3px 8px",
        display: "flex",
        gap: 5,
        alignItems: "center",
      }}
    >
      <span style={{ color: "#444", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
      <span style={{ color, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function ClickableStatItem({
  label,
  value,
  accent,
  active,
  onClick,
  title,
}: {
  label: string;
  value: string;
  accent: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "0 10px",
        background: active ? "rgba(255,255,255,0.05)" : "none",
        border: active ? `1px solid ${accent}33` : "1px solid transparent",
        borderRadius: 6,
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        height: 40,
        justifyContent: "center",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = "none";
      }}
    >
      <span
        style={{
          color: accent,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
      <span
        style={{
          color: active ? accent + "99" : "#3a3a5a",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 8,
          letterSpacing: "0.08em",
          marginTop: 1,
        }}
      >
        {label} ↓
      </span>
    </button>
  );
}

function StatItem({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 10px" }}>
      <span
        style={{
          color: accent,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
      <span
        style={{
          color: "#3a3a5a",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 8,
          letterSpacing: "0.08em",
          marginTop: 1,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 22, background: "#1a1a2e", flexShrink: 0 }} />;
}
