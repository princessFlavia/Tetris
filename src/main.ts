import {
  createGame,
  gravityIntervalMs,
  randomPieceSource,
  step,
  type GameAction,
  type GameState,
} from "./core/rules";
import {
  renderHud,
  renderOverlay,
  showFatalError,
  type HudElements,
  type OverlayElements,
} from "./shell/hud";
import { bindAutoPause, bindKeyboard, type Command } from "./shell/input";
import { startLoop } from "./shell/loop";
import { createBoardView, createPreviewView, type BoardView, type PreviewView } from "./shell/render3d";
import { screenMove, screenRoll, screenTip } from "./shell/screen-controls";
import { browserStorage, loadHighScore, saveHighScore } from "./shell/storage";

function requireElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`missing #${id} element`);
  return element;
}

const hud: HudElements = {
  score: requireElement("score", HTMLElement),
  layers: requireElement("layers", HTMLElement),
  level: requireElement("level", HTMLElement),
  best: requireElement("best", HTMLElement),
};
const overlay: OverlayElements = {
  root: requireElement("overlay", HTMLElement),
  title: requireElement("overlay-title", HTMLElement),
  hint: requireElement("overlay-hint", HTMLElement),
};

let boardView: BoardView;
let previewView: PreviewView;
try {
  boardView = createBoardView(requireElement("board", HTMLCanvasElement));
  previewView = createPreviewView(requireElement("next", HTMLCanvasElement));
} catch (error) {
  showFatalError(overlay, "This browser couldn't start WebGL, which the 3D board needs.");
  throw error;
}

const nextPiece = randomPieceSource(Math.random);
const storage = browserStorage();
let highScore = loadHighScore(storage);
let state: GameState = createGame(nextPiece);
let gravityElapsedMs = 0;

function recordHighScore(previous: GameState, current: GameState): void {
  const justEnded = previous.status !== "over" && current.status === "over";
  if (justEnded && current.score > highScore) {
    highScore = current.score;
    saveHighScore(storage, highScore);
  }
}

/** Screen-relative inputs depend on how far the tower has turned; resolve them now. */
function resolveCommand(command: Exclude<Command, { type: "restart" }>): GameAction {
  switch (command.type) {
    case "screenMove":
      return screenMove(command.direction, boardView.towerAngle());
    case "screenTip":
      return screenTip(command.direction, boardView.towerAngle());
    case "screenRoll":
      return screenRoll(command.direction, boardView.towerAngle());
    default:
      return command;
  }
}

function handleCommand(command: Command): void {
  if (command.type === "restart") {
    // Only restart from game over so a stray R mid-game doesn't wipe a run.
    if (state.status === "over") {
      state = createGame(nextPiece);
      gravityElapsedMs = 0;
    }
    return;
  }
  const previous = state;
  state = step(state, resolveCommand(command), nextPiece);
  recordHighScore(previous, state);
}

function onFrame(deltaMs: number): void {
  if (state.status === "playing") {
    gravityElapsedMs += deltaMs;
    const interval = gravityIntervalMs(state.level);
    while (gravityElapsedMs >= interval && state.status === "playing") {
      gravityElapsedMs -= interval;
      handleCommand({ type: "tick" });
    }
  } else {
    gravityElapsedMs = 0;
  }
  boardView.render(state, deltaMs);
  previewView.render(state.next, deltaMs, state.status !== "paused");
  renderHud(hud, state, highScore);
  renderOverlay(overlay, state.status);
}

bindKeyboard(window, handleCommand);
bindAutoPause(window, () => handleCommand({ type: "pause" }));
startLoop(onFrame);
