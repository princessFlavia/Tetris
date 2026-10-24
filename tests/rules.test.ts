import { describe, expect, it } from "vitest";
import { BOARD_HEIGHT, BOARD_WIDTH, clearFullRows, collides, createEmptyBoard, type Board, type Cell } from "../src/core/board";
import { pieceCells, type PieceKind } from "../src/core/pieces";
import {
  createGame,
  gravityIntervalMs,
  lineClearPoints,
  step,
  type GameAction,
  type GameState,
  type PieceSource,
} from "../src/core/rules";

const always =
  (kind: PieceKind): PieceSource =>
  () =>
    kind;

/** Board with the bottom `count` rows full except for column `gapX`. */
function boardWithGappedRows(count: number, gapX: number): Board {
  return createEmptyBoard().map((row, y) =>
    y >= BOARD_HEIGHT - count ? row.map((_, x): Cell => (x === gapX ? null : "Z")) : row,
  );
}

function stepAll(state: GameState, actions: readonly GameAction[], source: PieceSource): GameState {
  return actions.reduce((current, action) => step(current, action, source), state);
}

describe("pieces", () => {
  it("every rotation of every piece has four cells", () => {
    for (const kind of ["I", "O", "T", "S", "Z", "J", "L"] as const) {
      for (const rotation of [0, 1, 2, 3] as const) {
        expect(pieceCells({ kind, rotation, x: 0, y: 0 })).toHaveLength(4);
      }
    }
  });

  it("four clockwise rotations return to the start", () => {
    const start = createGame(always("T"));
    const rotated = stepAll(
      { ...start, active: { ...start.active, y: 5 } },
      [{ type: "rotate" }, { type: "rotate" }, { type: "rotate" }, { type: "rotate" }],
      always("T"),
    );
    expect(pieceCells(rotated.active)).toEqual(pieceCells({ ...start.active, y: 5 }));
  });
});

describe("collision", () => {
  it("treats walls and floor as solid", () => {
    const board = createEmptyBoard();
    expect(collides(board, { kind: "O", rotation: 0, x: -1, y: 0 })).toBe(true);
    expect(collides(board, { kind: "O", rotation: 0, x: BOARD_WIDTH - 1, y: 0 })).toBe(true);
    expect(collides(board, { kind: "O", rotation: 0, x: 0, y: BOARD_HEIGHT - 1 })).toBe(true);
    expect(collides(board, { kind: "O", rotation: 0, x: 0, y: BOARD_HEIGHT - 2 })).toBe(false);
  });

  it("stops the piece moving past the left wall", () => {
    const source = always("O");
    const moves = Array.from({ length: 20 }, () => ({ type: "moveLeft" }) as const);
    const state = stepAll(createGame(source), moves, source);
    expect(Math.min(...pieceCells(state.active).map((cell) => cell.x))).toBe(0);
  });
});

describe("rotation wall kick", () => {
  it("kicks a vertical I piece off the right wall when rotating", () => {
    const source = always("I");
    const game = createGame(source);
    // Vertical I (rotation 1) occupies box column 2; x=7 puts it in the last column.
    const againstWall: GameState = { ...game, active: { kind: "I", rotation: 1, x: 7, y: 5 } };
    const rotated = step(againstWall, { type: "rotate" }, source);
    expect(rotated.active.rotation).toBe(2);
    const xs = pieceCells(rotated.active).map((cell) => cell.x);
    expect(Math.max(...xs)).toBeLessThan(BOARD_WIDTH);
    expect(rotated.active.x).toBe(6);
  });
});

describe("line clears", () => {
  it("removes full rows and shifts the rest down", () => {
    const board = boardWithGappedRows(2, 0).map((row, y) =>
      y === BOARD_HEIGHT - 1 ? row.map((): Cell => "I") : row,
    );
    const { board: cleared, linesCleared } = clearFullRows(board);
    expect(linesCleared).toBe(1);
    expect(cleared).toHaveLength(BOARD_HEIGHT);
    expect(cleared[0]?.every((cell) => cell === null)).toBe(true);
    expect(cleared[BOARD_HEIGHT - 1]?.[0]).toBeNull();
  });

  it("scores a tetris when a vertical I fills a four-row gap", () => {
    const source = always("I");
    const game = createGame(source);
    const setup: GameState = {
      ...game,
      board: boardWithGappedRows(4, 9),
      active: { kind: "I", rotation: 1, x: 7, y: 0 },
    };
    const after = step(setup, { type: "hardDrop" }, source);
    expect(after.lines).toBe(4);
    // 1200 for the tetris plus 2 points per cell dropped (rows 0 → 16).
    expect(after.score).toBe(1200 + 16 * 2);
    expect(after.board.flat().every((cell) => cell === null)).toBe(true);
  });
});

describe("scoring and levels", () => {
  it("uses NES line-clear values scaled by level", () => {
    expect(lineClearPoints(1, 0)).toBe(40);
    expect(lineClearPoints(2, 0)).toBe(100);
    expect(lineClearPoints(3, 0)).toBe(300);
    expect(lineClearPoints(4, 2)).toBe(3600);
  });

  it("levels up after 10 lines", () => {
    const source = always("I");
    const game = createGame(source);
    const setup: GameState = {
      ...game,
      lines: 8,
      board: boardWithGappedRows(4, 9),
      active: { kind: "I", rotation: 1, x: 7, y: 0 },
    };
    expect(step(setup, { type: "hardDrop" }, source).level).toBe(1);
  });

  it("gravity speeds up with level and bottoms out at 50ms", () => {
    expect(gravityIntervalMs(0)).toBe(800);
    expect(gravityIntervalMs(1)).toBeLessThan(gravityIntervalMs(0));
    expect(gravityIntervalMs(100)).toBe(50);
  });

  it("awards a point per soft-dropped cell", () => {
    const source = always("T");
    expect(step(createGame(source), { type: "softDrop" }, source).score).toBe(1);
  });
});

describe("pause and game over", () => {
  it("ignores gameplay input while paused", () => {
    const source = always("T");
    const paused = step(createGame(source), { type: "pause" }, source);
    expect(paused.status).toBe("paused");
    expect(step(paused, { type: "moveLeft" }, source)).toBe(paused);
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
    expect(step(state, { type: "moveLeft" }, source)).toBe(state);
  });
});
