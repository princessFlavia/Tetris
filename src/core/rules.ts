import {
  BOARD_DEPTH,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  clearFullLayers,
  collides,
  createEmptyBoard,
  mergePiece,
  type Board,
} from "./board";
import {
  PIECE_KINDS,
  baseShape,
  rotateShape,
  shapeSize,
  type ActivePiece,
  type Axis,
  type Direction,
  type PieceKind,
  type Vec3,
} from "./pieces";

export type GameStatus = "playing" | "paused" | "over";

export interface GameState {
  readonly board: Board;
  readonly active: ActivePiece;
  /** The piece that spawns after `active` locks; shown in the preview. */
  readonly next: PieceKind;
  readonly score: number;
  /** Floors cleared so far. */
  readonly layers: number;
  readonly level: number;
  readonly status: GameStatus;
}

export type Step = -1 | 0 | 1;

export type GameAction =
  | { readonly type: "move"; readonly dx: Step; readonly dz: Step }
  | { readonly type: "rotate"; readonly axis: Axis; readonly direction: Direction }
  | { readonly type: "softDrop" }
  | { readonly type: "hardDrop" }
  | { readonly type: "tick" }
  | { readonly type: "pause" }
  | { readonly type: "resume" }
  | { readonly type: "togglePause" };

/** Injected so tests can control which piece comes next. */
export type PieceSource = () => PieceKind;

// NES scoring: points for 0..4 floors cleared at once, multiplied by (level + 1).
// A piece is at most 4 cubes tall, so 4 is the most one drop can clear.
const LAYER_CLEAR_POINTS = [0, 40, 100, 300, 1200] as const;
const SOFT_DROP_POINTS_PER_CELL = 1;
const HARD_DROP_POINTS_PER_CELL = 2;
// A 5×5 floor holds 25 cubes (about twice a 2D line), so levels come every 5 floors.
export const LAYERS_PER_LEVEL = 5;

// Nudges tried in order when a rotation is blocked: sideways on the floor, then
// down (pieces spawn touching the ceiling, so standing a long piece up there
// needs up to 3 floors of room), then up off the stack.
const ROTATION_KICKS: readonly Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 0, z: -1 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: -2, z: 0 },
  { x: 0, y: -3, z: 0 },
  { x: 0, y: 1, z: 0 },
];

// Slower start than the 2D game: aiming in 3D takes longer.
const BASE_GRAVITY_MS = 1000;
const GRAVITY_DECAY_PER_LEVEL = 0.85;
const MIN_GRAVITY_MS = 50;

/** Milliseconds between automatic one-floor drops at a given level. */
export function gravityIntervalMs(level: number): number {
  return Math.max(MIN_GRAVITY_MS, BASE_GRAVITY_MS * GRAVITY_DECAY_PER_LEVEL ** level);
}

export function layerClearPoints(layersCleared: number, level: number): number {
  const base = LAYER_CLEAR_POINTS[layersCleared as 0 | 1 | 2 | 3 | 4];
  if (base === undefined) throw new Error(`impossible layer clear count: ${layersCleared}`);
  return base * (level + 1);
}

// Relative spawn weights. The 3-block extras are a quarter as likely as each
// 4-cube piece so they help without making the game trivial.
export const SPAWN_WEIGHTS: Readonly<Record<PieceKind, number>> = {
  I: 1,
  O: 1,
  T: 1,
  S: 1,
  Z: 1,
  J: 1,
  L: 1,
  I3: 0.25,
  V: 0.25,
  TwistL: 1,
  TwistR: 1,
  Tripod: 1,
};
const TOTAL_SPAWN_WEIGHT = PIECE_KINDS.reduce((sum, kind) => sum + SPAWN_WEIGHTS[kind], 0);

/** Weighted pick: walks the kinds, subtracting each weight until the roll lands in one. */
export function randomPieceSource(random: () => number): PieceSource {
  return () => {
    let remaining = random() * TOTAL_SPAWN_WEIGHT;
    for (const kind of PIECE_KINDS) {
      remaining -= SPAWN_WEIGHTS[kind];
      if (remaining < 0) return kind;
    }
    throw new Error("random() must return a value in [0, 1)");
  };
}

/** New pieces appear centred over the floor, touching the top of the tower. */
function spawnPiece(kind: PieceKind): ActivePiece {
  const shape = baseShape(kind);
  const size = shapeSize(shape);
  return {
    kind,
    shape,
    position: {
      x: Math.floor((BOARD_WIDTH - size.x) / 2),
      y: BOARD_HEIGHT - size.y,
      z: Math.floor((BOARD_DEPTH - size.z) / 2),
    },
  };
}

