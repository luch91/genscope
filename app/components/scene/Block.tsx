"use client";
import { useRef, useState, useEffect, memo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Block as BlockType } from "../../types";
import {
  BLOCK_DEPTH,
  BLOCK_HEIGHT,
  BLOCK_WIDTH,
  COLORS,
  GLOW_DURATION,
} from "../../lib/constants";
import { blockPositionY } from "../../lib/scene-layout";
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

  const transformRef = useRef<THREE.Group>(null);
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
  const targetY = blockPositionY(index);

  // Animate new block dropping in
  useEffect(() => {
    if (isNewRef.current && index === 0) {
      isNewRef.current = false;
      let bounceTimer: ReturnType<typeof setTimeout>;
      let glowTimer: ReturnType<typeof setTimeout>;
      const frame = requestAnimationFrame(() => {
        setBouncing(true);
        setGlowing(true);
        bounceStartRef.current = performance.now();
        bounceTimer = setTimeout(() => setBouncing(false), 520);
        glowTimer = setTimeout(() => setGlowing(false), GLOW_DURATION);
      });
      return () => {
        cancelAnimationFrame(frame);
        clearTimeout(bounceTimer);
        clearTimeout(glowTimer);
      };
    }
  }, [index]);

  // Wake up useFrame whenever animated state changes
  useEffect(() => {
    needsUpdateRef.current = true;
  }, [bouncing, hovered, isSelected, glowing, targetY]);

  useFrame((_, delta) => {
    if (!transformRef.current) return;
    // Skip work when fully settled — major perf gain with 100 blocks
    if (!needsUpdateRef.current) return;

    const now = performance.now();
    let y = targetY;

    if (bouncing) {
      const elapsed = (now - bounceStartRef.current) / 1000;
      const bounce = Math.max(0, Math.sin(elapsed * 14) * Math.exp(-elapsed * 7));
      y = targetY + bounce * 0.32;
    }

    // Position lerp
    const posDiff = y - transformRef.current.position.y;
    // Frame-rate independent damping avoids prolonged intersections when a
    // busy mobile GPU drops frames during hydration.
    const positionAlpha = 1 - Math.exp(-delta * 14);
    const scaleAlpha = 1 - Math.exp(-delta * 10);
    const opacityAlpha = 1 - Math.exp(-delta * 8);
    transformRef.current.position.y += posDiff * positionAlpha;

    // Scale lerp
    const targetScale = hovered || isSelected ? 1.04 : 1.0;
    transformRef.current.scale.x += (targetScale - transformRef.current.scale.x) * scaleAlpha;
    transformRef.current.scale.z += (targetScale - transformRef.current.scale.z) * scaleAlpha;

    // Edge opacity lerp
    if (edgesRef.current) {
      const mat = edgesRef.current.material as THREE.LineBasicMaterial;
      const targetOpacity = glowing ? 1.0 : isSelected || hovered ? 0.95 : 0.58;
      mat.opacity += (targetOpacity - mat.opacity) * opacityAlpha;

      // Mark settled when all lerps have converged
      const posSettled = Math.abs(posDiff) < 0.001;
      const scaleSettled = Math.abs(transformRef.current.scale.x - targetScale) < 0.001;
      const opacitySettled = Math.abs(mat.opacity - targetOpacity) < 0.005;
      if (posSettled && scaleSettled && opacitySettled && !bouncing && !hovered && !isSelected && !glowing) {
        needsUpdateRef.current = false;
      }
    }
  });

  const initialY = index === 0 ? targetY + 2.5 : targetY;

  return (
    <group ref={transformRef} position={[0, initialY, 0]}>
      <mesh
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
          roughness={0.28}
          metalness={0.48}
          emissive={glowing || isSelected ? glowColor : baseColor}
          emissiveIntensity={glowing ? 0.72 : isSelected ? 0.42 : 0.14}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>

      {/* Edge glow lines */}
      <lineSegments
        ref={edgesRef}
        geometry={SHARED_EDGES}
        renderOrder={2}
      >
        <lineBasicMaterial
          color={glowColor}
          transparent
          opacity={0.58}
          depthTest
          depthWrite={false}
          linewidth={1}
        />
      </lineSegments>

      {/* Tooltip on hover */}
      {hovered && !isSelected && (
        <Html
          position={[0, BLOCK_HEIGHT + 0.16, 0]}
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
