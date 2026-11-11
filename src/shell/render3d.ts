import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  GridHelper,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { BOARD_DEPTH, BOARD_HEIGHT, BOARD_WIDTH } from "../core/board";
import { PIECE_KINDS, baseShape, pieceCells, shapeSize, type PieceKind, type Vec3 } from "../core/pieces";
import { landingPiece, type GameState } from "../core/rules";
import { BACKGROUND, FRAME_COLOR, LANDING_EDGE_COLOR, PIECE_COLORS } from "./colors";

const BOARD_CANVAS_WIDTH = 420;
const BOARD_CANVAS_HEIGHT = 640;
const PREVIEW_CANVAS_SIZE = 96;

// One full turn of the tower every 24s; the preview spins faster since it's decorative.
const BOARD_SPIN_PERIOD_MS = 24_000;
const PREVIEW_SPIN_PERIOD_MS = 6_000;
const FULL_TURN = Math.PI * 2;

// Cubes are slightly smaller than their 1-unit cell so gaps keep the grid readable.
const CUBE_SIZE = 0.92;
const MAX_PIECE_CUBES = 4;
const LANDING_OPACITY = 0.35;

function toColorMap(source: Readonly<Record<PieceKind, string>>): ReadonlyMap<PieceKind, Color> {
  return new Map(PIECE_KINDS.map((kind) => [kind, new Color(source[kind])]));
}

const PIECE_CUBE_COLORS = toColorMap(PIECE_COLORS);

function pieceColor(kind: PieceKind): Color {
  const color = PIECE_CUBE_COLORS.get(kind);
  if (color === undefined) throw new Error(`no colour for piece ${kind}`);
  return color;
}

export interface BoardView {
  render(state: GameState, deltaMs: number): void;
  /** Current spin in radians; controls use it to map screen directions onto the board. */
  towerAngle(): number;
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

/** Board cell → position in the tower group, centred on the spin axis. */
function cellToLocal({ x, y, z }: Vec3): Vec3 {
  return {
    x: x - (BOARD_WIDTH - 1) / 2,
    y: y - (BOARD_HEIGHT - 1) / 2,
    z: z - (BOARD_DEPTH - 1) / 2,
  };
}

/** Glass outline of the tower, a grid on its floor, and a base slab. */
function createWellFrame(): Group {
  const frame = new Group();
  const outline = new LineSegments(
    new EdgesGeometry(new BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, BOARD_DEPTH)),
    new LineBasicMaterial({ color: FRAME_COLOR }),
  );
  // The floor is square (width = depth), which is what GridHelper draws.
  const floorGrid = new GridHelper(BOARD_WIDTH, BOARD_WIDTH, FRAME_COLOR, FRAME_COLOR);
  floorGrid.position.y = -BOARD_HEIGHT / 2 + 0.01;
  const base = new Mesh(
    new BoxGeometry(BOARD_WIDTH + 0.6, 0.4, BOARD_DEPTH + 0.6),
    new MeshStandardMaterial({ color: FRAME_COLOR }),
  );
  base.position.y = -BOARD_HEIGHT / 2 - 0.2;
  frame.add(outline, floorGrid, base);
  return frame;
}

/**
 * An instanced mesh draws many cubes in one draw call. Slots are rewritten every
 * frame from the game state, so there's no per-cube bookkeeping.
 */
function createCubeBatch(capacity: number, material: MeshStandardMaterial | MeshBasicMaterial): InstancedMesh {
  const batch = new InstancedMesh(new BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE), material, capacity);
  // Instance count changes every frame, so a cached bounding sphere would go stale.
  batch.frustumCulled = false;
  // Create the colour buffer up front so the shader is compiled with per-instance colours.
  batch.setColorAt(0, new Color(0xffffff));
  batch.count = 0;
  return batch;
}

/**
 * White wire edges around each landing cube, so the target spots stand out
 * against the stack. Lines can't be instanced, so there's one per possible cube.
 */
function createLandingEdges(): LineSegments[] {
  const edges = new EdgesGeometry(new BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE));
  const material = new LineBasicMaterial({ color: LANDING_EDGE_COLOR });
  return Array.from({ length: MAX_PIECE_CUBES }, () => {
    const outline = new LineSegments(edges, material);
    outline.visible = false;
    return outline;
  });
}

