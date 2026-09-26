import type { Rng } from "../../../core/model/rng";
import { SurfaceIds } from "../../data/surfaces";
import { HookKinds } from "../../model/hook";
import type { MapDimensions } from "../../model/map-recipe";
import type { ColumnCoord } from "../../model/road";
import type { CoreTuning } from "../../model/spore-platform-tuning";
import type { SporePlatformTuning } from "../../model/spore-platform-tuning";
import type { SurfaceId } from "../../model/surface";
import { NEIGHBOURS_4, PlatformRaster, polylinePath } from "./platform-raster";

// ===========================================
// Constants
// ===========================================

/** Plate surfaces by rise above the deck: walnut, chestnut, walnut. */
const RISE_SURFACES: readonly SurfaceId[] = [
  SurfaceIds.HULL_PLATE_DARK,
  SurfaceIds.HULL_PLATE,
  SurfaceIds.HULL_PLATE_DARK,
];

/** Radians either side of the lane that no artery takes. */
const ARTERY_LANE_CLEARANCE = 0.5;

/** Where the rim walkway runs, in tiles in from the chamber's radius. */
const WALKWAY_INSET = 4.5;

/** Radii inside the rim a wall niche's centre may take, preferred first. */
const NICHE_INSETS: readonly number[] = [1.5, 1, 0.5];

// ===========================================
// Core shaper
// ===========================================

/** The core chamber as the shaper planned it, beside its raster. */
export interface CoreShape {
  readonly raster: PlatformRaster;
  /** Row-major 1 inside the round chamber. */
  readonly chamber: Uint8Array;
  /** The chamber's centre, halfway between the lane's middle columns. */
  readonly centre: ColumnCoord;
  readonly radius: number;
}

/**
 * Shapes the spore platform's core chamber (#1179), the finale's second
 * stage: a round chamber hanging in the platform's dark interior,
 * reached from the start pad at the near edge along one narrow causeway
 * over the void. Inside the rim walkway a berm of terraces rises a layer
 * at a time and steps down again into the arena, where the Sovereign's
 * dais stands before the core seed's pad, flanked by guard posts. A
 * lane cuts through the berm from the gate to the dais, and two bug
 * ducts run from the side edges through the berm's back flanks into
 * the arena. Causeway, lane, walkway, ducts and arena share the deck's
 * level, so a 2×2 brute, which never changes level (#1130), and the
 * 4×4 Sovereign walk every one of them.
 *
 * ```
 *   ··········[D]··········    D start pad (deploy)
 *   ···········║···········    ║ causeway: the only way in from deploy
 *   ······▒▒▒▒▒║▒▒▒▒▒······    ▒ rim walkway (niches, wall pods), deck level
 *   ····▒▒░░░░░║░░░░░▒▒····    ░ berm: terraces +1, +2, +1 layers
 *   ···▒▒░░ g ·S· g ░░▒▒···    · arena at deck level; S dais, g guard posts
 *   ═══════════ C ═════════    C core seed pad, ═ ducts into the arena
 *   ····▒▒░░░░░░░░░░░▒▒····
 *   ·······▒▒▒▒▒▒▒▒▒·······
 * ```
 */
