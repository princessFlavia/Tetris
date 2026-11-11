import type { Axis, Direction } from "../core/pieces";
import type { GameAction, Step } from "../core/rules";

export type ScreenDirection = "left" | "right" | "away" | "toward";

interface BoardAxis {
  readonly axis: Extract<Axis, "x" | "z">;
  readonly sign: Direction;
}

/**
 * Snaps a horizontal direction in tower coordinates to the nearest board axis.
 * Because the tower spins, "screen left" points along a different board axis
 * depending on the angle; snapping keeps moves on the grid.
 */
function snapToBoardAxis(vx: number, vz: number): BoardAxis {
  if (Math.abs(vx) >= Math.abs(vz)) return { axis: "x", sign: vx >= 0 ? 1 : -1 };
  return { axis: "z", sign: vz >= 0 ? 1 : -1 };
}

// The camera looks at the tower from +z. With the tower turned by `angle` about
// its vertical axis, screen-right and screen-away expressed in tower coordinates are:
function screenRight(angle: number): BoardAxis {
  return snapToBoardAxis(Math.cos(angle), Math.sin(angle));
}

function screenAway(angle: number): BoardAxis {
  return snapToBoardAxis(Math.sin(angle), -Math.cos(angle));
}

/** A unit step on the floor along one board axis. */
export interface FloorVector {
  readonly x: Step;
  readonly z: Step;
}

function toFloorVector({ axis, sign }: BoardAxis): FloorVector {
  return axis === "x" ? { x: sign, z: 0 } : { x: 0, z: sign };
}

/** Which board directions currently read as screen-right and screen-away. */
export function screenBasis(towerAngle: number): { readonly right: FloorVector; readonly away: FloorVector } {
  return { right: toFloorVector(screenRight(towerAngle)), away: toFloorVector(screenAway(towerAngle)) };
}

function asStep(value: number): Step {
  return value === 0 ? 0 : value > 0 ? 1 : -1;
}

/** A move as the player sees it ("left on my screen") turned into a board move. */
export function screenMove(direction: ScreenDirection, towerAngle: number): GameAction {
  const horizontal = direction === "left" || direction === "right";
  const { axis, sign } = horizontal ? screenRight(towerAngle) : screenAway(towerAngle);
  const towardPositive = direction === "right" || direction === "away" ? sign : -sign;
  return {
    type: "move",
    dx: asStep(axis === "x" ? towardPositive : 0),
    dz: asStep(axis === "z" ? towardPositive : 0),
  };
}

/** Tip forward/back: a turn about the screen's left-right axis. Direction -1 tips the top away. */
export function screenTip(direction: Direction, towerAngle: number): GameAction {
  const { axis, sign } = screenRight(towerAngle);
  return { type: "rotate", axis, direction: (direction * sign) as Direction };
}

/** Roll left/right: a turn about the axis pointing into the screen. Direction 1 rolls right. */
export function screenRoll(direction: Direction, towerAngle: number): GameAction {
  const { axis, sign } = screenAway(towerAngle);
  return { type: "rotate", axis, direction: (direction * sign) as Direction };
}
