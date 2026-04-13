"use client";
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { GenLayerTransaction } from "../../types";
import {
  COLORS,
  ORB_RADIUS_INTELLIGENT,
  ORB_RADIUS_STANDARD,
} from "../../lib/constants";
import { truncateHash } from "../../lib/parsers";

interface TransactionOrbProps {
  tx: GenLayerTransaction;
  index: number;
  total: number;
  blockY: number;
  isSelected: boolean;
  onClick: () => void;
}

export default function TransactionOrb({
  tx,
  index,
  total,
  blockY,
  isSelected,
  onClick,
}: TransactionOrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Distribute orbs in a sphere/spiral around block
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const layer = Math.floor(index / 8);
  const radius = 2.0 + layer * 0.8;
  const yOffset = (layer % 2 === 0 ? 0.4 : -0.4) + (index % 2 === 0 ? 0.2 : -0.2);

  // Orbit speed per layer
  const orbitSpeed = 0.3 + layer * 0.15;
  const orbitRef = useRef(angle);

  const color = tx.isIntelligent ? COLORS.orbIntelligent : COLORS.orbStandard;
  const radius3d = tx.isIntelligent ? ORB_RADIUS_INTELLIGENT : ORB_RADIUS_STANDARD;

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    orbitRef.current += orbitSpeed * delta;

    const x = Math.cos(orbitRef.current) * radius;
    const z = Math.sin(orbitRef.current) * radius;
    const y = blockY + yOffset;

    meshRef.current.position.set(x, y, z);

    // Pulse animation for intelligent orbs
    if (tx.isIntelligent) {
      const pulse = Math.sin(Date.now() * 0.002 + index) * 0.08 + 1.0;
      meshRef.current.scale.setScalar(pulse);
    }

    // Hover scale
    if (hovered || isSelected) {
      meshRef.current.scale.multiplyScalar(1.3);
    }
  });

  return (
    <group>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[radius3d, 8, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={tx.isIntelligent ? 0.8 : 0.4}
          transparent
          opacity={0.9}
          roughness={0.1}
          metalness={0.5}
        />
      </mesh>

      {hovered && (
        <Html
          position={[0, 0, 0]}
          center
          distanceFactor={8}
          zIndexRange={[200, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: "rgba(8,8,20,0.95)",
              border: `1px solid ${color}`,
              borderRadius: 6,
              padding: "6px 10px",
              color: "#fff",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              whiteSpace: "nowrap",
              boxShadow: `0 0 10px ${color}66`,
            }}
          >
            <div style={{ color, fontWeight: 700 }}>
              {tx.isIntelligent ? "⚡ Intelligent" : "→ Standard"}
            </div>
            <div style={{ color: "#888", marginTop: 2 }}>
              {truncateHash(tx.hash, 6)}
            </div>
            <div style={{ color: "#aaa", fontSize: 9 }}>{tx.status}</div>
          </div>
        </Html>
      )}
    </group>
  );
}
