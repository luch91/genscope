"use client";
import { useSceneState } from "../../hooks/useSceneState";
import Block from "./Block";
import TransactionOrb from "./TransactionOrb";
import { BLOCK_STEP } from "../../lib/constants";

export default function BlockTower() {
  // Targeted selectors — only re-render when these specific slices change
  const blocks = useSceneState((s) => s.blocks);
  const selectedBlockNumber = useSceneState((s) => s.selectedBlockNumber);
  const selectedTxHash = useSceneState((s) => s.selectedTxHash);
  const setSelectedTx = useSceneState((s) => s.setSelectedTx);

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

      {/* Ground plane */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial
          color="#0a0a18"
          transparent
          opacity={0.6}
          roughness={1}
        />
      </mesh>

      <gridHelper
        args={[20, 20, "#00FF8822", "#00FF8811"]}
        position={[0, 0.06, 0]}
      />
    </group>
  );
}