export function createGame(nextPiece: PieceSource): GameState {
  return {
    board: createEmptyBoard(),
    active: spawnPiece(nextPiece()),
    next: nextPiece(),
    score: 0,
    layers: 0,
    level: 0,
    status: "playing",
  };
}

function shifted(piece: ActivePiece, offset: Vec3): ActivePiece {
  const { position } = piece;
  return {
    ...piece,
    position: { x: position.x + offset.x, y: position.y + offset.y, z: position.z + offset.z },
  };
}

/** Returns the moved state, or null if the move is blocked. */
function tryMove(state: GameState, offset: Vec3): GameState | null {
  const moved = shifted(state.active, offset);
  return collides(state.board, moved) ? null : { ...state, active: moved };
}

const DOWN: Vec3 = { x: 0, y: -1, z: 0 };

/**
 * Turns the shape and shifts it so its bounding box stays centred where it was.
 * The shift uses floor(size / 2) on each axis, so four turns cancel out exactly.
 */
function turnInPlace(piece: ActivePiece, axis: Axis, direction: Direction): ActivePiece {
  const shape = rotateShape(piece.shape, axis, direction);
  const before = shapeSize(piece.shape);
  const after = shapeSize(shape);
  const recentre = (key: keyof Vec3): number => Math.floor(before[key] / 2) - Math.floor(after[key] / 2);
  return shifted({ ...piece, shape }, { x: recentre("x"), y: recentre("y"), z: recentre("z") });
}

function rotate(state: GameState, axis: Axis, direction: Direction): GameState {
  const turned = turnInPlace(state.active, axis, direction);
  for (const kick of ROTATION_KICKS) {
    const candidate = shifted(turned, kick);
    if (!collides(state.board, candidate)) return { ...state, active: candidate };
  }
  return state;
}

/** Where the piece would come to rest if dropped straight down now. */
export function landingPiece(board: Board, piece: ActivePiece): ActivePiece {
  let current = piece;
  for (let next = shifted(current, DOWN); !collides(board, next); next = shifted(current, DOWN)) {
    current = next;
  }
  return current;
}

/** Fixes the active piece in place, clears floors, scores, and spawns the next piece. */
function lockPiece(state: GameState, nextPiece: PieceSource): GameState {
  const merged = mergePiece(state.board, state.active);
  const { board, layersCleared } = clearFullLayers(merged);
  const layers = state.layers + layersCleared;
  const score = state.score + layerClearPoints(layersCleared, state.level);
  const level = Math.floor(layers / LAYERS_PER_LEVEL);
  const active = spawnPiece(state.next);
  // Top-out: the new piece has nowhere to appear.
  const status: GameStatus = collides(board, active) ? "over" : "playing";
  return { board, active, next: nextPiece(), score, layers, level, status };
}

function dropOrLock(state: GameState, nextPiece: PieceSource, pointsPerCell: number): GameState {
  const moved = tryMove(state, DOWN);
  if (moved === null) return lockPiece(state, nextPiece);
  return { ...moved, score: moved.score + pointsPerCell };
}

function hardDrop(state: GameState, nextPiece: PieceSource): GameState {
  const landed = landingPiece(state.board, state.active);
  const distance = state.active.position.y - landed.position.y;
  const scored = { ...state, active: landed, score: state.score + distance * HARD_DROP_POINTS_PER_CELL };
  return lockPiece(scored, nextPiece);
}

function stepWhilePaused(state: GameState, action: GameAction): GameState {
  if (action.type === "resume" || action.type === "togglePause") {
    return { ...state, status: "playing" };
  }
  return state;
}

/** Pure reducer: the only way game state changes. */
export function step(state: GameState, action: GameAction, nextPiece: PieceSource): GameState {
  if (state.status === "over") return state;
  if (state.status === "paused") return stepWhilePaused(state, action);

  switch (action.type) {
    case "move":
      return tryMove(state, { x: action.dx, y: 0, z: action.dz }) ?? state;
    case "rotate":
      return rotate(state, action.axis, action.direction);
    case "softDrop":
      return dropOrLock(state, nextPiece, SOFT_DROP_POINTS_PER_CELL);
    case "tick":
      return dropOrLock(state, nextPiece, 0);
    case "hardDrop":
      return hardDrop(state, nextPiece);
    case "pause":
    case "togglePause":
      return { ...state, status: "paused" };
    case "resume":
      return state;
  }
}
