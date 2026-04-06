"use client";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import StarField from "./StarField";
import BlockTower from "./BlockTower";
import SceneCamera from "./SceneCamera";

export default function Scene() {
  return (
    <Canvas
      camera={{ position: [6, 4, 8], fov: 50 }}
      style={{ background: "#080810", width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
    >
      <color attach="background" args={["#080810"]} />
      <fog attach="fog" args={["#080810", 30, 80]} />

      {/* Lighting */}
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 10, 5]} intensity={0.4} color="#aaccff" />
      <pointLight position={[0, 5, 0]} intensity={0.3} color="#00FF88" />
      <pointLight position={[0, -10, 0]} intensity={0.2} color="#4488ff" />

      <Suspense fallback={null}>
        <StarField />
        <BlockTower />
        <SceneCamera />
      </Suspense>

      {/* Post-processing: Bloom for glowing elements */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.4}
          luminanceSmoothing={0.9}
          intensity={0.8}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}
