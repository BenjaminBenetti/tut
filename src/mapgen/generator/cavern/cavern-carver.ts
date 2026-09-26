import type { Rng } from "../../../core/model/rng";
import type { HiveCavernTuning } from "../../model/hive-cavern-tuning";
import { ValueNoise } from "../../service/value-noise";
import type {
  Board,
  CavernPlan,
  ChamberLobe,
  ChamberPlan,
  TunnelPlan,
} from "./cavern-planner";

// ===========================================
// Types
// ===========================================

/**
 * A carved cavern, column by column, row-major (`z * width + x`). Every
 * array covers the whole board.
 */
export interface CavernRaster {
  /** 1 where the column is cavern floor, 0 where it is rock. */
  readonly open: Uint8Array;
  /** Chamber index per column; -1 for tunnels and rock. */
  readonly chamberOf: Int16Array;
  /** 1 on the level spine: mouth, main route, burrows and core pad. */
  readonly spine: Uint8Array;
  /** Ground level per column: floors for open columns, rock tops elsewhere. */
  readonly level: Int16Array;
  /** The core pad by its lowest corner. */
  readonly corePad: {
    readonly x: number;
    readonly z: number;
    readonly size: number;
  };
}

// ===========================================
// Constants
// ===========================================

/** Rim noise frequency, per tile: a few bulges per chamber. */
const RIM_FREQUENCY = 0.18;

/** Tunnel wall noise frequency, per tile along the tunnel. */
const WALL_FREQUENCY = 0.3;

/** Upper bound on level repair sweeps; each sweep only moves toward the spine. */
const MAX_REPAIR_SWEEPS = 64;

/** Eight neighbours, for the rock's distance field. */
const NEIGHBOURS_8: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Four neighbours, for floor steps. */
const NEIGHBOURS_4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// ===========================================
// Carver
// ===========================================

/**
 * Carves a planned cavern into columns (#1179) and levels it.
 *
 * ```
 *   chambers ─► lobes ∪, noisy rim, kept `rimMargin` off the edge
 *   mouth    ─► flat pad for the drop ship from the lip inward
 *   tunnels  ─► brush along the centre line; main and burrow brushes are spine
 *   levels   ─► spine flat; terraces +1, ledges +2, pits −1 off it;
 *               repaired so every floor step is one layer (ledges two)
 *   rock     ─► nearest floor + wallLayers, rising away from the rim
 * ```
 *
 * The spine — mouth, main route, burrows and core pad — is one level end
 * to end: a 2×2 brute's footprint must sit on one level (#1130), so this
 * is what lets one walk from the edge to the core. Everything else
 * varies around it by one-layer steps, with the odd two-layer ledge for
 * the ramp pass to bridge (ADR 0008).
 */
export function carveCavern(
  plan: CavernPlan,
  board: Board,
  tuning: HiveCavernTuning,
  rng: Rng,
): CavernRaster {
  const columns = board.width * board.depth;
  const open = new Uint8Array(columns);
  const chamberOf = new Int16Array(columns).fill(-1);
  const spine = new Uint8Array(columns);
  carveChambers(
    plan,
    board,
    tuning,
    new ValueNoise(rng.fork("rim")),
    open,
    chamberOf,
  );
  carveMouthPad(plan, board, tuning, open, chamberOf, spine);
  carveTunnels(
    plan,
    board,
    tuning,
    new ValueNoise(rng.fork("walls")),
    open,
    spine,
  );
  const corePad = carveCorePad(plan, board, tuning, open, chamberOf, spine);
  const level = new Int16Array(columns);
  const ledge = new Uint8Array(columns);
  levelFloors(plan, board, tuning, rng.fork("levels"), {
    open,
    chamberOf,
    spine,
    level,
    ledge,
  });
  repairSteps(board, tuning.spineLevel, open, spine, ledge, level);
  raiseRock(board, tuning, open, level);
  return { open, chamberOf, spine, level, corePad };
}

// ===========================================
// Chambers
// ===========================================

