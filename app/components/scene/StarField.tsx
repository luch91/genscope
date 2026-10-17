"use client";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { STAR_COUNT, STAR_SPREAD } from "../../lib/constants";

function seededCoordinate(index: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return (value - Math.floor(value) - 0.5) * STAR_SPREAD;
}

export default function StarField() {
  const meshRef = useRef<THREE.Points>(null);
  const { mouse } = useThree();

  const geometry = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      positions[i * 3] = seededCoordinate(i * 3);
      positions[i * 3 + 1] = seededCoordinate(i * 3 + 1);
      positions[i * 3 + 2] = seededCoordinate(i * 3 + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  useFrame(() => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x +=
      (mouse.y * 0.02 - meshRef.current.rotation.x) * 0.02;
    meshRef.current.rotation.y +=
      (mouse.x * 0.02 - meshRef.current.rotation.y) * 0.02;
  });

  return (
    <points ref={meshRef} geometry={geometry}>
      <pointsMaterial
        size={0.08}
        color="#aaccff"
        transparent
        opacity={0.7}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}
