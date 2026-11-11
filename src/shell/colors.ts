import type { PieceKind } from "../core/pieces";

/** Colour of the falling piece and the preview, so you can tell which shape is coming. */
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
  TwistL: "#a3e635",
  TwistR: "#e879f9",
  Tripod: "#e2e8f0",
};

// Locked cubes are coloured by floor height instead of by piece, the usual
// convention in 3D block games: it makes depth readable at a glance.
export const LAYER_COLORS: readonly string[] = [
  "#1d4ed8",
  "#0891b2",
  "#059669",
  "#65a30d",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#c026d3",
];

export const BACKGROUND = "#0f172a";
export const FRAME_COLOR = "#64748b";
