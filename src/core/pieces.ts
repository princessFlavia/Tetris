export const PIECE_KINDS = ["I", "O", "T", "S", "Z", "J", "L"] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

export type Rotation = 0 | 1 | 2 | 3;

export interface Offset {
  readonly x: number;
  readonly y: number;
}

/** The falling piece: which shape, how it's turned, and where its bounding box sits. */
export interface ActivePiece {
  readonly kind: PieceKind;
  readonly rotation: Rotation;
  readonly x: number;
  readonly y: number;
}

// Each shape is drawn in the smallest square box it rotates within. Rotating
// inside a square (rather than around a single pivot cell) keeps every piece's
// rotation predictable and lets us derive all four orientations mechanically.
const BASE_SHAPES: Record<PieceKind, readonly string[]> = {
  I: ["....", "####", "....", "...."],
  O: ["##", "##"],
  T: [".#.", "###", "..."],
  S: [".##", "##.", "..."],
  Z: ["##.", ".##", "..."],
  J: ["#..", "###", "..."],
  L: ["..#", "###", "..."],
};

function parseShape(rows: readonly string[]): Offset[] {
  const cells: Offset[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (char === "#") cells.push({ x, y });
    });
  });
  return cells;
}

/** Clockwise quarter turn inside an n×n box: (x, y) → (n-1-y, x). */
function rotateClockwise(cells: readonly Offset[], boxSize: number): Offset[] {
  return cells.map(({ x, y }) => ({ x: boxSize - 1 - y, y: x }));
}

function buildRotations(rows: readonly string[]): readonly (readonly Offset[])[] {
  const boxSize = rows.length;
  const rotations: Offset[][] = [parseShape(rows)];
  for (let turn = 1; turn < 4; turn++) {
    const previous = rotations[turn - 1];
    if (previous === undefined) throw new Error("rotation table built out of order");
    rotations.push(rotateClockwise(previous, boxSize));
  }
  return rotations;
}

const ROTATION_TABLE: Record<PieceKind, readonly (readonly Offset[])[]> = {
  I: buildRotations(BASE_SHAPES.I),
  O: buildRotations(BASE_SHAPES.O),
  T: buildRotations(BASE_SHAPES.T),
  S: buildRotations(BASE_SHAPES.S),
  Z: buildRotations(BASE_SHAPES.Z),
  J: buildRotations(BASE_SHAPES.J),
  L: buildRotations(BASE_SHAPES.L),
};

export function shapeBoxSize(kind: PieceKind): number {
  return BASE_SHAPES[kind].length;
}

/** Cell offsets relative to the piece's bounding box. */
export function pieceOffsets(kind: PieceKind, rotation: Rotation): readonly Offset[] {
  const offsets = ROTATION_TABLE[kind][rotation];
  if (offsets === undefined) throw new Error(`no rotation ${rotation} for ${kind}`);
  return offsets;
}

/** Absolute board coordinates occupied by a piece. */
export function pieceCells(piece: ActivePiece): Offset[] {
  return pieceOffsets(piece.kind, piece.rotation).map(({ x, y }) => ({
    x: piece.x + x,
    y: piece.y + y,
  }));
}

export function nextRotation(rotation: Rotation): Rotation {
  return ((rotation + 1) % 4) as Rotation;
}
