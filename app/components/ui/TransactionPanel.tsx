"use client";
import { useState } from "react";
import { useSceneState } from "../../hooks/useSceneState";
import StatusBadge from "./StatusBadge";
import ConsensusSection from "./ConsensusSection";
import { truncateAddress, truncateHash, parseFunctionSelector } from "../../lib/parsers";
import { format } from "date-fns";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        background: "none",
        border: "none",
        color: copied ? "#00FF88" : "#555",
        cursor: "pointer",
        fontSize: 11,
        padding: "0 4px",
        lineHeight: 1,
      }}
      title="Copy"
    >
      {copied ? "✓" : "⎘"}
    </button>
  );
}

function Field({
  label,
  value,
  copyValue,
  accent,
}: {
  label: string;
  value: string;
  copyValue?: string;
  accent?: string;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: "#555", fontSize: 10, marginBottom: 2 }}>{label}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: "rgba(255,255,255,0.03)",
          borderRadius: 4,
          padding: "4px 8px",
          border: "1px solid #1a1a2e",
        }}
      >
        <span
          style={{
            color: accent ?? "#aaa",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            flex: 1,
            wordBreak: "break-all",
          }}
        >
          {value}
        </span>
        {copyValue && <CopyButton value={copyValue} />}
      </div>
    </div>
  );
}

function formatTs(ts: string): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return format(d, "MMM d, yyyy HH:mm:ss");
  } catch {
    return ts;
  }
}

export default function TransactionPanel() {
  const { selectedTxHash, transactions, setSelectedTx, selectedBlockNumber, blocks, setSelectedBlock } =
    useSceneState();

  const tx = selectedTxHash ? transactions[selectedTxHash] : null;
  const selectedBlock = selectedBlockNumber != null
    ? blocks.find((b) => b.number === selectedBlockNumber)
    : null;

  const isVisible = tx !== null && tx !== undefined;

  return (
    <div
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 0,
        width: isVisible ? 320 : 0,
        transition: "width 0.3s ease",
        background: "rgba(8,8,20,0.96)",
        borderLeft: isVisible ? "1px solid #1a1a2e" : "none",
        overflow: "hidden",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {isVisible && tx && (
        <div
          style={{
            padding: 16,
            overflowY: "auto",
            flex: 1,
            scrollbarWidth: "thin",
            scrollbarColor: "#1a1a2e #080810",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>
                {tx.isIntelligent ? "⚡" : "→"}
              </span>
              <span
                style={{
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Transaction
              </span>
            </div>
            <button
              onClick={() => setSelectedTx(null)}
              style={{
                background: "none",
                border: "1px solid #1a1a2e",
                borderRadius: 4,
                color: "#555",
                cursor: "pointer",
                padding: "2px 8px",
                fontSize: 14,
              }}
            >
              ✕
            </button>
          </div>

          {/* Status */}
          <div style={{ marginBottom: 12 }}>
            <StatusBadge status={tx.status} />
          </div>

          {/* Hash */}
          <Field
            label="TX HASH"
            value={truncateHash(tx.hash, 10)}
            copyValue={tx.hash}
            accent="#00FF88"
          />

          {/* From / To */}
          <Field
            label="FROM"
            value={truncateAddress(tx.sender, 8)}
            copyValue={tx.sender}
          />
          <Field
            label="TO"
            value={
              tx.recipient
                ? truncateAddress(tx.recipient, 8)
                : "Contract Deploy"
            }
            copyValue={tx.recipient}
          />

          {tx.activator && tx.activator !== tx.sender && (
            <Field
              label="ACTIVATOR"
              value={truncateAddress(tx.activator, 8)}
              copyValue={tx.activator}
            />
          )}

          {/* Function selector */}
          {tx.txData && tx.txData.length > 2 && (
            <Field
              label="FUNCTION SELECTOR"
              value={parseFunctionSelector(tx.txData)}
              accent="#4488ff"
            />
          )}

          {/* Timestamps */}
          <div
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid #1a1a2e",
              borderRadius: 6,
              padding: "8px 10px",
              marginBottom: 10,
            }}
          >
            <div style={{ color: "#555", fontSize: 10, marginBottom: 6 }}>
              TIMESTAMPS
            </div>
            {[
              ["Created", tx.timestamps.Created],
              ["Activated", tx.timestamps.Activated],
              ["Committed", tx.timestamps.Committed],
            ].map(([label, val]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span style={{ color: "#555", fontSize: 10 }}>{label}</span>
                <span
                  style={{
                    color: "#888",
                    fontSize: 10,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {formatTs(val)}
                </span>
              </div>
            ))}
          </div>

          {/* Block range */}
          {tx.readStateBlockRange && (
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid #1a1a2e",
                borderRadius: 6,
                padding: "8px 10px",
                marginBottom: 10,
              }}
            >
              <div style={{ color: "#555", fontSize: 10, marginBottom: 4 }}>
                BLOCK RANGE
              </div>
              {[
                ["Activation", tx.readStateBlockRange.ActivationBlock],
                ["Processing", tx.readStateBlockRange.ProcessingBlock],
                ["Proposal", tx.readStateBlockRange.ProposalBlock],
              ].map(([label, val]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 2,
                  }}
                >
                  <span style={{ color: "#555", fontSize: 10 }}>{label}</span>
                  <span
                    style={{
                      color: "#4488ff",
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    #{val}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* AI Consensus section for intelligent contracts */}
          {tx.isIntelligent && <ConsensusSection tx={tx} />}
        </div>
      )}
    </div>
  );
}
