"use client";
import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useSceneState } from "../../hooks/useSceneState";
import { BLOCK_STEP } from "../../lib/constants";

export default function SceneCamera() {
  const { camera, size } = useThree();
  const selectedBlockNumber = useSceneState((state) => state.selectedBlockNumber);
  const blocks = useSceneState((state) => state.blocks);
  const controlsRef = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));
  const positionRef = useRef(new THREE.Vector3(7, 2, 10));
  const reducedMotionRef = useRef(false);

  // Set initial camera position
  useEffect(() => {
    camera.position.set(7, 2, 10);
    camera.lookAt(0, -2.5, 0);
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, [camera]);

  // Keep the hydrated tower and its floor in one readable composition. This
  // runs only when the retained block window or viewport width changes.
  useEffect(() => {
    if (selectedBlockNumber !== null) return;
    const towerHeight = Math.max(0, blocks.length - 1) * BLOCK_STEP;
    const midpoint = -towerHeight / 2;
    const distance = Math.max(size.width < 600 ? 14 : 12, towerHeight * 1.9 + 12);
    targetRef.current.set(0, midpoint, 0);
    positionRef.current.set(
      size.width < 600 ? distance * 0.58 : distance * 0.64,
      midpoint + Math.max(3.5, towerHeight * 0.22),
      distance,
    );
  }, [blocks.length, selectedBlockNumber, size.width]);

  // Animate camera when selection changes
  useEffect(() => {
    if (selectedBlockNumber !== null) {
      const blockIndex = blocks.findIndex(
        (b) => b.number === selectedBlockNumber
      );
      if (blockIndex !== -1) {
        const blockY = blockIndex * -BLOCK_STEP;
        targetRef.current.set(0, blockY, 0);
        const distance = size.width < 600 ? 8.5 : 7;
        positionRef.current.set(distance * 0.72, blockY + 2.6, distance);
      }
    } else {
      const towerHeight = Math.max(0, blocks.length - 1) * BLOCK_STEP;
      const midpoint = -towerHeight / 2;
      const distance = Math.max(size.width < 600 ? 14 : 12, towerHeight * 1.9 + 12);
      targetRef.current.set(0, midpoint, 0);
      positionRef.current.set(
        size.width < 600 ? distance * 0.58 : distance * 0.64,
        midpoint + Math.max(3.5, towerHeight * 0.22),
        distance,
      );
    }
  }, [selectedBlockNumber, blocks, size.width]);

  useFrame(() => {
    if (!controlsRef.current) return;
    const speed = reducedMotionRef.current ? 1 : 0.05;
    const targetDist = controlsRef.current.target.distanceTo(targetRef.current);
    const posDist = camera.position.distanceTo(positionRef.current);
    // Only lerp when not yet settled (saves GPU time when camera is idle)
    if (targetDist > 0.001 || posDist > 0.001) {
      controlsRef.current.target.lerp(targetRef.current, speed);
      camera.position.lerp(positionRef.current, speed);
    }
    controlsRef.current.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      dampingFactor={0.05}
      minDistance={3}
      maxDistance={30}
      maxPolarAngle={Math.PI / 1.6}
    />
  );
}
