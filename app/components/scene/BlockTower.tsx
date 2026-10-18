"use client";
import { useSceneState } from "../../hooks/useSceneState";
import Block from "./Block";
import TransactionOrb from "./TransactionOrb";
import { Grid } from "@react-three/drei";
import {
  BLOCK_HEIGHT,
  BLOCK_STEP,
  GRID_DIVISIONS,
  GRID_FLOOR_CLEARANCE,
  GRID_SIZE,
} from "../../lib/constants";

export default function BlockTower() {
  // Targeted selectors — only re-render when these specific slices change
  const blocks = useSceneState((s) => s.blocks);
  const selectedBlockNumber = useSceneState((s) => s.selectedBlockNumber);
  const selectedTxHash = useSceneState((s) => s.selectedTxHash);
  const setSelectedTx = useSceneState((s) => s.setSelectedTx);
  // Anchor the floor beneath the oldest rendered block. The camera frames the
  // same vertical span, so the illuminated grid remains part of the scene
  // rather than falling out of view as the initial block window hydrates.
  const towerFloor =
    -Math.max(0, blocks.length - 1) * BLOCK_STEP -
    BLOCK_HEIGHT / 2 -
    GRID_FLOOR_CLEARANCE;

  return (
    <group>
      {blocks.map((block, index) => {
        const isSelected = block.number === selectedBlockNumber;
        const blockY = index * -BLOCK_STEP;

        return (
          <group key={block.number}>
            <Block
              block={block}
              index={index}
              isSelected={isSelected}
            />

            {/* Transaction orbs when block is selected */}
            {isSelected &&
              block.txDetails.map((tx, txIndex) => (
                <TransactionOrb
                  key={tx.hash}
                  tx={tx}
                  index={txIndex}
                  total={block.txDetails.length}
                  blockY={blockY}
                  isSelected={selectedTxHash === tx.hash}
                  onClick={() => setSelectedTx(tx.hash)}
                />
              ))}
          </group>
        );
      })}

      {/* A single, inexpensive floor draw plus one grid draw keeps the scene
          grounded before, during, and after block hydration. */}
      <mesh position={[0, towerFloor, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GRID_SIZE, GRID_SIZE]} />
        <meshStandardMaterial
          color="#07120f"
          transparent
          opacity={0.72}
          roughness={1}
          depthWrite={false}
        />
      </mesh>

      <Grid
        args={[GRID_SIZE, GRID_SIZE]}
        position={[0, towerFloor + 0.012, 0]}
        cellSize={GRID_SIZE / GRID_DIVISIONS}
        cellThickness={0.55}
        cellColor="#126642"
        sectionSize={4}
        sectionThickness={1.15}
        sectionColor="#1acb7d"
        fadeDistance={GRID_SIZE * 0.72}
        fadeStrength={1.25}
        infiniteGrid={false}
        followCamera={false}
      />
    </group>
  );
}
