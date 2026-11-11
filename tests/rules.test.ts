import { describe, expect, it } from "vitest";
import {
  BOARD_DEPTH,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  clearFullLayers,
  collides,
  createEmptyBoard,
  type Board,
  type Cell,
} from "../src/core/board";
import {
  PIECE_KINDS,
  baseShape,
  normalize,
  pieceCells,
  rotateShape,
  shapeSize,
  type Axis,
  type PieceKind,
  type Shape,
} from "../src/core/pieces";
import {
  createGame,
  gravityIntervalMs,
  landingPiece,
  layerClearPoints,
  randomPieceSource,
  step,
  type GameAction,
  type GameState,
  type PieceSource,
} from "../src/core/rules";

const AXES: readonly Axis[] = ["x", "y", "z"];
const SMALL_PIECES: readonly PieceKind[] = ["I3", "V"];
const SOLID_3D_PIECES: readonly PieceKind[] = ["TwistL", "TwistR", "Tripod"];

const always =
  (kind: PieceKind): PieceSource =>
  () =>
    kind;

/** Cycles through the given kinds in order, so tests know exactly what spawns next. */
function sequence(...kinds: readonly PieceKind[]): PieceSource {
  let index = 0;
  return () => {
    const kind = kinds[index % kinds.length];
    if (kind === undefined) throw new Error("sequence needs at least one kind");
    index++;
    return kind;
  };
}

function stepAll(state: GameState, actions: readonly GameAction[], source: PieceSource): GameState {
  return actions.reduce((current, action) => step(current, action, source), state);
}

function repeat(action: GameAction, times: number): GameAction[] {
  return Array.from({ length: times }, () => action);
}

/** Moves the active piece as far as it will go toward the x = 0, z = 0 corner. */
function pushToCorner(state: GameState, source: PieceSource): GameState {
  return stepAll(
    state,
    [...repeat({ type: "move", dx: -1, dz: 0 }, BOARD_WIDTH), ...repeat({ type: "move", dx: 0, dz: -1 }, BOARD_DEPTH)],
    source,
  );
}

/** The bottom `count` floors are full except at the listed (x, z) holes. */
function boardWithHoles(count: number, holes: readonly { x: number; z: number }[]): Board {
  return createEmptyBoard().map((layer, y) =>
    y < count
      ? layer.map((row, z) => row.map((_, x): Cell => (holes.some((h) => h.x === x && h.z === z) ? null : "Z")))
      : layer,
  );
}

function isEmpty(board: Board): boolean {
  return board.every((layer) => layer.every((row) => row.every((cell) => cell === null)));
}

const shapeKey = (shape: Shape): string => JSON.stringify(shape);

/** Every distinct orientation reachable by quarter turns. */
function allOrientations(shape: Shape): Set<string> {
  const seen = new Map<string, Shape>([[shapeKey(shape), shape]]);
  const queue: Shape[] = [shape];
  for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
    for (const axis of AXES) {
      const turned = rotateShape(current, axis, 1);
      if (!seen.has(shapeKey(turned))) {
        seen.set(shapeKey(turned), turned);
        queue.push(turned);
      }
    }
  }
  return new Set(seen.keys());
}

describe("pieces", () => {
  it("small pieces have three cubes and the rest have four", () => {
    for (const kind of PIECE_KINDS) {
      expect(baseShape(kind)).toHaveLength(SMALL_PIECES.includes(kind) ? 3 : 4);
    }
  });

  it("the original nine pieces start flat and the three new ones span all three axes", () => {
    for (const kind of PIECE_KINDS) {
      const size = shapeSize(baseShape(kind));
      if (SOLID_3D_PIECES.includes(kind)) {
        expect([size.x, size.y, size.z].every((extent) => extent >= 2)).toBe(true);
      } else {
        expect(size.y).toBe(1);
      }
    }
  });

  it("the two twists are mirror images that no rotation can turn into each other", () => {
    const left = baseShape("TwistL");
    const right = baseShape("TwistR");
    expect(allOrientations(left).has(shapeKey(right))).toBe(false);
    const mirroredLeft = normalize(left.map(({ x, y, z }) => ({ x: -x, y, z })));
    expect(allOrientations(right).has(shapeKey(mirroredLeft))).toBe(true);
  });

  it("four quarter turns about any axis restore every shape", () => {
    for (const kind of PIECE_KINDS) {
      for (const axis of AXES) {
        let shape = baseShape(kind);
        for (let turn = 0; turn < 4; turn++) shape = rotateShape(shape, axis, 1);
        expect(shape).toEqual(baseShape(kind));
      }
    }
  });
});