export function shapeCore(
  board: MapDimensions,
  tuning: SporePlatformTuning,
  rng: Rng,
): CoreShape {
  const raster = new PlatformRaster(board);
  const core = tuning.core;
  const level = tuning.deckLevel;
  const cx = Math.floor(raster.width / 2);
  const radius = core.chamberRadius;
  const causeway = rng.nextInt(
    core.causewayLength.min,
    core.causewayLength.max,
  );
  const front = core.startPadDepth + causeway;
  const centre = { x: cx - 0.5, z: front + radius };
  const chamber = new Uint8Array(raster.width * raster.depth);

  // The round chamber: walkway, berm and arena.
  for (let z = 0; z < raster.depth; z++) {
    for (let x = 0; x < raster.width; x++) {
      const d = Math.hypot(x - centre.x, z - centre.z);
      if (d > radius + 0.25) continue;
      const rise = riseAt(core, d);
      raster.setDeck(x, z, level + rise, RISE_SURFACES[rise]!);
      chamber[raster.indexOf(x, z)] = 1;
    }
  }

  // The start pad at the near edge and the causeway over the void.
  const padFrom = cx - core.startPadHalfWidth;
  for (let z = 0; z < core.startPadDepth; z++) {
    for (let x = padFrom; x < cx + core.startPadHalfWidth; x++) {
      raster.setDeck(x, z, level, SurfaceIds.HULL_PLATE_DARK);
    }
  }
  const causewayFrom = cx - Math.floor(core.causewayWidth / 2);
  for (let z = core.startPadDepth; z <= front; z++) {
    for (let x = causewayFrom; x < causewayFrom + core.causewayWidth; x++) {
      raster.setDeck(x, z, level, SurfaceIds.HULL_PLATE);
      raster.route[raster.indexOf(x, z)] = 1;
    }
  }
  raster.routes.push({
    id: "causeway",
    kind: "causeway",
    minWidth: core.causewayWidth,
    path: polylinePath([
      { x: cx, z: 0 },
      { x: cx, z: front },
    ]),
  });

  // The lane cut through the berm from the gate to the dais, at deck
  // level all the way.
  const laneFrom = cx - Math.floor(core.laneWidth / 2);
  const daisZ = Math.round(centre.z) - 3 - core.daisSize;
  const coreZ = Math.round(centre.z) - 2;
  const laneEnd = daisZ - 2;
  for (let z = front; z <= laneEnd; z++) {
    for (let x = laneFrom; x < laneFrom + core.laneWidth; x++) {
      if (!raster.isDeck(x, z)) continue;
      raster.setDeck(x, z, level, SurfaceIds.HULL_PLATE);
      raster.route[raster.indexOf(x, z)] = 1;
    }
  }
  raster.routes.push({
    id: "lane",
    kind: "lane",
    minWidth: core.laneWidth,
    path: polylinePath([
      { x: cx, z: front },
      { x: cx, z: laneEnd },
    ]),
  });

  // The rim walkway round the chamber, at deck level inside the wall.
  const walkway = ringPath(centre, radius - WALKWAY_INSET);
  raster.layRoute(
    { id: "ring", kind: "ring", minWidth: 3, path: walkway },
    1,
    level,
  );

  // The dais, the core pad behind it and the guard posts either side,
  // all flush with the arena so the Sovereign can leave the dais and
  // fall back to the core.
  const inner = level;
  raster.layPad(
    {
      kind: HookKinds.SOVEREIGN_DAIS,
      x: cx - core.daisSize / 2,
      z: daisZ,
      size: core.daisSize,
      level: inner,
    },
    SurfaceIds.HULL_PLATE,
  );
  raster.layPad(
    {
      kind: HookKinds.PLATFORM_CORE,
      x: cx - core.corePadSize / 2,
      z: coreZ,
      size: core.corePadSize,
      level: inner,
    },
    SurfaceIds.INFESTED,
  );
  layGuardPosts(raster, core, cx, daisZ, inner);
  raster.layPad(
    {
      kind: HookKinds.DEPLOY,
      x: cx - 2,
      z: 1,
      size: 4,
      level,
    },
    SurfaceIds.HULL_PLATE_DARK,
  );

  const arena = arenaRadius(core);
  const ducts = [
    layDuct(raster, core, centre, arena, "west", level, rng.fork("west")),
    layDuct(raster, core, centre, arena, "east", level, rng.fork("east")),
  ];
  carveNiches(raster, core, centre, radius, ducts, rng.fork("niches"));
  paintArteries(raster, core, centre, rng.fork("arteries"));
  paintLips(raster);
  paintRim(raster);
  return { raster, chamber, centre, radius };
}

// ===========================================
// Terraces
// ===========================================

/** Layers above the deck at a distance from the centre: a ring's rise, 0 in the arena. */
function riseAt(core: CoreTuning, distance: number): number {
  let edge = core.chamberRadius;
  for (const ring of core.terraces) {
    edge -= ring.width;
    if (distance >= edge) return ring.rise;
  }
  return 0;
}

/** Radius of the arena inside the last terrace ring. */
function arenaRadius(core: CoreTuning): number {
  return core.terraces.reduce(
    (radius, ring) => radius - ring.width,
    core.chamberRadius,
  );
}