/** Writes cubes into a batch; call `finish` once all are placed. */
function batchWriter(batch: InstancedMesh): { place(cell: Vec3, color: Color): void; finish(): void } {
  const matrix = new Matrix4();
  let count = 0;
  return {
    place(cell, color) {
      const { x, y, z } = cellToLocal(cell);
      batch.setMatrixAt(count, matrix.makeTranslation(x, y, z));
      batch.setColorAt(count, color);
      count++;
    },
    finish() {
      batch.count = count;
      batch.instanceMatrix.needsUpdate = true;
      if (batch.instanceColor !== null) batch.instanceColor.needsUpdate = true;
    },
  };
}

export function createBoardView(canvas: HTMLCanvasElement): BoardView {
  const renderer = createRenderer(canvas, BOARD_CANVAS_WIDTH, BOARD_CANVAS_HEIGHT);
  const scene = new Scene();
  addLights(scene);

  const camera = new PerspectiveCamera(45, BOARD_CANVAS_WIDTH / BOARD_CANVAS_HEIGHT, 0.1, 200);
  // Raised camera looking down: you see into the tower and the tops of the floors.
  camera.position.set(0, 9, 24);
  camera.lookAt(0, -1, 0);

  const tower = new Group();
  const lockedCubes = createCubeBatch(
    BOARD_WIDTH * BOARD_DEPTH * BOARD_HEIGHT,
    new MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 }),
  );
  const fallingCubes = createCubeBatch(MAX_PIECE_CUBES, new MeshStandardMaterial({ roughness: 0.3, metalness: 0.1 }));
  // depthWrite off so the see-through landing outline never hides cubes behind it.
  const landingCubes = createCubeBatch(
    MAX_PIECE_CUBES,
    new MeshBasicMaterial({ transparent: true, opacity: LANDING_OPACITY, depthWrite: false }),
  );
  const landingEdges = createLandingEdges();
  tower.add(createWellFrame(), lockedCubes, fallingCubes, landingCubes, ...landingEdges);
  scene.add(tower);

  return {
    towerAngle: () => tower.rotation.y,
    render(state, deltaMs) {
      if (state.status !== "paused") {
        tower.rotation.y = advanceSpin(tower.rotation.y, deltaMs, BOARD_SPIN_PERIOD_MS);
      }

      const locked = batchWriter(lockedCubes);
      state.board.forEach((layer, y) => {
        layer.forEach((row, z) => {
          row.forEach((cell, x) => {
            if (cell !== null) locked.place({ x, y, z }, pieceColor(cell));
          });
        });
      });
      locked.finish();

      const falling = batchWriter(fallingCubes);
      const landing = batchWriter(landingCubes);
      for (const outline of landingEdges) outline.visible = false;
      // On game over the spawned piece overlaps the stack, so skip drawing it.
      if (state.status !== "over") {
        const color = pieceColor(state.active.kind);
        for (const cell of pieceCells(state.active)) falling.place(cell, color);
        pieceCells(landingPiece(state.board, state.active)).forEach((cell, index) => {
          landing.place(cell, color);
          const outline = landingEdges[index];
          if (outline === undefined) return;
          const { x, y, z } = cellToLocal(cell);
          outline.position.set(x, y, z);
          outline.visible = true;
        });
      }
      falling.finish();
      landing.finish();

      renderer.render(scene, camera);
    },
  };
}

function buildPieceGroup(kind: PieceKind, geometry: BoxGeometry, material: MeshStandardMaterial): Group {
  const shape = baseShape(kind);
  const size = shapeSize(shape);
  const group = new Group();
  for (const { x, y, z } of shape) {
    const cube = new Mesh(geometry, material);
    // Centre the piece on the spin axis so it turns in place instead of orbiting.
    cube.position.set(x - (size.x - 1) / 2, y - (size.y - 1) / 2, z - (size.z - 1) / 2);
    group.add(cube);
  }
  return group;
}

export function createPreviewView(canvas: HTMLCanvasElement): PreviewView {
  const renderer = createRenderer(canvas, PREVIEW_CANVAS_SIZE, PREVIEW_CANVAS_SIZE);
  const scene = new Scene();
  addLights(scene);

  const camera = new PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 3, 8);
  camera.lookAt(0, 0, 0);

  const geometry = new BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const materials = new Map<PieceKind, MeshStandardMaterial>(
    PIECE_KINDS.map((kind) => [kind, new MeshStandardMaterial({ color: pieceColor(kind), roughness: 0.45 })]),
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
      piece.rotation.set(0.25, angle, 0);
      renderer.render(scene, camera);
    },
  };
}