describe("movement", () => {
  it("stops at the walls on both floor axes", () => {
    const source = always("O");
    const cornered = pushToCorner(createGame(source), source);
    const cells = pieceCells(cornered.active);
    expect(Math.min(...cells.map((cell) => cell.x))).toBe(0);
    expect(Math.min(...cells.map((cell) => cell.z))).toBe(0);

    const farSide = stepAll(
      cornered,
      [...repeat({ type: "move", dx: 1, dz: 0 }, BOARD_WIDTH), ...repeat({ type: "move", dx: 0, dz: 1 }, BOARD_DEPTH)],
      source,
    );
    const farCells = pieceCells(farSide.active);
    expect(Math.max(...farCells.map((cell) => cell.x))).toBe(BOARD_WIDTH - 1);
    expect(Math.max(...farCells.map((cell) => cell.z))).toBe(BOARD_DEPTH - 1);
  });

  it("treats the floor as solid", () => {
    const piece = { kind: "O" as const, shape: baseShape("O"), position: { x: 0, y: -1, z: 0 } };
    expect(collides(createEmptyBoard(), piece)).toBe(true);
    expect(collides(createEmptyBoard(), { ...piece, position: { x: 0, y: 0, z: 0 } })).toBe(false);
  });

  it("lands on the floor, or on top of whatever is below", () => {
    const piece = { kind: "O" as const, shape: baseShape("O"), position: { x: 0, y: 10, z: 0 } };
    expect(landingPiece(createEmptyBoard(), piece).position.y).toBe(0);
    const withCube = createEmptyBoard().map((layer, y) =>
      y === 0 ? layer.map((row, z) => row.map((_, x): Cell => (x === 0 && z === 0 ? "I" : null))) : layer,
    );
    expect(landingPiece(withCube, piece).position.y).toBe(1);
  });
});

describe("rotation", () => {
  it("tipping the I piece about z stands it upright", () => {
    const source = always("I");
    const tipped = step(createGame(source), { type: "rotate", axis: "z", direction: 1 }, source);
    expect(shapeSize(tipped.active.shape)).toEqual({ x: 1, y: 4, z: 1 });
  });

  it("four turns about any axis put the piece back exactly where it was", () => {
    const source = always("T");
    const game = createGame(source);
    const midTower: GameState = { ...game, active: { ...game.active, position: { x: 1, y: 6, z: 1 } } };
    for (const axis of AXES) {
      const turned = stepAll(midTower, repeat({ type: "rotate", axis, direction: 1 }, 4), source);
      expect(turned.active).toEqual(midTower.active);
    }
  });

  it("nudges a blocked rotation off the front wall", () => {
    const source = always("I");
    const game = createGame(source);
    // I lies along x against the front wall (z = 3); turning it to lie along z overhangs by one.
    const againstWall: GameState = { ...game, active: { ...game.active, position: { x: 0, y: 6, z: 3 } } };
    const turned = step(againstWall, { type: "rotate", axis: "y", direction: 1 }, source);
    expect(shapeSize(turned.active.shape)).toEqual({ x: 1, y: 1, z: 4 });
    expect(turned.active.position).toEqual({ x: 2, y: 6, z: 0 });
    expect(collides(turned.board, turned.active)).toBe(false);
  });
});

describe("floor clears", () => {
  it("removes a full floor and drops the floors above", () => {
    const board = boardWithHoles(2, [{ x: 2, z: 2 }]).map((layer, y) =>
      y === 0 ? layer.map((row) => row.map((): Cell => "I")) : layer,
    );
    const { board: cleared, layersCleared } = clearFullLayers(board);
    expect(layersCleared).toBe(1);
    expect(cleared).toHaveLength(BOARD_HEIGHT);
    // The floor with the hole is now at the bottom; the top is fresh and empty.
    expect(cleared[0]?.[2]?.[2]).toBeNull();
    expect(cleared[0]?.[0]?.[0]).toBe("Z");
    expect(cleared[BOARD_HEIGHT - 1]?.every((row) => row.every((cell) => cell === null))).toBe(true);
  });

  it("clears one floor when a flat I fills the last row of the floor", () => {
    const source = always("I");
    const holes = [0, 1, 2, 3].map((x) => ({ x, z: 0 }));
    const game: GameState = { ...createGame(source), board: boardWithHoles(1, holes) };
    const cornered = pushToCorner(game, source);
    const dropDistance = cornered.active.position.y;
    const after = step(cornered, { type: "hardDrop" }, source);
    expect(after.layers).toBe(1);
    expect(after.score).toBe(40 + dropDistance * 2);
    expect(isEmpty(after.board)).toBe(true);
  });

  it("clears two floors at once when an upright O fills a two-high gap", () => {
    const source = always("O");
    const holes = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ];
    const game: GameState = { ...createGame(source), board: boardWithHoles(2, holes) };
    const upright = step(game, { type: "rotate", axis: "x", direction: 1 }, source);
    expect(shapeSize(upright.active.shape)).toEqual({ x: 2, y: 2, z: 1 });
    const cornered = pushToCorner(upright, source);
    const dropDistance = cornered.active.position.y;
    const after = step(cornered, { type: "hardDrop" }, source);
    expect(after.layers).toBe(2);
    expect(after.score).toBe(100 + dropDistance * 2);
    expect(isEmpty(after.board)).toBe(true);
  });

  it("levels up every 5 floors", () => {
    const source = always("I");
    const holes = [0, 1, 2, 3].map((x) => ({ x, z: 0 }));
    const game: GameState = { ...createGame(source), layers: 4, board: boardWithHoles(1, holes) };
    const after = step(pushToCorner(game, source), { type: "hardDrop" }, source);
    expect(after.layers).toBe(5);
    expect(after.level).toBe(1);
  });
});

