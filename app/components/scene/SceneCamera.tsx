"use client";
import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useSceneState } from "../../hooks/useSceneState";
import { BLOCK_STEP } from "../../lib/constants";

export default function SceneCamera() {
  const { camera } = useThree();
  const { selectedBlockNumber, blocks } = useSceneState();
  const controlsRef = useRef<any>(null);
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));
  const positionRef = useRef(new THREE.Vector3(6, 4, 8));

  // Set initial camera position
  useEffect(() => {
    camera.position.set(6, 4, 8);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  // Animate camera when selection changes
  useEffect(() => {
    if (selectedBlockNumber !== null) {
      const blockIndex = blocks.findIndex(
        (b) => b.number === selectedBlockNumber
      );
      if (blockIndex !== -1) {
        const blockY = blockIndex * -BLOCK_STEP;
        targetRef.current.set(0, blockY, 0);
        positionRef.current.set(5, blockY + 3, 6);
      }
    } else {
      targetRef.current.set(0, 0, 0);
      positionRef.current.set(6, 4, 8);
    }
  }, [selectedBlockNumber, blocks]);

  useFrame(() => {
    if (!controlsRef.current) return;
    // Smooth camera transition
    const speed = 0.05;
    controlsRef.current.target.lerp(targetRef.current, speed);
    camera.position.lerp(positionRef.current, speed);
    controlsRef.current.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      minDistance={3}
      maxDistance={30}
      maxPolarAngle={Math.PI / 1.6}
    />
  );
}
