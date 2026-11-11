import { BOARD_DEPTH, BOARD_HEIGHT, BOARD_WIDTH, type Board } from "../core/board";
import { pieceCells, type PieceKind } from "../core/pieces";
import { landingPiece, type GameState } from "../core/rules";
import { BACKGROUND, FRAME_COLOR, PIECE_COLORS } from "./colors";
import { screenBasis } from "./screen-controls";

const MAP_CELL_SIZE = 30;
const MAP_GAP = 3;
const MAP_SIZE = BOARD_WIDTH * MAP_CELL_SIZE + (BOARD_WIDTH - 1) * MAP_GAP;
const LANDING_OUTLINE = "#f8fafc";
const HEIGHT_TEXT = "#0f172a";

/** What sits in one spot of the floor plan, looking straight down the tower. */
export interface ColumnSummary {
  readonly x: number;
  readonly z: number;
  /** Floors stacked in this spot, counting up to the highest cube. 0 = empty. */
  readonly height: number;
  /** The piece the highest cube belongs to, for its colour. */
  readonly topKind: PieceKind | null;
}

export function summarizeColumns(board: Board): ColumnSummary[] {
  const columns: ColumnSummary[] = [];
  for (let z = 0; z < BOARD_DEPTH; z++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      let height = 0;
      let topKind: PieceKind | null = null;
      for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
        const cell = board[y]?.[z]?.[x] ?? null;
        if (cell !== null) {
          height = y + 1;
          topKind = cell;
          break;
        }
      }
      columns.push({ x, z, height, topKind });
    }
  }
  return columns;
}

/**
 * Where a board spot appears on the map. The map turns with the tower in quarter
 * steps, matching the arrow keys: screen-left on the map is the way ← moves the piece,
 * and the top of the map is the far side of the tower.
 */
export function mapPosition(x: number, z: number, towerAngle: number): { col: number; row: number } {
  // Square floor, so one centre value serves both axes.
  const centre = (BOARD_WIDTH - 1) / 2;
  const { right, away } = screenBasis(towerAngle);
  const dx = x - centre;
  const dz = z - centre;
  return {
    col: centre + dx * right.x + dz * right.z,
    row: centre - (dx * away.x + dz * away.z),
  };
}

export function setupFloorMapCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = MAP_SIZE * ratio;
  canvas.height = MAP_SIZE * ratio;
  canvas.style.width = `${MAP_SIZE}px`;
  canvas.style.height = `${MAP_SIZE}px`;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("2D canvas context unavailable");
  context.scale(ratio, ratio);
  return context;
}

function cellOrigin(col: number, row: number): { left: number; top: number } {
  return { left: col * (MAP_CELL_SIZE + MAP_GAP), top: row * (MAP_CELL_SIZE + MAP_GAP) };
}

function drawColumn(context: CanvasRenderingContext2D, column: ColumnSummary, towerAngle: number): void {
  const { col, row } = mapPosition(column.x, column.z, towerAngle);
  const { left, top } = cellOrigin(col, row);
  if (column.topKind === null) {
    context.strokeStyle = FRAME_COLOR;
    context.lineWidth = 1;
    context.strokeRect(left + 0.5, top + 0.5, MAP_CELL_SIZE - 1, MAP_CELL_SIZE - 1);
    return;
  }
  context.fillStyle = PIECE_COLORS[column.topKind];
  context.fillRect(left, top, MAP_CELL_SIZE, MAP_CELL_SIZE);
  // The number is how many floors tall the stack is in this spot.
  context.fillStyle = HEIGHT_TEXT;
  context.fillText(String(column.height), left + MAP_CELL_SIZE / 2, top + MAP_CELL_SIZE / 2 + 1);
}

/** Top-down plan: stack height per spot, plus a white outline where the falling piece will land. */
export function renderFloorMap(context: CanvasRenderingContext2D, state: GameState, towerAngle: number): void {
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
  context.font = "bold 13px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const column of summarizeColumns(state.board)) drawColumn(context, column, towerAngle);

  if (state.status === "over") return;
  context.strokeStyle = LANDING_OUTLINE;
  context.lineWidth = 2;
  const footprint = new Set(pieceCells(landingPiece(state.board, state.active)).map(({ x, z }) => `${x},${z}`));
  for (const spot of footprint) {
    const [x, z] = spot.split(",").map(Number);
    if (x === undefined || z === undefined) continue;
    const { col, row } = mapPosition(x, z, towerAngle);
    const { left, top } = cellOrigin(col, row);
    context.strokeRect(left + 1, top + 1, MAP_CELL_SIZE - 2, MAP_CELL_SIZE - 2);
  }
}
