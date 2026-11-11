export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A piece's cubes as offsets from its bounding-box corner; always normalized (min 0 on every axis). */
export type Shape = readonly Vec3[];

export type Axis = "x" | "y" | "z";
export type Direction = 1 | -1;

// The seven tetrominoes plus two 3-block extras (I3 bar, V corner) start flat;
// TwistL, TwistR and Tripod are the 4-cube shapes that only exist in 3D.
export const PIECE_KINDS = [
  "I",
  "O",
  "T",
  "S",
  "Z",
  "J",
  "L",
  "I3",
  "V",
  "TwistL",
  "TwistR",
  "Tripod",
] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

/** The falling piece: its current (possibly rotated) shape and where its bounding-box corner sits. */
export interface ActivePiece {
  readonly kind: PieceKind;
  readonly shape: Shape;
  readonly position: Vec3;
}

/** Sorted so equal shapes compare equal regardless of how they were produced. */
export function normalize(cells: readonly Vec3[]): Shape {
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  const minZ = Math.min(...cells.map((cell) => cell.z));
  return cells
    .map(({ x, y, z }) => ({ x: x - minX, y: y - minY, z: z - minZ }))
    .sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
}

/** Flat pieces are drawn as seen from above: characters run along x, rows along z. */
function parseFlat(rows: readonly string[]): Shape {
  const cells: Vec3[] = [];
  rows.forEach((row, z) => {
    [...row].forEach((char, x) => {
      if (char === "#") cells.push({ x, y: 0, z });
    });
  });
  return normalize(cells);
}

const BASE_SHAPES: Readonly<Record<PieceKind, Shape>> = {
  I: parseFlat(["####"]),
  O: parseFlat(["##", "##"]),
  T: parseFlat(["###", ".#."]),
  S: parseFlat([".##", "##."]),
  Z: parseFlat(["##.", ".##"]),
  J: parseFlat(["#..", "###"]),
  L: parseFlat(["..#", "###"]),
  I3: parseFlat(["###"]),
  V: parseFlat(["#.", "##"]),
  // A chain of three steps along x, then y, then z; TwistR is its mirror image.
  TwistL: normalize([
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 1, z: 0 },
    { x: 1, y: 1, z: 1 },
  ]),
  TwistR: normalize([
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 1, z: 1 },
  ]),
  // One corner cube with an arm along each axis.
  Tripod: normalize([
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ]),
};

export function baseShape(kind: PieceKind): Shape {
  return BASE_SHAPES[kind];
}

/** Bounding-box size on each axis. */
export function shapeSize(shape: Shape): Vec3 {
  return {
    x: Math.max(...shape.map((cell) => cell.x)) + 1,
    y: Math.max(...shape.map((cell) => cell.y)) + 1,
    z: Math.max(...shape.map((cell) => cell.z)) + 1,
  };
}

/** Quarter turn about an axis through the origin (right-hand rule for direction 1). */
export function rotateVector({ x, y, z }: Vec3, axis: Axis, direction: Direction): Vec3 {
  switch (axis) {
    case "x":
      return { x, y: -direction * z, z: direction * y };
    case "y":
      return { x: direction * z, y, z: -direction * x };
    case "z":
      return { x: -direction * y, y: direction * x, z };
  }
}

export function rotateShape(shape: Shape, axis: Axis, direction: Direction): Shape {
  return normalize(shape.map((cell) => rotateVector(cell, axis, direction)));
}

/** Absolute board coordinates occupied by a piece. */
export function pieceCells(piece: ActivePiece): Vec3[] {
  const { position } = piece;
  return piece.shape.map(({ x, y, z }) => ({ x: position.x + x, y: position.y + y, z: position.z + z }));
}