/** Opens every chamber's lobes, first chamber to claim a column keeping it. */
function carveChambers(
  plan: CavernPlan,
  board: Board,
  tuning: HiveCavernTuning,
  noise: ValueNoise,
  open: Uint8Array,
  chamberOf: Int16Array,
): void {
  plan.chambers.forEach((chamber, index) => {
    const zMin = chamber.role === "mouth" ? tuning.mouthLip : tuning.rimMargin;
    for (const lobe of chamber.lobes) {
      forEachInLobe(lobe, board, tuning.rimNoise, (x, z) => {
        if (
          x < tuning.rimMargin ||
          x > board.width - 1 - tuning.rimMargin ||
          z < zMin ||
          z > board.depth - 1 - tuning.rimMargin
        ) {
          return;
        }
        const k =
          1 +
          tuning.rimNoise *
            (2 * noise.fbm(x * RIM_FREQUENCY, z * RIM_FREQUENCY, 2, 0.5) - 1);
        const dx = (x - lobe.x) / lobe.rx;
        const dz = (z - lobe.z) / lobe.rz;
        if (dx * dx + dz * dz > k * k) return;
        const i = z * board.width + x;
        open[i] = 1;
        if (chamberOf[i] === -1) chamberOf[i] = index;
      });
    }
  });
}

/** Visits every column inside the lobe's bounding box, noise margin included. */
function forEachInLobe(
  lobe: ChamberLobe,
  board: Board,
  noise: number,
  visit: (x: number, z: number) => void,
): void {
  const grow = 1 + noise;
  const x0 = Math.max(0, Math.floor(lobe.x - lobe.rx * grow) - 1);
  const x1 = Math.min(board.width - 1, Math.ceil(lobe.x + lobe.rx * grow) + 1);
  const z0 = Math.max(0, Math.floor(lobe.z - lobe.rz * grow) - 1);
  const z1 = Math.min(board.depth - 1, Math.ceil(lobe.z + lobe.rz * grow) + 1);
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) visit(x, z);
  }
}

/**
 * Opens the flat pad at the mouth, from the lip inward, wide and deep
 * enough for the drop ship's clearance, and makes the whole mouth spine.
 */
function carveMouthPad(
  plan: CavernPlan,
  board: Board,
  tuning: HiveCavernTuning,
  open: Uint8Array,
  chamberOf: Int16Array,
  spine: Uint8Array,
): void {
  const mouth = plan.chambers[0];
  if (mouth === undefined) return;
  const x0 = Math.max(
    tuning.rimMargin,
    mouth.centre.x - tuning.mouthPadHalfWidth,
  );
  const x1 = Math.min(
    board.width - 1 - tuning.rimMargin,
    mouth.centre.x + tuning.mouthPadHalfWidth,
  );
  const z1 = Math.min(
    board.depth - 1,
    tuning.mouthLip + tuning.mouthPadDepth - 1,
  );
  for (let z = tuning.mouthLip; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const i = z * board.width + x;
      open[i] = 1;
      chamberOf[i] = 0;
    }
  }
  for (let i = 0; i < chamberOf.length; i++) {
    if (chamberOf[i] === 0) spine[i] = 1;
  }
}

/**
 * The flat square the hive core stands on, at the core chamber's centre;
 * spine, so it is on the route's level.
 */
function carveCorePad(
  plan: CavernPlan,
  board: Board,
  tuning: HiveCavernTuning,
  open: Uint8Array,
  chamberOf: Int16Array,
  spine: Uint8Array,
): CavernRaster["corePad"] {
  const index = plan.chambers.findIndex((c) => c.role === "core");
  const core = plan.chambers[index];
  const size = tuning.corePadSize;
  const half = Math.floor(size / 2);
  const pad = {
    x: (core?.centre.x ?? 0) - half,
    z: (core?.centre.z ?? 0) - half,
    size,
  };
  for (let z = pad.z; z < pad.z + size; z++) {
    for (let x = pad.x; x < pad.x + size; x++) {
      const i = z * board.width + x;
      open[i] = 1;
      chamberOf[i] = index;
      spine[i] = 1;
    }
  }
  return pad;
}

// ===========================================
// Tunnels
// ===========================================

/**
 * Brushes every tunnel along its centre line. The wall bulges by up to
 * `tunnelWallJitter` past the brush, never inside it, so the planned
 * width is the least width. Main tunnels and burrows mark their brush as
 * spine; a burrow widens where it meets the edge so a spawn zone fits.
 */
function carveTunnels(
  plan: CavernPlan,
  board: Board,
  tuning: HiveCavernTuning,
  noise: ValueNoise,
  open: Uint8Array,
  spine: Uint8Array,
): void {
  plan.tunnels.forEach((tunnel, t) => {
    const onSpine = tunnel.kind !== "side";
    for (const p of tunnel.samples) {
      const bulge =
        tuning.tunnelWallJitter *
        noise.sample(p.x * WALL_FREQUENCY + t * 17, p.z * WALL_FREQUENCY);
      const nearEdge =
        tunnel.kind === "burrow" &&
        edgeDistance(board, p.x, p.z) <= tuning.rimMargin + 2;
      const brush = nearEdge
        ? Math.max(tuning.burrowMouthRadius, tunnel.radius)
        : tunnel.radius;
      const reach = brush + bulge;
      brushAround(p.x, p.z, reach, board, (x, z, d2) => {
        if (!allowedFor(tunnel, board, tuning, x, z)) return;
        const i = z * board.width + x;
        open[i] = 1;
        if (onSpine && d2 <= brush * brush) spine[i] = 1;
      });
    }
  });
}

