const HIGH_SCORE_KEY = "tetris.highScore";

export type ScoreStorage = Pick<Storage, "getItem" | "setItem">;

/** localStorage can throw on access (private mode, blocked site data), so we probe it. */
export function browserStorage(): ScoreStorage | null {
  try {
    return window.localStorage;
  } catch (error) {
    console.warn("localStorage unavailable; high score will not persist", error);
    return null;
  }
}

export function loadHighScore(storage: ScoreStorage | null): number {
  if (storage === null) return 0;
  try {
    const parsed = Number(storage.getItem(HIGH_SCORE_KEY));
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  } catch (error) {
    console.warn("could not read high score", error);
    return 0;
  }
}

export function saveHighScore(storage: ScoreStorage | null, score: number): void {
  if (storage === null) return;
  try {
    storage.setItem(HIGH_SCORE_KEY, String(score));
  } catch (error) {
    console.warn("could not save high score", error);
  }
}
