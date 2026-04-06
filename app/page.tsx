"use client";
import dynamic from "next/dynamic";
import DataOrchestrator from "./components/DataOrchestrator";
import StatsBar from "./components/ui/StatsBar";
import LiveFeed from "./components/ui/LiveFeed";
import TransactionPanel from "./components/ui/TransactionPanel";
import BlockInfoOverlay from "./components/ui/BlockInfoOverlay";
import HelpHint from "./components/ui/HelpHint";

// Load Three.js canvas client-side only (no SSR)
const Scene = dynamic(() => import("./components/scene/Scene"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#080810",
        color: "#00FF88",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 14,
        letterSpacing: "0.1em",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>◈</div>
        <div>INITIALIZING GENSCOPE</div>
        <div style={{ color: "#333", fontSize: 11, marginTop: 8 }}>
          Connecting to Bradbury Testnet...
        </div>
      </div>
    </div>
  ),
});

export default function Home() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#080810",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Data fetching hooks */}
      <DataOrchestrator />

      {/* Top stats bar */}
      <StatsBar />

      {/* Left live feed sidebar */}
      <LiveFeed />

      {/* 3D canvas — sits below the fixed UI layers */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
        }}
      >
        <Scene />
      </div>

      {/* Block explosion info overlay */}
      <BlockInfoOverlay />

      {/* Help hint */}
      <HelpHint />

      {/* Right transaction detail panel */}
      <TransactionPanel />
    </div>
  );
}
