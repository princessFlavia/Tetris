import {
  BOARD_WIDTH,
  clearFullRows,
  collides,
  createEmptyBoard,
  mergePiece,
  type Board,
} from "./board";
import {
  PIECE_KINDS,
  nextRotation,
  shapeBoxSize,
  type ActivePiece,
  type PieceKind,
} from "./pieces";

export type GameStatus = "playing" | "paused" | "over";

export interface GameState {
  readonly board: Board;
  readonly active: ActivePiece;
  readonly score: number;
  readonly lines: number;
  readonly level: number;
  readonly status: GameStatus;
}

export type GameAction =
  | { readonly type: "moveLeft" }
  | { readonly type: "moveRight" }
  | { readonly type: "rotate" }
  | { readonly type: "softDrop" }
  | { readonly type: "hardDrop" }
  | { readonly type: "tick" }
  | { readonly type: "pause" }
  | { readonly type: "resume" }
  | { readonly type: "togglePause" };

/** Injected so tests can control which piece comes next. */
export type PieceSource = () => PieceKind;

// NES scoring: points for 0..4 lines cleared at once, multiplied by (level + 1).
const LINE_CLEAR_POINTS = [0, 40, 100, 300, 1200] as const;
const SOFT_DROP_POINTS_PER_CELL = 1;
const HARD_DROP_POINTS_PER_CELL = 2;
export const LINES_PER_LEVEL = 10;

// Horizontal nudges tried in order when a rotation is blocked. A one-cell kick
// is enough to rotate against walls without the complexity of full SRS tables.
const ROTATION_KICKS = [0, -1, 1] as const;

const BASE_GRAVITY_MS = 800;
const GRAVITY_DECAY_PER_LEVEL = 0.85;
const MIN_GRAVITY_MS = 50;

/** Milliseconds between automatic one-row drops at a given level. */
export function gravityIntervalMs(level: number): number {
  return Math.max(MIN_GRAVITY_MS, BASE_GRAVITY_MS * GRAVITY_DECAY_PER_LEVEL ** level);
}

export function lineClearPoints(linesCleared: number, level: number): number {
  const base = LINE_CLEAR_POINTS[linesCleared as 0 | 1 | 2 | 3 | 4];
  if (base === undefined) throw new Error(`impossible line clear count: ${linesCleared}`);
  return base * (level + 1);
}

export function randomPieceSource(random: () => number): PieceSource {
  return () => {
    const kind = PIECE_KINDS[Math.floor(random() * PIECE_KINDS.length)];
    if (kind === undefined) throw new Error("random() must return a value in [0, 1)");
    return kind;
  };
}

function spawnPiece(kind: PieceKind): ActivePiece {
  const x = Math.floor((BOARD_WIDTH - shapeBoxSize(kind)) / 2);
  return { kind, rotation: 0, x, y: 0 };
}

export function createGame(nextPiece: PieceSource): GameState {
  return {
    board: createEmptyBoard(),
    active: spawnPiece(nextPiece()),
    score: 0,
    lines: 0,
    level: 0,
    status: "playing",
  };
}

function shifted(piece: ActivePiece, dx: number, dy: number): ActivePiece {
  return { ...piece, x: piece.x + dx, y: piece.y + dy };
}

/** Returns the moved state, or null if the move is blocked. */
function tryMove(state: GameState, dx: number, dy: number): GameState | null {
  const moved = shifted(state.active, dx, dy);
  return collides(state.board, moved) ? null : { ...state, active: moved };
}

function rotate(state: GameState): GameState {
  const turned: ActivePiece = { ...state.active, rotation: nextRotation(state.active.rotation) };
  for (const kick of ROTATION_KICKS) {
    const candidate = shifted(turned, kick, 0);
    if (!collides(state.board, candidate)) return { ...state, active: candidate };
  }
  return state;
}

/** Fixes the active piece in place, clears lines, scores, and spawns the next piece. */
function lockPiece(state: GameState, nextPiece: PieceSource): GameState {
  const merged = mergePiece(state.board, state.active);
  const { board, linesCleared } = clearFullRows(merged);
  const lines = state.lines + linesCleared;
  const score = state.score + lineClearPoints(linesCleared, state.level);
  const level = Math.floor(lines / LINES_PER_LEVEL);
  const active = spawnPiece(nextPiece());
  // Top-out: the new piece has nowhere to appear.
  const status: GameStatus = collides(board, active) ? "over" : "playing";
  return { board, active, score, lines, level, status };
}

function dropOrLock(state: GameState, nextPiece: PieceSource, pointsPerCell: number): GameState {
  const moved = tryMove(state, 0, 1);
  if (moved === null) return lockPiece(state, nextPiece);
  return { ...moved, score: moved.score + pointsPerCell };
}

function hardDrop(state: GameState, nextPiece: PieceSource): GameState {
  let current = state;
  let distance = 0;
  for (let moved = tryMove(current, 0, 1); moved !== null; moved = tryMove(current, 0, 1)) {
    current = moved;
    distance++;
  }
  const scored = { ...current, score: current.score + distance * HARD_DROP_POINTS_PER_CELL };
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
    case "moveLeft":
      return tryMove(state, -1, 0) ?? state;
    case "moveRight":
      return tryMove(state, 1, 0) ?? state;
    case "rotate":
      return rotate(state);
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
