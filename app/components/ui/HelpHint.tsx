"use client";
import { useState } from "react";
import { useSceneState } from "../../hooks/useSceneState";

export default function HelpHint() {
  const [show, setShow] = useState(false);
  const { blocks } = useSceneState();

  if (blocks.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 55,
      }}
    >
      {show && (
        <div
          style={{
            background: "rgba(8,8,20,0.95)",
            border: "1px solid #1a1a2e",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 8,
            color: "#888",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            lineHeight: 1.8,
            maxWidth: 220,
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ color: "#00FF88", fontWeight: 700, marginBottom: 6 }}>
            Controls
          </div>
          <div>🖱️ Drag → Orbit camera</div>
          <div>🖱️ Scroll → Zoom</div>
          <div>👆 Click block → Explode view</div>
          <div>👆 Click orb → Tx details</div>
          <div style={{ marginTop: 8, color: "#444" }}>
            <span style={{ color: "#FFD700" }}>⚡</span> Gold orbs = Intelligent contracts
          </div>
          <div>
            <span style={{ color: "#4488ff" }}>●</span> Blue orbs = Standard txs
          </div>
        </div>
      )}
      <button
        onClick={() => setShow(!show)}
        style={{
          background: "rgba(8,8,20,0.9)",
          border: "1px solid #1a1a2e",
          borderRadius: "50%",
          width: 32,
          height: 32,
          color: show ? "#00FF88" : "#555",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginLeft: "auto",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        ?
      </button>
    </div>
  );
}
