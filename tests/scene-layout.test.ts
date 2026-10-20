import { describe, expect, it } from "vitest";
import {
  blockPositionY,
  defaultCameraFrame,
  sceneBlockWindow,
  sceneFloorY,
  sceneVisibleBlockCount,
} from "../app/lib/scene-layout";
import { BLOCK_HEIGHT, BLOCK_STEP, GRID_FLOOR_CLEARANCE } from "../app/lib/constants";

describe("defaultCameraFrame", () => {
  it("does not recompose the scene as the block window hydrates", () => {
    expect(defaultCameraFrame(0, 1440)).toEqual(defaultCameraFrame(20, 1440));
    expect(defaultCameraFrame(20, 1440)).toEqual(defaultCameraFrame(100, 1440));
  });

  it("uses a stable, slightly wider mobile frame", () => {
    const frame = defaultCameraFrame(20, 390);
    expect(frame.z).toBe(15.5);
    expect(frame.x).toBeCloseTo(frame.z * 0.46);
  });

  it("centers the camera on the bounded presentation window", () => {
    const height = (sceneVisibleBlockCount(1440) - 1) * BLOCK_STEP;
    expect(defaultCameraFrame(1, 1440).targetY).toBeCloseTo(-height / 2);
  });
});

describe("scene block layout", () => {
  it("keeps every slab separated by the shared block step", () => {
    for (let index = 1; index < 100; index += 1) {
      expect(blockPositionY(index - 1) - blockPositionY(index)).toBeCloseTo(BLOCK_STEP);
      expect(BLOCK_STEP).toBeGreaterThan(BLOCK_HEIGHT);
    }
  });

  it("keeps the floor fixed before, during, and after hydration", () => {
    const expected =
      blockPositionY(sceneVisibleBlockCount(1440) - 1) -
      BLOCK_HEIGHT / 2 -
      GRID_FLOOR_CLEARANCE;
    expect(sceneFloorY(1440)).toBeCloseTo(expected);
  });

  it("bounds the rendered tower while retaining a selected historical block", () => {
    const blocks = Array.from({ length: 100 }, (_, index) => ({ number: 100 - index }));
    const defaultWindow = sceneBlockWindow(blocks, -1, 1440);
    const historicalWindow = sceneBlockWindow(blocks, 74, 1440);

    expect(defaultWindow).toHaveLength(14);
    expect(defaultWindow[0].number).toBe(100);
    expect(historicalWindow).toHaveLength(14);
    expect(historicalWindow).toContain(blocks[74]);
  });
});