/** Main and side tunnels stay inside the rock margin; burrows run to the edge. */
function allowedFor(
  tunnel: TunnelPlan,
  board: Board,
  tuning: HiveCavernTuning,
  x: number,
  z: number,
): boolean {
  if (tunnel.kind === "burrow") return true;
  return (
    x >= tuning.rimMargin &&
    x <= board.width - 1 - tuning.rimMargin &&
    z >= tuning.mouthLip &&
    z <= board.depth - 1 - tuning.rimMargin
  );
}

/** Visits every on-board column within `radius` of the point, with its squared distance. */
function brushAround(
  px: number,
  pz: number,
  radius: number,
  board: Board,
  visit: (x: number, z: number, d2: number) => void,
): void {
  const x0 = Math.max(0, Math.floor(px - radius));
  const x1 = Math.min(board.width - 1, Math.ceil(px + radius));
  const z0 = Math.max(0, Math.floor(pz - radius));
  const z1 = Math.min(board.depth - 1, Math.ceil(pz + radius));
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d2 <= radius * radius) visit(x, z, d2);
    }
  }
}

/** Distance from a point to the nearest map edge column. */
function edgeDistance(board: Board, x: number, z: number): number {
  return Math.min(x, z, board.width - 1 - x, board.depth - 1 - z);
}

// ===========================================
// Levels
// ===========================================

/** The arrays `levelFloors` writes through. */
interface FloorArrays {
  readonly open: Uint8Array;
  readonly chamberOf: Int16Array;
  readonly spine: Uint8Array;
  readonly level: Int16Array;
  readonly ledge: Uint8Array;
}

/**
 * Sets every floor to the spine level plus its chamber's offset, then
 * raises terraces, a ledge now and then, and sinks the odd pit, all off
 * the spine and never in the mouth.
 */
function levelFloors(
  plan: CavernPlan,
  board: Board,
  tuning: HiveCavernTuning,
  rng: Rng,
  floors: FloorArrays,
): void {
  const { open, chamberOf, spine, level, ledge } = floors;
  const raise = new Int8Array(open.length);
  const members = plan.chambers.map((): number[] => []);
  for (let i = 0; i < open.length; i++) {
    const c = chamberOf[i] ?? -1;
    if (open[i] === 1 && c >= 0) members[c]?.push(i);
  }
  plan.chambers.forEach((chamber, c) => {
    const tiles = members[c] ?? [];
    if (chamber.role === "mouth" || tiles.length === 0) return;
    const terraces = rng.nextInt(tuning.terraces.min, tuning.terraces.max);
    for (let n = 0; n < terraces; n++) {
      const share =
        tuning.terraceShare.min +
        rng.next() * (tuning.terraceShare.max - tuning.terraceShare.min);
      stampFeature(chamber, c, rng.pick(tiles), share, board, floors, (i) => {
        raise[i] = Math.max(raise[i] ?? 0, 1);
      });
    }
    if (rng.chance(tuning.ledgeChance)) {
      stampFeature(
        chamber,
        c,
        rng.pick(tiles),
        0.18 + 0.1 * rng.next(),
        board,
        floors,
        (i) => {
          raise[i] = 2;
          ledge[i] = 1;
        },
      );
    }
    if (rng.chance(tuning.pitChance)) {
      stampFeature(
        chamber,
        c,
        rng.pick(tiles),
        0.2 + 0.1 * rng.next(),
        board,
        floors,
        (i) => {
          if ((raise[i] ?? 0) === 0) raise[i] = -1;
        },
      );
    }
  });
  for (let i = 0; i < open.length; i++) {
    if (open[i] !== 1) continue;
    const c = chamberOf[i] ?? -1;
    const offset = c >= 0 ? (plan.chambers[c]?.floorOffset ?? 0) : 0;
    if (spine[i] === 1) {
      level[i] = tuning.spineLevel;
      ledge[i] = 0;
    } else {
      level[i] = tuning.spineLevel + offset + (raise[i] ?? 0);
    }
  }
}

/**
 * Applies `mark` to every off-spine column of chamber `c` inside an
 * ellipse at `anchor`, `share` of the chamber's radii across.
 */
