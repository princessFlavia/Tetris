import type { PieceKind } from "../core/pieces";

export const PIECE_COLORS: Readonly<Record<PieceKind, string>> = {
  I: "#38bdf8",
  O: "#facc15",
  T: "#a78bfa",
  S: "#4ade80",
  Z: "#f87171",
  J: "#60a5fa",
  L: "#fb923c",
  I3: "#2dd4bf",
  V: "#f472b6",
};

export const BACKGROUND = "#0f172a";
export const FRAME_COLOR = "#64748b";
