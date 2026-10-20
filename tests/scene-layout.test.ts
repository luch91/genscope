import { describe, expect, it } from "vitest";
import { defaultCameraFrame } from "../app/lib/scene-layout";

describe("defaultCameraFrame", () => {
  it("does not zoom excessively as the initial block window hydrates", () => {
    expect(defaultCameraFrame(0, 1440).z).toBe(12);
    expect(defaultCameraFrame(20, 1440).z).toBeLessThanOrEqual(20);
    expect(defaultCameraFrame(100, 1440).z).toBe(20);
  });

  it("uses a stable, slightly wider mobile frame", () => {
    const frame = defaultCameraFrame(20, 390);
    expect(frame.z).toBeLessThanOrEqual(22);
    expect(frame.x).toBeCloseTo(frame.z * 0.52);
  });

  it("keeps the camera centered on the retained tower", () => {
    expect(defaultCameraFrame(1, 1440).targetY).toBe(0);
    expect(defaultCameraFrame(20, 1440).targetY).toBeLessThan(0);
  });
});