function stampFeature(
  chamber: ChamberPlan,
  c: number,
  anchor: number,
  share: number,
  board: Board,
  floors: FloorArrays,
  mark: (i: number) => void,
): void {
  const ax = anchor % board.width;
  const az = Math.floor(anchor / board.width);
  const lobe = {
    x: ax,
    z: az,
    rx: Math.max(1, chamber.rx * share),
    rz: Math.max(1, chamber.radius * share),
  };
  forEachInLobe(lobe, board, 0, (x, z) => {
    const dx = (x - lobe.x) / lobe.rx;
    const dz = (z - lobe.z) / lobe.rz;
    if (dx * dx + dz * dz > 1) return;
    const i = z * board.width + x;
    if (floors.open[i] !== 1 || floors.spine[i] === 1) return;
    if (floors.chamberOf[i] !== c) return;
    mark(i);
  });
}

/**
 * Walks every floor step down to what ADR 0008 allows: one layer, or two
 * where a ledge meets lower ground (a cliff the ramp pass bridges). The
 * column farther from the spine level gives way, one layer per sweep,
 * and the spine never moves, so the sweeps converge.
 */
function repairSteps(
  board: Board,
  spineLevel: number,
  open: Uint8Array,
  spine: Uint8Array,
  ledge: Uint8Array,
  level: Int16Array,
): void {
  for (let sweep = 0; sweep < MAX_REPAIR_SWEEPS; sweep++) {
    let changed = false;
    for (let z = 0; z < board.depth; z++) {
      for (let x = 0; x < board.width; x++) {
        const i = z * board.width + x;
        if (open[i] !== 1) continue;
        for (const [dx, dz] of NEIGHBOURS_4) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= board.width || nz >= board.depth)
            continue;
          const j = nz * board.width + nx;
          if (open[j] !== 1) continue;
          const allowed = ledge[i] === 1 || ledge[j] === 1 ? 2 : 1;
          const a = level[i] ?? 0;
          const b = level[j] ?? 0;
          if (Math.abs(a - b) <= allowed) continue;
          const give = pickGiver(i, j, a, b, spineLevel, spine);
          const current = level[give] ?? 0;
          level[give] = current + Math.sign(spineLevel - current);
          changed = true;
        }
      }
    }
    if (!changed) return;
  }
}

/** Of two columns too far apart, the one that moves: never the spine, else the one farther from it. */
function pickGiver(
  i: number,
  j: number,
  a: number,
  b: number,
  spineLevel: number,
  spine: Uint8Array,
): number {
  if (spine[i] === 1) return j;
  if (spine[j] === 1) return i;
  return Math.abs(a - spineLevel) >= Math.abs(b - spineLevel) ? i : j;
}

// ===========================================
// Rock
// ===========================================

/**
 * Raises every rock column to the highest floor at its nearest distance
 * plus `wallLayers`, one more layer every `rockRiseEvery` columns back
 * from the rim up to `rockRiseMax`, so no floor meets a wall it could
 * climb and the rock mass reads as rising away from the cavern.
 */
function raiseRock(
  board: Board,
  tuning: HiveCavernTuning,
  open: Uint8Array,
  level: Int16Array,
): void {
  const distance = new Int16Array(open.length).fill(-1);
  const nearest = new Int16Array(open.length);
  const queue: number[] = [];
  for (let i = 0; i < open.length; i++) {
    if (open[i] !== 1) continue;
    distance[i] = 0;
    nearest[i] = level[i] ?? 0;
    queue.push(i);
  }
  // The queue grows as it is walked; for-of sees every pushed column.
  for (const u of queue) {
    const ux = u % board.width;
    const uz = Math.floor(u / board.width);
    const du = distance[u] ?? 0;
    for (const [dx, dz] of NEIGHBOURS_8) {
      const x = ux + dx;
      const z = uz + dz;
      if (x < 0 || z < 0 || x >= board.width || z >= board.depth) continue;
      const v = z * board.width + x;
      if (distance[v] === -1) {
        distance[v] = du + 1;
        nearest[v] = nearest[u] ?? 0;
        queue.push(v);
      } else if (distance[v] === du + 1) {
        nearest[v] = Math.max(nearest[v] ?? 0, nearest[u] ?? 0);
      }
    }
  }
  for (let i = 0; i < open.length; i++) {
    if (open[i] === 1) continue;
    const d = distance[i] ?? 1;
    const rise = Math.min(
      tuning.rockRiseMax,
      Math.floor(Math.max(0, d - 1) / tuning.rockRiseEvery),
    );
    level[i] = (nearest[i] ?? 0) + tuning.wallLayers + rise;
  }
}
