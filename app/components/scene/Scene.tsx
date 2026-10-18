"use client";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useState } from "react";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import StarField from "./StarField";
import BlockTower from "./BlockTower";
import SceneCamera from "./SceneCamera";
import { useSceneState } from "../../hooks/useSceneState";

export default function Scene() {
  const hasBlocks = useSceneState((state) => state.blocks.length > 0);
  const [canvasReady, setCanvasReady] = useState(false);
  const [compactGpu, setCompactGpu] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px), (prefers-reduced-motion: reduce)");
    const update = () => setCompactGpu(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <div className="scene-shell">
      {!hasBlocks && (
        <div className="scene-loading" role="status" aria-live="polite">
          <span className="scene-loading__pulse" />
          Loading the latest Bradbury blocks…
        </div>
      )}
      <Canvas
      fallback={
        <div role="alert" style={{ color: "#ddd", padding: 24, background: "#080810" }}>
          The 3D explorer requires WebGL. Blockchain data remains available through search and the live feed.
        </div>
      }
      camera={{ position: [6, 4, 8], fov: 50 }}
      style={{ background: "#080810", width: "100%", height: "100%" }}
      gl={{ antialias: !compactGpu, alpha: false, powerPreference: "high-performance" }}
      dpr={[1, compactGpu ? 1.15 : 1.5]}
      performance={{ min: 0.5 }}
      onCreated={() => setCanvasReady(true)}
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
      {!compactGpu && (
        <EffectComposer multisampling={0}>
          <Bloom
            luminanceThreshold={0.5}
            luminanceSmoothing={0.5}
            intensity={0.5}
          />
        </EffectComposer>
      )}
      </Canvas>
      {!canvasReady && <div className="scene-loading">Preparing WebGL…</div>}
    </div>
  );
}
