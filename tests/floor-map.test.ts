import { describe, expect, it } from "vitest";
import { BOARD_WIDTH, createEmptyBoard, emptyCellsInLayer, type Cell } from "../src/core/board";
import { mapPosition, summarizeColumns } from "../src/shell/floor-map";
import { screenMove } from "../src/shell/screen-controls";

const ANGLES = Array.from({ length: 36 }, (_, i) => ((i + 0.5) / 36) * Math.PI * 2);

describe("floor map", () => {
  it("at the starting angle, the map is the floor seen from above with the far side on top", () => {
    expect(mapPosition(0, 0, 0)).toEqual({ col: 0, row: 0 });
    expect(mapPosition(3, 3, 0)).toEqual({ col: 3, row: 3 });
  });

  it("halfway round, the map is turned upside down along with the tower", () => {
    expect(mapPosition(0, 0, Math.PI)).toEqual({ col: 3, row: 3 });
  });

  it("every arrow moves the piece the same way on the map, at every angle", () => {
    for (const angle of ANGLES) {
      const start = mapPosition(1, 1, angle);
      for (const [direction, dCol, dRow] of [
        ["left", -1, 0],
        ["right", 1, 0],
        ["away", 0, -1],
        ["toward", 0, 1],
      ] as const) {
        const move = screenMove(direction, angle);
        if (move.type !== "move") throw new Error("expected a move");
        const moved = mapPosition(1 + move.dx, 1 + move.dz, angle);
        expect({ dCol: moved.col - start.col, dRow: moved.row - start.row }).toEqual({ dCol, dRow });
      }
    }
  });

  it("puts every spot on the map exactly once at every angle", () => {
    for (const angle of ANGLES) {
      const seen = new Set<string>();
      for (let z = 0; z < BOARD_WIDTH; z++) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
          const { col, row } = mapPosition(x, z, angle);
          seen.add(`${col},${row}`);
        }
      }
      expect(seen.size).toBe(BOARD_WIDTH * BOARD_WIDTH);
    }
  });

  it("reports each spot's stack height and top piece", () => {
    const board = createEmptyBoard().map((layer, y) =>
      layer.map((row, z) =>
        row.map((_, x): Cell => {
          if (x === 0 && z === 0 && y <= 2) return y === 2 ? "T" : "I";
          return null;
        }),
      ),
    );
    const columns = summarizeColumns(board);
    expect(columns.find((c) => c.x === 0 && c.z === 0)).toEqual({ x: 0, z: 0, height: 3, topKind: "T" });
    expect(columns.find((c) => c.x === 1 && c.z === 0)).toEqual({ x: 1, z: 0, height: 0, topKind: null });
    expect(emptyCellsInLayer(board, 0)).toBe(15);
  });
});
