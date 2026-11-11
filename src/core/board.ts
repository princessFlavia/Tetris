import { pieceCells, type ActivePiece, type PieceKind, type Vec3 } from "./pieces";

// A square tower: x runs left-right, z front-back, y up from the floor (y = 0).
// 4 × 4 floors hold 16 cubes, about four pieces, so floors clear often.
export const BOARD_WIDTH = 4;
export const BOARD_DEPTH = 4;
export const BOARD_HEIGHT = 16;

/** null = empty; otherwise the kind of piece that locked there. */
export type Cell = PieceKind | null;
/** One floor of the tower, indexed [z][x]. */
export type Layer = readonly (readonly Cell[])[];
/** Floors from the bottom up, indexed [y]. */
export type Board = readonly Layer[];

function createEmptyLayer(): Cell[][] {
  return Array.from({ length: BOARD_DEPTH }, () => Array.from({ length: BOARD_WIDTH }, (): Cell => null));
}

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, createEmptyLayer);
}

export function cellAt(board: Board, { x, y, z }: Vec3): Cell | undefined {
  return board[y]?.[z]?.[x];
}

/** True if any cube of the piece is outside the tower or overlaps a locked cube. */
export function collides(board: Board, piece: ActivePiece): boolean {
  return pieceCells(piece).some((cell) => {
    const occupant = cellAt(board, cell);
    // undefined means out of bounds, which counts as a wall.
    return occupant === undefined || occupant !== null;
  });
}

/** Returns a new board with the piece written into it. Caller guarantees no collision. */
export function mergePiece(board: Board, piece: ActivePiece): Board {
  const next = board.map((layer) => layer.map((row) => [...row]));
  for (const { x, y, z } of pieceCells(piece)) {
    const row = next[y]?.[z];
    if (row === undefined || x < 0 || x >= BOARD_WIDTH) {
      throw new Error(`cannot merge piece outside board at (${x}, ${y}, ${z})`);
    }
    row[x] = piece.kind;
  }
  return next;
}

/** Empty spots on one floor; used for the "bottom floor" readout. */
export function emptyCellsInLayer(board: Board, y: number): number {
  const layer = board[y];
  if (layer === undefined) throw new Error(`no floor ${y}`);
  return layer.reduce((sum, row) => sum + row.filter((cell) => cell === null).length, 0);
}

function isLayerFull(layer: Layer): boolean {
  return layer.every((row) => row.every((cell) => cell !== null));
}

export interface ClearResult {
  readonly board: Board;
  readonly layersCleared: number;
}

/** Removes full floors; everything above drops and new empty floors appear at the top. */
export function clearFullLayers(board: Board): ClearResult {
  const remaining = board.filter((layer) => !isLayerFull(layer));
  const layersCleared = BOARD_HEIGHT - remaining.length;
  const refill = Array.from({ length: layersCleared }, createEmptyLayer);
  return { board: [...remaining, ...refill], layersCleared };
}