/** A closed four-connected circle of columns about `centre`. */
function ringPath(centre: ColumnCoord, radius: number): ColumnCoord[] {
  const steps = Math.ceil(2 * Math.PI * radius);
  const points: ColumnCoord[] = [];
  for (let s = 0; s <= steps; s++) {
    const angle = (s / steps) * 2 * Math.PI;
    points.push({
      x: Math.round(centre.x + Math.cos(angle) * radius),
      z: Math.round(centre.z + Math.sin(angle) * radius),
    });
  }
  const path = polylinePath(points);
  return path.filter(
    (column, i) =>
      i === 0 || column.x !== path[i - 1]!.x || column.z !== path[i - 1]!.z,
  );
}

/** Four 2×2 guard posts, a pair either side of the dais. */
function layGuardPosts(
  raster: PlatformRaster,
  core: CoreTuning,
  cx: number,
  daisZ: number,
  level: number,
): void {
  const size = core.guardPostSize;
  const gap = 2;
  const west = cx - core.daisSize / 2 - gap - size;
  const east = cx + core.daisSize / 2 + gap;
  const rows = [daisZ - 1, daisZ + core.daisSize - size];
  for (const z of rows) {
    for (const [x, side] of [
      [west, "west"],
      [east, "east"],
    ] as const) {
      raster.layPad(
        {
          kind: HookKinds.GUARD_POST,
          x,
          z,
          size,
          level,
          meta: { side },
        },
        SurfaceIds.HULL_PLATE_DARK,
      );
    }
  }
}

// ===========================================
// Ducts, niches and arteries
// ===========================================

/**
 * A bug duct from a side edge, across the rim walkway and through the
 * berm into the arena behind the chamber's centre: `ductWidth` rows at
 * deck level, flesh where it crosses the void. Returns the angle it
 * crosses the rim at, which no wall niche takes.
 *
 * ```
 *   edge ═══════▒▒░░░░░ · arena     ═ flesh over the void
 *               rim  berm           the cut stays at deck level
 * ```
 */
function layDuct(
  raster: PlatformRaster,
  core: CoreTuning,
  centre: ColumnCoord,
  arena: number,
  side: "west" | "east",
  level: number,
  rng: Rng,
): number {
  const z0 =
    Math.round(centre.z) +
    rng.nextInt(core.ductBehind.min, core.ductBehind.max);
  const mid = z0 + Math.floor(core.ductWidth / 2);
  const step = side === "west" ? 1 : -1;
  const start = side === "west" ? 0 : raster.width - 1;
  const path: ColumnCoord[] = [];
  let rim: ColumnCoord | undefined;
  for (let x = start; (x - centre.x) * step < 0; x += step) {
    const d = Math.hypot(x - centre.x, mid - centre.z);
    if (d <= arena - 1) break;
    if (rim === undefined && d <= core.chamberRadius) rim = { x, z: mid };
    path.push({ x, z: mid });
    for (let z = z0; z < z0 + core.ductWidth; z++) {
      const outside =
        Math.hypot(x - centre.x, z - centre.z) > core.chamberRadius + 0.25;
      raster.setDeck(
        x,
        z,
        level,
        outside ? SurfaceIds.INFESTED : RISE_SURFACES[0]!,
      );
      raster.route[raster.indexOf(x, z)] = 1;
    }
  }
  raster.routes.push({
    id: `duct-${side}`,
    kind: "duct",
    minWidth: core.ductWidth,
    path,
  });
  const at = rim ?? { x: start, z: mid };
  return Math.atan2(at.z - centre.z, at.x - centre.x);
}

/**
 * Wall niches: 2×2 flesh alcoves in the rim, evenly spaced round it from
 * a drawn phase, where the wall pods sit. None near the gate or a duct.
 * Each sits as deep in the wall as the walkway's band allows, trying
 * `NICHE_INSETS` from the rim outward.
 */
