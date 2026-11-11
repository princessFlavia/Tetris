import type { Direction } from "../core/pieces";
import type { GameAction } from "../core/rules";
import type { ScreenDirection } from "./screen-controls";

/** Inputs that depend on the camera angle; main.ts resolves them into GameActions. */
export type ScreenCommand =
  | { readonly type: "screenMove"; readonly direction: ScreenDirection }
  | { readonly type: "screenTip"; readonly direction: Direction }
  | { readonly type: "screenRoll"; readonly direction: Direction };

export type ShellCommand = { readonly type: "restart" };
export type Command = GameAction | ScreenCommand | ShellCommand;

// Letter keys are stored lowercase and looked up case-insensitively, so they
// still work with Caps Lock on or while Shift (soft drop) is held.
const KEY_BINDINGS: Readonly<Record<string, Command>> = {
  ArrowLeft: { type: "screenMove", direction: "left" },
  ArrowRight: { type: "screenMove", direction: "right" },
  ArrowUp: { type: "screenMove", direction: "away" },
  ArrowDown: { type: "screenMove", direction: "toward" },
  q: { type: "rotate", axis: "y", direction: 1 },
  e: { type: "rotate", axis: "y", direction: -1 },
  w: { type: "screenTip", direction: -1 },
  s: { type: "screenTip", direction: 1 },
  a: { type: "screenRoll", direction: -1 },
  d: { type: "screenRoll", direction: 1 },
  " ": { type: "hardDrop" },
  Shift: { type: "softDrop" },
  p: { type: "togglePause" },
  r: { type: "restart" },
};

function bindingKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/** Maps key presses to commands. Relies on OS key repeat for held keys. */
export function bindKeyboard(target: Window, onCommand: (command: Command) => void): () => void {
  const handleKeyDown = (event: KeyboardEvent): void => {
    const command = KEY_BINDINGS[bindingKey(event.key)];
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
