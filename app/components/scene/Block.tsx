"use client";
import { useRef, useState, useEffect, memo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Block as BlockType } from "../../types";
import {
  BLOCK_WIDTH,
  BLOCK_HEIGHT,
  BLOCK_DEPTH,
  BLOCK_STEP,
  COLORS,
  GLOW_DURATION,
} from "../../lib/constants";
import { getBlockColorType } from "../../lib/classifiers";
import { useSceneState } from "../../hooks/useSceneState";
import { formatDistanceToNow } from "date-fns";

// Shared geometry — created once, reused by every Block instance
const SHARED_GEOMETRY = new THREE.BoxGeometry(BLOCK_WIDTH, BLOCK_HEIGHT, BLOCK_DEPTH);
const SHARED_EDGES = new THREE.EdgesGeometry(SHARED_GEOMETRY);

const COLOR_MAP = {
  empty: COLORS.blockEmpty,
  standard: COLORS.blockStandard,
  intelligent: COLORS.blockIntelligent,
  mixed: COLORS.blockMixed,
};

const GLOW_MAP = {
  empty: "#444466",
  standard: "#4488ff",
  intelligent: COLORS.gold,
  mixed: COLORS.neonGreen,
};

interface BlockProps {
  block: BlockType;
  index: number; // 0 = newest (top)
  isSelected: boolean;
}

function Block({ block, index, isSelected }: BlockProps) {
  const setSelectedBlock = useSceneState((s) => s.setSelectedBlock);

  const meshRef = useRef<THREE.Mesh>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);
  const [hovered, setHovered] = useState(false);
  const [bouncing, setBouncing] = useState(false);
  const [glowing, setGlowing] = useState(false);
  const bounceStartRef = useRef(0);
  const isNewRef = useRef(true);
  // Skip useFrame work when fully settled
  const needsUpdateRef = useRef(true);

  const colorType = getBlockColorType(
    block.hasIntelligent,
    block.hasStandard,
    block.transactions.length === 0
  );

  const baseColor = COLOR_MAP[colorType];
  const glowColor = GLOW_MAP[colorType];
  const targetY = index * -BLOCK_STEP;

  // Animate new block dropping in
  useEffect(() => {
    if (isNewRef.current && index === 0) {
      isNewRef.current = false;
      setBouncing(true);
      setGlowing(true);
      bounceStartRef.current = performance.now();
      setTimeout(() => setBouncing(false), 800);
      setTimeout(() => setGlowing(false), GLOW_DURATION);
    }
  }, [index]);

  // Wake up useFrame whenever animated state changes
  useEffect(() => {
    needsUpdateRef.current = true;
  }, [bouncing, hovered, isSelected, glowing, targetY]);

  useFrame(() => {
    if (!meshRef.current) return;
    // Skip work when fully settled — major perf gain with 100 blocks
    if (!needsUpdateRef.current) return;

    const now = performance.now();
    let y = targetY;

    if (bouncing) {
      const elapsed = (now - bounceStartRef.current) / 1000;
      const bounce = Math.max(0, Math.sin(elapsed * 12) * Math.exp(-elapsed * 5));
      y = targetY + bounce * 0.8;
    }

    // Position lerp
    const posDiff = y - meshRef.current.position.y;
    meshRef.current.position.y += posDiff * 0.15;

    // Keep edges in sync
    if (edgesRef.current) {
      edgesRef.current.position.y = meshRef.current.position.y;
    }

    // Scale lerp
    const targetScale = hovered || isSelected ? 1.04 : 1.0;
    meshRef.current.scale.x += (targetScale - meshRef.current.scale.x) * 0.1;
    meshRef.current.scale.z += (targetScale - meshRef.current.scale.z) * 0.1;

    // Edge opacity lerp
    if (edgesRef.current) {
      const mat = edgesRef.current.material as THREE.LineBasicMaterial;
      const targetOpacity = glowing ? 1.0 : isSelected || hovered ? 0.9 : 0.35;
      mat.opacity += (targetOpacity - mat.opacity) * 0.08;

      // Mark settled when all lerps have converged
      const posSettled = Math.abs(posDiff) < 0.001;
      const scaleSettled = Math.abs(meshRef.current.scale.x - targetScale) < 0.001;
      const opacitySettled = Math.abs(mat.opacity - targetOpacity) < 0.005;
      if (posSettled && scaleSettled && opacitySettled && !bouncing && !hovered && !isSelected && !glowing) {
        needsUpdateRef.current = false;
      }
    }
  });

  const initialY = index === 0 ? targetY + 5 : targetY;

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[0, initialY, 0]}
        geometry={SHARED_GEOMETRY}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedBlock(isSelected ? null : block.number);
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
        <meshStandardMaterial
          color={baseColor}
          transparent
          opacity={isSelected ? 0.3 : 0.85}
          roughness={0.2}
          metalness={0.6}
          emissive={glowing || isSelected ? glowColor : baseColor}
          emissiveIntensity={glowing ? 0.8 : isSelected ? 0.4 : 0.05}
        />
      </mesh>

      {/* Edge glow lines */}
      <lineSegments
        ref={edgesRef}
        position={[0, initialY, 0]}
        geometry={SHARED_EDGES}
      >
        <lineBasicMaterial
          color={glowColor}
          transparent
          opacity={0.35}
          linewidth={1}
        />
      </lineSegments>

      {/* Tooltip on hover */}
      {hovered && !isSelected && (
        <Html
          position={[0, initialY + BLOCK_HEIGHT, 0]}
          center
          distanceFactor={10}
          zIndexRange={[100, 0]}
          style={{ pointerEvents: "none" }}
        >
          <BlockTooltip block={block} colorType={colorType} />
        </Html>
      )}
    </group>
  );
}

export default memo(Block);

function BlockTooltip({
  block,
  colorType,
}: {
  block: BlockType;
  colorType: string;
}) {
  const typeLabel = {
    empty: "Empty Block",
    standard: "Standard Txs",
    intelligent: "Intelligent Contracts",
    mixed: "Mixed",
  }[colorType];

  const typeColorMap: Record<string, string> = {
    empty: "#888",
    standard: "#4488ff",
    intelligent: "#FFD700",
    mixed: "#00FF88",
  };
  const typeColor = typeColorMap[colorType] ?? "#888";

  const timeAgo = block.timestamp
    ? formatDistanceToNow(new Date(block.timestamp * 1000), { addSuffix: true })
    : "unknown";

  return (
    <div
      style={{
        background: "rgba(8,8,20,0.92)",
        border: `1px solid ${typeColor}`,
        borderRadius: 8,
        padding: "8px 12px",
        color: "#fff",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        lineHeight: 1.6,
        whiteSpace: "nowrap",
        boxShadow: `0 0 12px ${typeColor}44`,
        minWidth: 160,
      }}
    >
      <div style={{ color: typeColor, fontWeight: 700, marginBottom: 2 }}>
        Block #{block.number}
      </div>
      <div style={{ color: "#aaa", fontSize: 10 }}>{timeAgo}</div>
      <div style={{ marginTop: 4 }}>
        <span style={{ color: "#888" }}>Txs: </span>
        <span style={{ color: "#fff" }}>{block.transactions.length}</span>
      </div>
      <div>
        <span style={{ color: "#888" }}>Type: </span>
        <span style={{ color: typeColor }}>{typeLabel}</span>
      </div>
      <div style={{ color: "#555", fontSize: 9, marginTop: 4 }}>
        {block.hash?.slice(0, 14)}...
      </div>
    </div>
  );
}
