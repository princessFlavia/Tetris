import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from "three";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../core/board";
import { PIECE_KINDS, pieceCells, pieceOffsets, type PieceKind } from "../core/pieces";
import type { GameState } from "../core/rules";
import { BACKGROUND, FRAME_COLOR, PIECE_COLORS } from "./colors";

const BOARD_CANVAS_WIDTH = 420;
const BOARD_CANVAS_HEIGHT = 640;
const PREVIEW_CANVAS_SIZE = 96;

// One full turn of the tower every 24s; the preview spins faster since it's decorative.
const BOARD_SPIN_PERIOD_MS = 24_000;
const PREVIEW_SPIN_PERIOD_MS = 6_000;
const FULL_TURN = Math.PI * 2;

// Cubes are slightly smaller than their 1-unit cell so gaps keep the grid readable.
const CUBE_SIZE = 0.92;
const MAX_ACTIVE_CELLS = 4;

const CUBE_COLORS: ReadonlyMap<PieceKind, Color> = new Map(
  PIECE_KINDS.map((kind) => [kind, new Color(PIECE_COLORS[kind])]),
);

function cubeColor(kind: PieceKind): Color {
  const color = CUBE_COLORS.get(kind);
  if (color === undefined) throw new Error(`no colour for piece ${kind}`);
  return color;
}

export interface BoardView {
  render(state: GameState, deltaMs: number): void;
}

export interface PreviewView {
  render(kind: PieceKind, deltaMs: number, spinning: boolean): void;
}

function createRenderer(canvas: HTMLCanvasElement, width: number, height: number): WebGLRenderer {
  // Throws if WebGL is unavailable; main.ts turns that into a visible message.
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(width, height);
  renderer.setClearColor(BACKGROUND);
  return renderer;
}

/** Lights stay fixed in the world, so faces brighten and darken as the tower turns. */
function addLights(scene: Scene): void {
  scene.add(new AmbientLight(0xffffff, 1.2));
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(8, 14, 16);
  // Dimmer fill from behind so the back of the tower isn't muddy mid-spin.
  const back = new DirectionalLight(0xffffff, 1.4);
  back.position.set(-8, 10, -16);
  scene.add(key, back);
}

function advanceSpin(angle: number, deltaMs: number, periodMs: number): number {
  return (angle + (deltaMs / periodMs) * FULL_TURN) % FULL_TURN;
}

/** Glass-like outline of the play area plus a base, so the well is readable at every angle. */
function createWellFrame(): Group {
  const frame = new Group();
  const outline = new LineSegments(
    new EdgesGeometry(new BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, 1)),
    new LineBasicMaterial({ color: FRAME_COLOR }),
  );
  const backing = new Mesh(
    new PlaneGeometry(BOARD_WIDTH, BOARD_HEIGHT),
    // depthWrite off so the translucent panel never hides cubes behind it.
    new MeshBasicMaterial({ color: FRAME_COLOR, transparent: true, opacity: 0.08, side: DoubleSide, depthWrite: false }),
  );
  const base = new Mesh(
    new BoxGeometry(BOARD_WIDTH + 0.6, 0.4, 1.6),
    new MeshStandardMaterial({ color: FRAME_COLOR }),
  );
  base.position.y = -BOARD_HEIGHT / 2 - 0.2;
  frame.add(outline, backing, base);
  return frame;
}

/** Board cell (x right, y down) → world position centred on the tower's spin axis. */
function setCellMatrix(target: Matrix4, x: number, y: number): Matrix4 {
  return target.makeTranslation(x - (BOARD_WIDTH - 1) / 2, (BOARD_HEIGHT - 1) / 2 - y, 0);
}

