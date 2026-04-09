"use client";
import { useSceneState } from "../../hooks/useSceneState";
import { loadOlderBlocks } from "../../hooks/useBlocks";
import StatusBadge from "./StatusBadge";
import { truncateHash, truncateAddress } from "../../lib/parsers";
import { formatDistanceToNow } from "date-fns";

// StatsBar is now 92px tall (52px row1 + 40px row2)
const HEADER_HEIGHT = 92;

export default function LiveFeed() {
  const { blocks, setSelectedTx, setSelectedBlock, loadingOlder } = useSceneState();

  // Flatten all transactions across blocks, newest first, deduplicated by tx hash
  const seen = new Set<string>();
  const feedItems = blocks
    .flatMap((b) =>
      b.txDetails.map((tx) => ({
        tx,
        blockNumber: b.number,
        timestamp: b.timestamp,
      }))
    )
    .filter(({ tx }) => {
      if (seen.has(tx.hash)) return false;
      seen.add(tx.hash);
      return true;
    })
    .slice(0, 80);

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: HEADER_HEIGHT,
        bottom: 0,
        width: 220,
        background: "rgba(8,8,20,0.9)",
        borderRight: "1px solid #1a1a2e",
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #1a1a2e",
          color: "#00FF88",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#00FF88",
            boxShadow: "0 0 6px #00FF88",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        LIVE FEED
        <span style={{ marginLeft: "auto", color: "#333", fontSize: 9 }}>
          {feedItems.length} txs
        </span>
      </div>

      {/* Transaction list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          scrollbarWidth: "thin",
          scrollbarColor: "#1a1a2e #080810",
        }}
      >
        {feedItems.length === 0 ? (
          <div
            style={{
              padding: "20px 12px",
              color: "#333",
              fontSize: 11,
              textAlign: "center",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Loading transactions...
          </div>
        ) : (
          feedItems.map(({ tx, blockNumber, timestamp }) => (
            <div
              key={tx.hash}
              onClick={() => {
                setSelectedBlock(blockNumber);
                setSelectedTx(tx.hash);
              }}
              style={{
                padding: "7px 12px",
                borderBottom: "1px solid #0d0d1a",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}
              >
                <span style={{ fontSize: 11, flexShrink: 0 }}>
                  {tx.isIntelligent ? "⚡" : "→"}
                </span>
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
                  {truncateHash(tx.hash, 5)}
                </span>
                <StatusBadge status={tx.status} small />
              </div>

              <div
                style={{
                  color: "#555",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  marginBottom: 1,
                }}
              >
                {truncateAddress(tx.sender, 5)}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#2a2a4a", fontSize: 9 }}>#{blockNumber}</span>
                <span style={{ color: "#2a2a4a", fontSize: 9 }}>
                  {timestamp
                    ? formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true })
                    : ""}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer: blocks loaded + load older button */}
      <div
        style={{
          borderTop: "1px solid #1a1a2e",
          padding: "8px 12px",
          flexShrink: 0,
          background: "rgba(8,8,20,0.95)",
        }}
      >
        <div
          style={{
            color: "#333",
            fontSize: 9,
            fontFamily: "'JetBrains Mono', monospace",
            marginBottom: 6,
            textAlign: "center",
          }}
        >
          {useSceneState.getState().blocks.length} blocks loaded
        </div>
        <button
          onClick={() => loadOlderBlocks()}
          disabled={loadingOlder}
          style={{
            width: "100%",
            background: loadingOlder
              ? "rgba(255,255,255,0.02)"
              : "rgba(0,255,136,0.06)",
            border: `1px solid ${loadingOlder ? "#1a1a2e" : "#00FF8822"}`,
            borderRadius: 4,
            color: loadingOlder ? "#444" : "#00FF88",
            cursor: loadingOlder ? "not-allowed" : "pointer",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            padding: "5px 0",
            transition: "all 0.15s",
          }}
        >
          {loadingOlder ? "Loading…" : "↓ Load older blocks"}
        </button>
      </div>
    </div>
  );
}