describe("scoring and speed", () => {
  it("uses NES clear values scaled by level", () => {
    expect(layerClearPoints(1, 0)).toBe(40);
    expect(layerClearPoints(2, 0)).toBe(100);
    expect(layerClearPoints(3, 0)).toBe(300);
    expect(layerClearPoints(4, 2)).toBe(3600);
  });

  it("gravity starts at one floor per second, speeds up, and bottoms out at 50ms", () => {
    expect(gravityIntervalMs(0)).toBe(1000);
    expect(gravityIntervalMs(1)).toBeLessThan(gravityIntervalMs(0));
    expect(gravityIntervalMs(100)).toBe(50);
  });

  it("awards a point per soft-dropped floor", () => {
    const source = always("T");
    expect(step(createGame(source), { type: "softDrop" }, source).score).toBe(1);
  });
});

describe("next-piece preview", () => {
  it("shows the second piece from the source at game start", () => {
    const game = createGame(sequence("Tripod", "V", "I3"));
    expect(game.active.kind).toBe("Tripod");
    expect(game.next).toBe("V");
  });

  it("spawns the previewed piece and draws a new preview after a lock", () => {
    const source = sequence("T", "TwistL", "I3");
    const afterLock = step(createGame(source), { type: "hardDrop" }, source);
    expect(afterLock.active.kind).toBe("TwistL");
    expect(afterLock.next).toBe("I3");
  });
});

describe("spawn weights", () => {
  it("makes each small piece a quarter as likely as each 4-cube piece", () => {
    // Total weight is 10.5; evenly spaced rolls give an exact, deterministic distribution.
    const samples = 1050;
    let roll = 0;
    const source = randomPieceSource(() => (roll + 0.5) / samples);
    const counts = new Map<PieceKind, number>();
    for (roll = 0; roll < samples; roll++) {
      const kind = source();
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    for (const kind of PIECE_KINDS) {
      expect(counts.get(kind)).toBe(SMALL_PIECES.includes(kind) ? 25 : 100);
    }
  });

  it("rejects rolls outside [0, 1)", () => {
    expect(() => randomPieceSource(() => 1)()).toThrow();
  });
});

describe("tower size", () => {
  it("is 4 × 4 × 16 and spawns pieces centred at the top", () => {
    expect([BOARD_WIDTH, BOARD_DEPTH, BOARD_HEIGHT]).toEqual([4, 4, 16]);
    const cells = pieceCells(createGame(always("O")).active);
    expect(new Set(cells.map((cell) => cell.x))).toEqual(new Set([1, 2]));
    expect(new Set(cells.map((cell) => cell.z))).toEqual(new Set([1, 2]));
    expect(cells.every((cell) => cell.y === BOARD_HEIGHT - 1)).toBe(true);
  });
});

describe("pause and game over", () => {
  it("ignores gameplay input while paused", () => {
    const source = always("T");
    const paused = step(createGame(source), { type: "pause" }, source);
    expect(paused.status).toBe("paused");
    expect(step(paused, { type: "move", dx: -1, dz: 0 }, source)).toBe(paused);
    expect(step(paused, { type: "tick" }, source)).toBe(paused);
    expect(step(paused, { type: "togglePause" }, source).status).toBe("playing");
  });

  it("pause is idempotent so blur + visibilitychange don't unpause", () => {
    const source = always("T");
    const once = step(createGame(source), { type: "pause" }, source);
    expect(step(once, { type: "pause" }, source).status).toBe("paused");
  });

  it("ends the game when a new piece cannot spawn", () => {
    const source = always("O");
    let state = createGame(source);
    for (let i = 0; i < 50 && state.status === "playing"; i++) {
      state = step(state, { type: "hardDrop" }, source);
    }
    expect(state.status).toBe("over");
    expect(step(state, { type: "move", dx: -1, dz: 0 }, source)).toBe(state);
  });
});