function carveNiches(
  raster: PlatformRaster,
  core: CoreTuning,
  centre: ColumnCoord,
  radius: number,
  ducts: readonly number[],
  rng: Rng,
): void {
  const gate = -Math.PI / 2;
  const phase = (rng.next() * 2 * Math.PI) / core.niches;
  for (let k = 0; k < core.niches; k++) {
    const angle = phase + (k * 2 * Math.PI) / core.niches;
    if (
      [gate, ...ducts].some(
        (away) => angularGap(angle, away) < core.nicheClearance,
      )
    ) {
      continue;
    }
    const anchor = NICHE_INSETS.map((inset) => ({
      x: Math.floor(centre.x + Math.cos(angle) * (radius - inset) - 0.5),
      z: Math.floor(centre.z + Math.sin(angle) * (radius - inset) - 0.5),
    })).find((at) => nicheFits(raster, at));
    if (anchor === undefined) continue;
    raster.forEachInSquare(anchor.x, anchor.z, 2, (x, z) => {
      const i = raster.indexOf(x, z);
      raster.podBeds[i] = 1;
      raster.keepClear[i] = 1;
      raster.surface[i] = SurfaceIds.INFESTED;
    });
  }
}

/** True when a 2×2 niche anchored at `at` is all deck and off every route. */
function nicheFits(raster: PlatformRaster, at: ColumnCoord): boolean {
  let fits = true;
  raster.forEachInSquare(at.x, at.z, 2, (x, z) => {
    if (!raster.isDeck(x, z) || raster.route[raster.indexOf(x, z)] === 1) {
      fits = false;
    }
  });
  return fits;
}

/**
 * Flesh arteries: one-column spokes of infested floor from the core pad
 * out to the rim walkway, clear of the lane and every pad.
 */
function paintArteries(
  raster: PlatformRaster,
  core: CoreTuning,
  centre: ColumnCoord,
  rng: Rng,
): void {
  const count = rng.nextInt(core.arteries.min, core.arteries.max);
  const lane = -Math.PI / 2;
  const from = core.corePadSize / 2 + 1;
  const to = core.chamberRadius - WALKWAY_INSET - 2;
  for (let n = 0; n < count; n++) {
    const angle =
      lane +
      ARTERY_LANE_CLEARANCE +
      ((n + rng.next()) * (2 * Math.PI - 2 * ARTERY_LANE_CLEARANCE)) / count;
    for (let d = from; d <= to; d += 0.5) {
      const x = Math.round(centre.x + Math.cos(angle) * d);
      const z = Math.round(centre.z + Math.sin(angle) * d);
      if (!raster.isDeck(x, z)) continue;
      const i = raster.indexOf(x, z);
      if (raster.route[i] === 1 || raster.keepClear[i] === 1) continue;
      raster.surface[i] = SurfaceIds.INFESTED;
    }
  }
}

/** Smallest angle between two directions, in radians. */
function angularGap(a: number, b: number): number {
  const turn = 2 * Math.PI;
  const gap = (((a - b) % turn) + turn) % turn;
  return Math.min(gap, turn - gap);
}

// ===========================================
// Rims
// ===========================================

/**
 * Terrace lips: every plate column with a lower deck column beside it is
 * tan, so each terrace and the cuts through the berm read by their rims.
 */
function paintLips(raster: PlatformRaster): void {
  const lips: number[] = [];
  for (let z = 0; z < raster.depth; z++) {
    for (let x = 0; x < raster.width; x++) {
      if (!raster.isDeck(x, z)) continue;
      const i = raster.indexOf(x, z);
      if (raster.surface[i] === SurfaceIds.INFESTED) continue;
      const lower = NEIGHBOURS_4.some(
        ([dx, dz]) =>
          raster.isDeck(x + dx, z + dz) &&
          (raster.level[raster.indexOf(x + dx, z + dz)] ?? 0) <
            (raster.level[i] ?? 0),
      );
      if (lower) lips.push(i);
    }
  }
  for (const i of lips) raster.surface[i] = SurfaceIds.HULL_RIM;
}

/** Paints the chamber's, pad's and causeway's edges over the void tan. */
function paintRim(raster: PlatformRaster): void {
  const rim: number[] = [];
  for (let z = 0; z < raster.depth; z++) {
    for (let x = 0; x < raster.width; x++) {
      if (!raster.isRim(x, z)) continue;
      const i = raster.indexOf(x, z);
      if (raster.surface[i] !== SurfaceIds.INFESTED) rim.push(i);
    }
  }
  for (const i of rim) raster.surface[i] = SurfaceIds.HULL_RIM;
}
