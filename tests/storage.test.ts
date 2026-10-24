import { describe, expect, it } from "vitest";
import { loadHighScore, saveHighScore, type ScoreStorage } from "../src/shell/storage";

function memoryStorage(): ScoreStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const throwingStorage: ScoreStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("high score storage", () => {
  it("round-trips a score", () => {
    const storage = memoryStorage();
    saveHighScore(storage, 4200);
    expect(loadHighScore(storage)).toBe(4200);
  });

  it("defaults to 0 for missing or garbage values", () => {
    const storage = memoryStorage();
    expect(loadHighScore(storage)).toBe(0);
    storage.setItem("tetris.highScore", "not a number");
    expect(loadHighScore(storage)).toBe(0);
  });

  it("survives storage that throws", () => {
    expect(loadHighScore(throwingStorage)).toBe(0);
    expect(() => saveHighScore(throwingStorage, 10)).not.toThrow();
    expect(loadHighScore(null)).toBe(0);
  });
});
