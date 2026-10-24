import type { GameAction } from "../core/rules";

export type ShellCommand = { readonly type: "restart" };
export type Command = GameAction | ShellCommand;

const KEY_BINDINGS: Readonly<Record<string, Command>> = {
  ArrowLeft: { type: "moveLeft" },
  ArrowRight: { type: "moveRight" },
  ArrowUp: { type: "rotate" },
  ArrowDown: { type: "softDrop" },
  " ": { type: "hardDrop" },
  p: { type: "togglePause" },
  P: { type: "togglePause" },
  r: { type: "restart" },
  R: { type: "restart" },
};

/** Maps key presses to commands. Relies on OS key repeat for held keys. */
export function bindKeyboard(target: Window, onCommand: (command: Command) => void): () => void {
  const handleKeyDown = (event: KeyboardEvent): void => {
    const command = KEY_BINDINGS[event.key];
    if (command === undefined) return;
    // Stop arrows/space from scrolling the page.
    event.preventDefault();
    onCommand(command);
  };
  target.addEventListener("keydown", handleKeyDown);
  return () => target.removeEventListener("keydown", handleKeyDown);
}

/** Auto-pause whenever the player looks away (tab switch or window blur). */
export function bindAutoPause(target: Window, onPause: () => void): () => void {
  const handleVisibility = (): void => {
    if (target.document.visibilityState === "hidden") onPause();
  };
  target.document.addEventListener("visibilitychange", handleVisibility);
  target.addEventListener("blur", onPause);
  return () => {
    target.document.removeEventListener("visibilitychange", handleVisibility);
    target.removeEventListener("blur", onPause);
  };
}
