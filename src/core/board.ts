import { pieceCells, type ActivePiece, type PieceKind } from "./pieces";

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;

/** null = empty; otherwise the kind of piece that locked there (used for colour). */
export type Cell = PieceKind | null;
export type Row = readonly Cell[];
export type Board = readonly Row[];

function createEmptyRow(): Cell[] {
  return Array.from({ length: BOARD_WIDTH }, () => null);
}

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, createEmptyRow);
}

export function cellAt(board: Board, x: number, y: number): Cell | undefined {
  return board[y]?.[x];
}

/** True if any cell of the piece is off the board or overlaps a locked block. */
export function collides(board: Board, piece: ActivePiece): boolean {
  return pieceCells(piece).some(({ x, y }) => {
    const cell = cellAt(board, x, y);
    // undefined means out of bounds, which counts as a wall.
    return cell === undefined || cell !== null;
  });
}

/** Returns a new board with the piece written into it. Caller guarantees no collision. */
export function mergePiece(board: Board, piece: ActivePiece): Board {
  const next = board.map((row) => [...row]);
  for (const { x, y } of pieceCells(piece)) {
    const row = next[y];
    if (row === undefined || x < 0 || x >= BOARD_WIDTH) {
      throw new Error(`cannot merge piece outside board at (${x}, ${y})`);
    }
    row[x] = piece.kind;
  }
  return next;
}

export interface ClearResult {
  readonly board: Board;
  readonly linesCleared: number;
}

export function clearFullRows(board: Board): ClearResult {
  const remaining = board.filter((row) => row.some((cell) => cell === null));
  const linesCleared = BOARD_HEIGHT - remaining.length;
  const refill = Array.from({ length: linesCleared }, createEmptyRow);
  return { board: [...refill, ...remaining], linesCleared };
}
