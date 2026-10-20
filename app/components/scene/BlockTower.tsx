"use client";
import { useSceneState } from "../../hooks/useSceneState";
import Block from "./Block";
import TransactionOrb from "./TransactionOrb";
import { Grid } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import {
  GRID_CELL_SIZE,
  GRID_FADE_DISTANCE,
  GRID_SIZE,
} from "../../lib/constants";
import {
  blockPositionY,
  sceneBlockWindow,
  sceneFloorY,
} from "../../lib/scene-layout";

export default function BlockTower() {
  // Targeted selectors — only re-render when these specific slices change
  const blocks = useSceneState((s) => s.blocks);
  const selectedBlockNumber = useSceneState((s) => s.selectedBlockNumber);
  const selectedTxHash = useSceneState((s) => s.selectedTxHash);
  const setSelectedTx = useSceneState((s) => s.setSelectedTx);
  const viewportWidth = useThree((state) => state.size.width);
  const selectedIndex = blocks.findIndex(
    (block) => block.number === selectedBlockNumber,
  );
  const sceneBlocks = sceneBlockWindow(blocks, selectedIndex, viewportWidth);
  // The floor is tied to the presentation window, not hydration progress.
  const towerFloor = sceneFloorY(viewportWidth);

  return (
    <group>
      {sceneBlocks.map((block, index) => {
        const isSelected = block.number === selectedBlockNumber;
        const blockY = blockPositionY(index);

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
        cellSize={GRID_CELL_SIZE}
        cellThickness={0.65}
        cellColor="#1a9b62"
        sectionSize={4}
        sectionThickness={1.6}
        sectionColor="#32f39a"
        fadeDistance={GRID_FADE_DISTANCE}
        fadeStrength={0.85}
        infiniteGrid
        followCamera={false}
      />
    </group>
  );
}
