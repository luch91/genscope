import { BLOCK_STEP } from "./constants";

export type DefaultCameraFrame = {
  targetY: number;
  x: number;
  y: number;
  z: number;
};

/** Keep the initial tower readable without letting its height shrink the floor. */
export function defaultCameraFrame(blockCount: number, viewportWidth: number): DefaultCameraFrame {
  const towerHeight = Math.max(0, blockCount - 1) * BLOCK_STEP;
  const mobile = viewportWidth < 600;
  const targetY = towerHeight === 0 ? 0 : -towerHeight / 2;
  const baseDistance = mobile ? 14 : 12;
  const maxDistance = mobile ? 22 : 20;
  const distance = Math.min(maxDistance, Math.max(baseDistance, towerHeight * 0.62 + 12));

  return {
    targetY,
    x: distance * (mobile ? 0.52 : 0.62),
    y: targetY + Math.min(6, Math.max(3.5, towerHeight * 0.18)),
    z: distance,
  };
}
