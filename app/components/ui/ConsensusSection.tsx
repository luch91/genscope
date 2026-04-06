"use client";
import type { GenLayerTransaction } from "../../types";
import { truncateAddress, decodeEqOutputs } from "../../lib/parsers";
import { useState } from "react";

export default function ConsensusSection({ tx }: { tx: GenLayerTransaction }) {
  const [expandedRound, setExpandedRound] = useState<number | null>(null);
  const [showValidators, setShowValidators] = useState(false);

  const lastRound = tx.roundData[tx.roundData.length - 1];
  const finalResult = lastRound?.result ?? "UNDETERMINED";

  return (
    <div
      style={{
        marginTop: 16,
        borderTop: "1px solid #1a1a2e",
        paddingTop: 12,
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#FFD700",
            boxShadow: "0 0 6px #FFD700",
          }}
        />
        <span
          style={{
            color: "#FFD700",
            fontWeight: 700,
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.1em",
          }}
        >
          AI CONSENSUS
        </span>
      </div>

      {/* Summary row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <StatCard label="Validators" value={tx.numOfInitialValidators} />
        <StatCard label="Rounds" value={tx.roundData.length} />
      </div>

      {/* Final result */}
      <div
        style={{
          background: "rgba(255,215,0,0.08)",
          border: "1px solid #FFD70033",
          borderRadius: 6,
          padding: "6px 10px",
          marginBottom: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ color: "#888", fontSize: 11 }}>Final Result</span>
        <span
          style={{
            color:
              finalResult === "AGREE" || finalResult === "AGREED"
                ? "#00FF88"
                : "#FFD700",
            fontWeight: 700,
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {finalResult || "UNDETERMINED"}
        </span>
      </div>

      {/* Equivalence outputs */}
      <div
        style={{
          background: "rgba(0,0,0,0.3)",
          borderRadius: 6,
          padding: "6px 10px",
          marginBottom: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ color: "#888", fontSize: 11 }}>Eq. Outputs</span>
        <span
          style={{
            color: "#00FF88",
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {decodeEqOutputs(tx.eqBlocksOutputs)}
        </span>
      </div>

      {/* Rounds */}
      {tx.roundData.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{ color: "#666", fontSize: 10, marginBottom: 6 }}
          >
            CONSENSUS ROUNDS
          </div>
          {tx.roundData.map((round) => {
            const isExpanded = expandedRound === round.round;
            const total = round.votesCommitted;
            const revealed = round.votesRevealed;
            const ratio = total > 0 ? revealed / total : 0;

            return (
              <div
                key={round.round}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #1a1a2e",
                  borderRadius: 6,
                  marginBottom: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "6px 10px",
                    cursor: "pointer",
                    gap: 8,
                  }}
                  onClick={() =>
                    setExpandedRound(isExpanded ? null : round.round)
                  }
                >
                  <span
                    style={{
                      color: "#FFD700",
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                      minWidth: 50,
                    }}
                  >
                    Round {round.round}
                  </span>
                  <span style={{ color: "#666", fontSize: 10 }}>
                    Leader #{round.leaderIndex}
                  </span>
                  <div style={{ flex: 1 }} />
                  {/* Vote bar */}
                  <div
                    style={{
                      width: 50,
                      height: 4,
                      background: "#1a1a2e",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${ratio * 100}%`,
                        height: "100%",
                        background: "#00FF88",
                        borderRadius: 2,
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      color: "#888",
                      fontSize: 9,
                      minWidth: 40,
                      textAlign: "right",
                    }}
                  >
                    {revealed}/{total}
                  </span>
                  <span style={{ color: "#555", fontSize: 10 }}>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>

                {isExpanded && (
                  <div
                    style={{
                      borderTop: "1px solid #1a1a2e",
                      padding: "6px 10px",
                    }}
                  >
                    <div
                      style={{
                        color: "#00FF88",
                        fontSize: 10,
                        marginBottom: 4,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      Result: {round.result || "—"}
                    </div>
                    <div style={{ color: "#555", fontSize: 9 }}>
                      Rotations left: {round.rotationsLeft}
                    </div>
                    {round.roundValidators?.slice(0, 3).map((v, i) => (
                      <div
                        key={i}
                        style={{
                          color: "#444",
                          fontSize: 9,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {truncateAddress(v, 5)}
                      </div>
                    ))}
                    {(round.roundValidators?.length ?? 0) > 3 && (
                      <div style={{ color: "#444", fontSize: 9 }}>
                        +{(round.roundValidators?.length ?? 0) - 3} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Consumed validators */}
      {tx.consumedValidators?.length > 0 && (
        <div>
          <button
            onClick={() => setShowValidators(!showValidators)}
            style={{
              background: "none",
              border: "1px solid #1a1a2e",
              borderRadius: 4,
              color: "#666",
              fontSize: 10,
              padding: "4px 8px",
              cursor: "pointer",
              width: "100%",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {showValidators ? "▲" : "▼"} Validators (
            {tx.consumedValidators.length})
          </button>
          {showValidators && (
            <div
              style={{
                marginTop: 6,
                maxHeight: 100,
                overflowY: "auto",
              }}
            >
              {tx.consumedValidators.map((v, i) => (
                <div
                  key={i}
                  style={{
                    color: "#555",
                    fontSize: 9,
                    fontFamily: "'JetBrains Mono', monospace",
                    padding: "2px 0",
                    borderBottom: "1px solid #111",
                  }}
                >
                  {truncateAddress(v, 8)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div
      style={{
        background: "rgba(255,215,0,0.05)",
        border: "1px solid #FFD70022",
        borderRadius: 6,
        padding: "6px 8px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          color: "#FFD700",
          fontWeight: 700,
          fontSize: 16,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {value}
      </div>
      <div style={{ color: "#666", fontSize: 9 }}>{label}</div>
    </div>
  );
}