export function createBoardView(canvas: HTMLCanvasElement): BoardView {
  const renderer = createRenderer(canvas, BOARD_CANVAS_WIDTH, BOARD_CANVAS_HEIGHT);
  const scene = new Scene();
  addLights(scene);

  const camera = new PerspectiveCamera(45, BOARD_CANVAS_WIDTH / BOARD_CANVAS_HEIGHT, 0.1, 200);
  // Slightly above centre so the tops of cubes show and the 3D depth reads.
  camera.position.set(0, 5, 30);
  camera.lookAt(0, -0.5, 0);

  const tower = new Group();
  tower.add(createWellFrame());

  // One instanced mesh draws every cube in a single draw call; slots are
  // rewritten each frame from the game state, so there's no per-cube bookkeeping.
  const cubes = new InstancedMesh(
    new BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE),
    new MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 }),
    BOARD_WIDTH * BOARD_HEIGHT + MAX_ACTIVE_CELLS,
  );
  // Instance count changes every frame, so a cached bounding sphere would go stale.
  cubes.frustumCulled = false;
  // Create the colour buffer up front so the shader is compiled with per-instance colours.
  cubes.setColorAt(0, cubeColor("I"));
  tower.add(cubes);
  scene.add(tower);

  const scratch = new Matrix4();

  return {
    render(state, deltaMs) {
      if (state.status !== "paused") {
        tower.rotation.y = advanceSpin(tower.rotation.y, deltaMs, BOARD_SPIN_PERIOD_MS);
      }

      let count = 0;
      const place = (x: number, y: number, kind: PieceKind): void => {
        cubes.setMatrixAt(count, setCellMatrix(scratch, x, y));
        cubes.setColorAt(count, cubeColor(kind));
        count++;
      };

      state.board.forEach((row, y) => {
        row.forEach((cell, x) => {
          if (cell !== null) place(x, y, cell);
        });
      });
      // On game over the spawned piece overlaps the stack, so skip drawing it.
      if (state.status !== "over") {
        for (const { x, y } of pieceCells(state.active)) place(x, y, state.active.kind);
      }

      cubes.count = count;
      cubes.instanceMatrix.needsUpdate = true;
      if (cubes.instanceColor !== null) cubes.instanceColor.needsUpdate = true;
      renderer.render(scene, camera);
    },
  };
}

function buildPieceGroup(kind: PieceKind, geometry: BoxGeometry, material: MeshStandardMaterial): Group {
  const offsets = pieceOffsets(kind, 0);
  const xs = offsets.map((cell) => cell.x);
  const ys = offsets.map((cell) => cell.y);
  // Centre the piece on the spin axis so it turns in place instead of orbiting.
  const centreX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centreY = (Math.min(...ys) + Math.max(...ys)) / 2;

  const group = new Group();
  for (const { x, y } of offsets) {
    const cube = new Mesh(geometry, material);
    cube.position.set(x - centreX, centreY - y, 0);
    group.add(cube);
  }
  return group;
}

export function createPreviewView(canvas: HTMLCanvasElement): PreviewView {
  const renderer = createRenderer(canvas, PREVIEW_CANVAS_SIZE, PREVIEW_CANVAS_SIZE);
  const scene = new Scene();
  addLights(scene);

  const camera = new PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 1.5, 8);
  camera.lookAt(0, 0, 0);

  const geometry = new BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const materials = new Map<PieceKind, MeshStandardMaterial>(
    PIECE_KINDS.map((kind) => [kind, new MeshStandardMaterial({ color: cubeColor(kind), roughness: 0.45 })]),
  );

  let shownKind: PieceKind | null = null;
  let piece = new Group();
  let angle = 0;
  scene.add(piece);

  return {
    render(kind, deltaMs, spinning) {
      if (kind !== shownKind) {
        const material = materials.get(kind);
        if (material === undefined) throw new Error(`no material for piece ${kind}`);
        scene.remove(piece);
        piece = buildPieceGroup(kind, geometry, material);
        scene.add(piece);
        shownKind = kind;
      }
      if (spinning) angle = advanceSpin(angle, deltaMs, PREVIEW_SPIN_PERIOD_MS);
      piece.rotation.set(0.35, angle, 0);
      renderer.render(scene, camera);
    },
  };
}
