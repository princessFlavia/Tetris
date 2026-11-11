import type { GameState, GameStatus } from "../core/rules";

export interface HudElements {
  readonly score: HTMLElement;
  readonly lines: HTMLElement;
  readonly level: HTMLElement;
  readonly best: HTMLElement;
}

export interface OverlayElements {
  readonly root: HTMLElement;
  readonly title: HTMLElement;
  readonly hint: HTMLElement;
}

interface OverlayText {
  readonly title: string;
  readonly hint: string;
}

const OVERLAY_TEXT: Readonly<Record<GameStatus, OverlayText | null>> = {
  playing: null,
  paused: { title: "Paused", hint: "Press P to resume" },
  over: { title: "Game Over", hint: "Press R to restart" },
};

export function renderHud(hud: HudElements, state: GameState, highScore: number): void {
  hud.score.textContent = String(state.score);
  hud.lines.textContent = String(state.lines);
  hud.level.textContent = String(state.level);
  hud.best.textContent = String(Math.max(highScore, state.score));
}

function showOverlay(overlay: OverlayElements, text: OverlayText | null): void {
  overlay.root.hidden = text === null;
  if (text === null) return;
  overlay.title.textContent = text.title;
  overlay.hint.textContent = text.hint;
}

/** Runs every frame, so it only touches the DOM when the status actually changes. */
export function renderOverlay(overlay: OverlayElements, status: GameStatus): void {
  if (overlay.root.dataset["status"] === status) return;
  overlay.root.dataset["status"] = status;
  showOverlay(overlay, OVERLAY_TEXT[status]);
}

export function showFatalError(overlay: OverlayElements, message: string): void {
  overlay.root.dataset["status"] = "error";
  showOverlay(overlay, { title: "Can't start", hint: message });
}
