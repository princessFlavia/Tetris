import { BOARD_HEIGHT, BOARD_WIDTH } from "../core/board";
import { pieceCells, type PieceKind } from "../core/pieces";
import type { GameState } from "../core/rules";

const CELL_SIZE = 30;

const PIECE_COLORS: Record<PieceKind, string> = {
  I: "#38bdf8",
  O: "#facc15",
  T: "#a78bfa",
  S: "#4ade80",
  Z: "#f87171",
  J: "#60a5fa",
  L: "#fb923c",
};

const BACKGROUND = "#0f172a";
const GRID_LINE = "#1e293b";
const OVERLAY = "rgba(15, 23, 42, 0.75)";
const OVERLAY_TEXT = "#f8fafc";

export interface HudElements {
  readonly score: HTMLElement;
  readonly lines: HTMLElement;
  readonly level: HTMLElement;
  readonly best: HTMLElement;
}

/** Sizes the canvas backing store for the device pixel ratio so blocks stay crisp. */
export function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ratio = window.devicePixelRatio || 1;
  const width = BOARD_WIDTH * CELL_SIZE;
  const height = BOARD_HEIGHT * CELL_SIZE;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("2D canvas context unavailable");
  context.scale(ratio, ratio);
  return context;
}

function drawBlock(context: CanvasRenderingContext2D, x: number, y: number, kind: PieceKind): void {
  const inset = 1;
  context.fillStyle = PIECE_COLORS[kind];
  context.fillRect(
    x * CELL_SIZE + inset,
    y * CELL_SIZE + inset,
    CELL_SIZE - inset * 2,
    CELL_SIZE - inset * 2,
  );
}

function drawGrid(context: CanvasRenderingContext2D): void {
  context.strokeStyle = GRID_LINE;
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 1; x < BOARD_WIDTH; x++) {
    context.moveTo(x * CELL_SIZE + 0.5, 0);
    context.lineTo(x * CELL_SIZE + 0.5, BOARD_HEIGHT * CELL_SIZE);
  }
  for (let y = 1; y < BOARD_HEIGHT; y++) {
    context.moveTo(0, y * CELL_SIZE + 0.5);
    context.lineTo(BOARD_WIDTH * CELL_SIZE, y * CELL_SIZE + 0.5);
  }
  context.stroke();
}

function drawOverlay(context: CanvasRenderingContext2D, title: string, hint: string): void {
  const width = BOARD_WIDTH * CELL_SIZE;
  const height = BOARD_HEIGHT * CELL_SIZE;
  context.fillStyle = OVERLAY;
  context.fillRect(0, 0, width, height);
  context.fillStyle = OVERLAY_TEXT;
  context.textAlign = "center";
  context.font = "bold 28px system-ui, sans-serif";
  context.fillText(title, width / 2, height / 2 - 10);
  context.font = "16px system-ui, sans-serif";
  context.fillText(hint, width / 2, height / 2 + 20);
}

export function renderBoard(context: CanvasRenderingContext2D, state: GameState): void {
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, BOARD_WIDTH * CELL_SIZE, BOARD_HEIGHT * CELL_SIZE);
  drawGrid(context);

  state.board.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell !== null) drawBlock(context, x, y, cell);
    });
  });

  // On game over the spawned piece overlaps the stack, so skip drawing it.
  if (state.status !== "over") {
    for (const { x, y } of pieceCells(state.active)) drawBlock(context, x, y, state.active.kind);
  }

  if (state.status === "paused") drawOverlay(context, "Paused", "Press P to resume");
  if (state.status === "over") drawOverlay(context, "Game Over", "Press R to restart");
}

export function renderHud(hud: HudElements, state: GameState, highScore: number): void {
  hud.score.textContent = String(state.score);
  hud.lines.textContent = String(state.lines);
  hud.level.textContent = String(state.level);
  hud.best.textContent = String(Math.max(highScore, state.score));
}
