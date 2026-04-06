"use client";
import type { TransactionStatus } from "../../types";

const STATUS_STYLES: Record<
  TransactionStatus,
  { bg: string; text: string; border: string }
> = {
  UNINITIALIZED: {
    bg: "rgba(100,100,100,0.2)",
    text: "#888",
    border: "#555",
  },
  PENDING: {
    bg: "rgba(255,215,0,0.15)",
    text: "#FFD700",
    border: "#FFD70066",
  },
  ACCEPTED: {
    bg: "rgba(68,136,255,0.15)",
    text: "#4488ff",
    border: "#4488ff66",
  },
  FINALIZED: {
    bg: "rgba(0,255,136,0.15)",
    text: "#00FF88",
    border: "#00FF8866",
  },
  CANCELED: {
    bg: "rgba(255,68,68,0.15)",
    text: "#ff4444",
    border: "#ff444466",
  },
};

export default function StatusBadge({
  status,
  small,
}: {
  status: TransactionStatus;
  small?: boolean;
}) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.UNINITIALIZED;
  return (
    <span
      style={{
        background: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
        borderRadius: 4,
        padding: small ? "1px 6px" : "2px 8px",
        fontSize: small ? 9 : 11,
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 600,
        letterSpacing: "0.05em",
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}
