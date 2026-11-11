import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { rotateVector } from "../src/core/pieces";
import type { GameAction } from "../src/core/rules";
import { screenMove, screenRoll, screenTip, type ScreenDirection } from "../src/shell/screen-controls";

// Sample the whole spin, avoiding the exact 45° points where the snap flips axis.
const ANGLES = Array.from({ length: 36 }, (_, i) => ((i + 0.5) / 36) * Math.PI * 2);

/**
 * Converts a vector in tower coordinates to what the camera sees, using Three.js's
 * own rotation, so these tests check the controls against the real renderer convention.
 */
function toScreen(local: { x: number; y: number; z: number }, towerAngle: number): Vector3 {
  return new Vector3(local.x, local.y, local.z).applyAxisAngle(new Vector3(0, 1, 0), towerAngle);
}

function moveVector(action: GameAction): { x: number; y: number; z: number } {
  if (action.type !== "move") throw new Error(`expected a move, got ${action.type}`);
  return { x: action.dx, y: 0, z: action.dz };
}

function rotatedUp(action: GameAction): { x: number; y: number; z: number } {
  if (action.type !== "rotate") throw new Error(`expected a rotation, got ${action.type}`);
  return rotateVector({ x: 0, y: 1, z: 0 }, action.axis, action.direction);
}

// Screen space: +x is right, -z is away from the viewer. A snapped move is at most 45° off.
const EXPECTED: Readonly<Record<ScreenDirection, (screen: Vector3) => number>> = {
  left: (screen) => -screen.x,
  right: (screen) => screen.x,
  away: (screen) => -screen.z,
  toward: (screen) => screen.z,
};

describe("screen-relative controls", () => {
  it("at the starting angle, arrows map straight onto the board axes", () => {
    expect(screenMove("left", 0)).toEqual({ type: "move", dx: -1, dz: 0 });
    expect(screenMove("away", 0)).toEqual({ type: "move", dx: 0, dz: -1 });
  });

  it("halfway round, left on screen is +x on the board", () => {
    expect(screenMove("left", Math.PI)).toEqual({ type: "move", dx: 1, dz: 0 });
  });

  it("every arrow moves the piece the way it points on screen, at every angle", () => {
    for (const angle of ANGLES) {
      for (const direction of ["left", "right", "away", "toward"] as const) {
        const screen = toScreen(moveVector(screenMove(direction, angle)), angle);
        expect(EXPECTED[direction](screen)).toBeGreaterThan(0.7);
      }
    }
  });

  it("W tips the top of the piece away from you and S toward you, at every angle", () => {
    for (const angle of ANGLES) {
      expect(toScreen(rotatedUp(screenTip(-1, angle)), angle).z).toBeLessThan(-0.7);
      expect(toScreen(rotatedUp(screenTip(1, angle)), angle).z).toBeGreaterThan(0.7);
    }
  });

  it("D rolls the top of the piece right and A rolls it left, at every angle", () => {
    for (const angle of ANGLES) {
      expect(toScreen(rotatedUp(screenRoll(1, angle)), angle).x).toBeGreaterThan(0.7);
      expect(toScreen(rotatedUp(screenRoll(-1, angle)), angle).x).toBeLessThan(-0.7);
    }
  });
});
