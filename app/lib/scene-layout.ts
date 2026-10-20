import {
  BLOCK_HEIGHT,
  BLOCK_STEP,
  GRID_FLOOR_CLEARANCE,
  SCENE_VISIBLE_BLOCKS_DESKTOP,
  SCENE_VISIBLE_BLOCKS_MOBILE,
} from "./constants";

export type DefaultCameraFrame = {
  targetY: number;
  x: number;
  y: number;
  z: number;
};

export function sceneVisibleBlockCount(viewportWidth: number): number {
  return viewportWidth < 600
    ? SCENE_VISIBLE_BLOCKS_MOBILE
    : SCENE_VISIBLE_BLOCKS_DESKTOP;
}

export function blockPositionY(index: number): number {
  return index * -BLOCK_STEP;
}

export function sceneFloorY(viewportWidth: number): number {
  const visibleCount = sceneVisibleBlockCount(viewportWidth);
  return blockPositionY(visibleCount - 1) - BLOCK_HEIGHT / 2 - GRID_FLOOR_CLEARANCE;
}

export function sceneBlockWindow<T>(
  blocks: T[],
  selectedIndex: number,
  viewportWidth: number,
): T[] {
  const limit = sceneVisibleBlockCount(viewportWidth);
  if (blocks.length <= limit) return blocks;
  if (selectedIndex < 0 || selectedIndex < limit) return blocks.slice(0, limit);

  const halfWindow = Math.floor(limit / 2);
  const start = Math.min(
    Math.max(0, selectedIndex - halfWindow),
    blocks.length - limit,
  );
  return blocks.slice(start, start + limit);
}

/**
 * A fixed presentation frame keeps the grid and tower composition stable while
 * the store hydrates. `blockCount` remains in the signature for callers and to
 * make the hydration-invariance contract explicit.
 */
export function defaultCameraFrame(blockCount: number, viewportWidth: number): DefaultCameraFrame {
  void blockCount;
  const mobile = viewportWidth < 600;
  const visibleCount = sceneVisibleBlockCount(viewportWidth);
  const towerHeight = (visibleCount - 1) * BLOCK_STEP;
  const targetY = -towerHeight / 2;
  const distance = mobile ? 15.5 : 15;

  return {
    targetY,
    x: distance * (mobile ? 0.46 : 0.58),
    y: targetY + (mobile ? 4.1 : 4.5),
    z: distance,
  };
}
