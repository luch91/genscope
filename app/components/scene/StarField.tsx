"use client";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { STAR_COUNT, STAR_SPREAD } from "../../lib/constants";

export default function StarField() {
  const meshRef = useRef<THREE.Points>(null);
  const { mouse } = useThree();

  const geometry = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * STAR_SPREAD;
      positions[i * 3 + 1] = (Math.random() - 0.5) * STAR_SPREAD;
      positions[i * 3 + 2] = (Math.random() - 0.5) * STAR_SPREAD;
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
