"use client";
import { useSceneState } from "../../hooks/useSceneState";

export default function BlockInfoOverlay() {
  const { selectedBlockNumber, blocks, setSelectedBlock } = useSceneState();

  const block = selectedBlockNumber != null
    ? blocks.find((b) => b.number === selectedBlockNumber)
    : null;

  if (!block) return null;

  const loading = block.transactions.length > 0 && block.txDetails.length === 0;
  const intelligentCount = block.txDetails.filter((t) => t.isIntelligent).length;
  const standardCount = block.txDetails.filter((t) => !t.isIntelligent).length;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(8,8,20,0.92)",
        border: "1px solid #1a1a2e",
        borderRadius: 10,
        padding: "10px 20px",
        zIndex: 55,
        display: "flex",
        alignItems: "center",
        gap: 16,
        backdropFilter: "blur(10px)",
        boxShadow: "0 0 24px rgba(0,255,136,0.1)",
      }}
    >
      <div>
        <div
          style={{
            color: "#00FF88",
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Block #{block.number}
        </div>
        <div style={{ color: "#555", fontSize: 10 }}>
          {block.hash?.slice(0, 18)}...
        </div>
      </div>

      <div style={{ width: 1, height: 32, background: "#1a1a2e" }} />

      {loading ? (
        <div
          style={{
            color: "#FFD700",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
          }}
        >
          Loading {block.transactions.length} transactions...
        </div>
      ) : block.transactions.length === 0 ? (
        <div style={{ color: "#444", fontSize: 11 }}>Empty block</div>
      ) : (
        <>
          <Stat
            label="Total"
            value={block.txDetails.length}
            color="#aaa"
          />
          {standardCount > 0 && (
            <Stat label="Standard" value={standardCount} color="#4488ff" />
          )}
          {intelligentCount > 0 && (
            <Stat label="⚡ Intelligent" value={intelligentCount} color="#FFD700" />
          )}
        </>
      )}

      <div style={{ width: 1, height: 32, background: "#1a1a2e" }} />

      <button
        onClick={() => setSelectedBlock(null)}
        style={{
          background: "none",
          border: "1px solid #1a1a2e",
          borderRadius: 4,
          color: "#555",
          cursor: "pointer",
          padding: "4px 10px",
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        ✕ Close
      </button>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          color,
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 700,
          fontSize: 16,
        }}
      >
        {value}
      </div>
      <div style={{ color: "#555", fontSize: 9 }}>{label}</div>
    </div>
  );
}
