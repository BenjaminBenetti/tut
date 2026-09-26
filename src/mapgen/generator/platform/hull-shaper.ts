import type { Rng } from "../../../core/model/rng";
import { SurfaceIds } from "../../data/surfaces";
import { HookKinds } from "../../model/hook";
import type { MapDimensions } from "../../model/map-recipe";
import type { ColumnCoord } from "../../model/road";
import type { SporePlatformTuning } from "../../model/spore-platform-tuning";
import { ValueNoise } from "../../service/value-noise";
import {
  growPlates,
  linePath,
  PlatformRaster,
  plateSurface,
  polylinePath,
  type Plate,
} from "./platform-raster";

// ===========================================
// Constants
// ===========================================

/** Void rows kept in front of the prow, so the dock plate shows its tip. */
const PROW_GAP = 2;

/** Attempts per pod bed or breach before it is given up. */
const ATTEMPTS = 40;

/** Columns a pod bed or breach keeps from the deck's rim. */
const RIM_KEEP = 3;

/** Columns a breach keeps from any route, pad or pod bed. */
const BREACH_KEEP = 4;

// ===========================================
// Hull shaper
// ===========================================

/**
 * Shapes the spore platform's outer hull (#1179), the finale's first
 * stage: a deck of terraced chitin plates hanging over void, narrowing
 * to a flat dock plate at the prow (low `z`), where the drop ship docks,
 * and running on past the far edge, where the bugs come from.
 *
 * ```
 *   ······▓▓▓······   prow: the flat dock plate
 *   ····▓▓▓║▓▓▓····   the deck flares out over flareLength rows
 *   ·▓▓▓▓▓▓║▓▓▓▓▓▓·   ║ spine: level, five wide, dock to far edge
 *   ·▓▓▓▓▓▓╠═══(R)·   R docking ring on its plaza, off one flank
 *   ·▓▓P▓▓▓║▓▓○▓▓▓·   P pod beds, ○ breaches into space
 *   ·▓▓▓▓▓[X]▓▓▓▓▓·   X hatch down to the core, on the spine
 *   ·▓▓▓▓▓▓║▓▓▓▓▓▓·   (the deck runs on past the far edge)
 * ```
 *
 * Plates are raised at most one layer, so every step on the deck is a
 * free walk (ADR 0008 §2.3); routes, pads and the dock are level at
 * `deckLevel`. Rim columns are tan, pads and pod beds flesh, the rest
 * walnut or chestnut plate.
 */
export function shapeHull(
  board: MapDimensions,
  tuning: SporePlatformTuning,
  rng: Rng,
): PlatformRaster {
  const raster = new PlatformRaster(board);
  const hull = tuning.hull;
  const level = tuning.deckLevel;
  const plates = growPlates(raster, tuning, rng.fork("plates"));
  outlineDeck(raster, tuning, plates, rng.fork("outline"));
  const cx = Math.floor(raster.width / 2);
  const dockCentre = { x: cx, z: PROW_GAP + Math.floor(hull.prowLength / 2) };

  // The spine: dock to the far edge, bowing gently about the centre.
  const spine = spinePath(raster, tuning, rng.fork("spine"));
  raster.layRoute(
    {
      id: "spine",
      kind: "spine",
      minWidth: 2 * hull.routeRadius + 1,
      path: spine,
    },
    hull.routeRadius,
    level,
  );

  // The docking ring on a level plaza off one flank, with its branch.
  const ring = ringCentre(raster, tuning, spine, rng.fork("ring"));
  raster.forEachWithin(ring.centre, hull.ringPlazaRadius + 0.5, (x, z) => {
    if (raster.isDeck(x, z)) {
      raster.setDeck(x, z, level, SurfaceIds.HULL_PLATE_DARK);
    }
  });
  raster.layRoute(
    {
      id: "branch",
      kind: "branch",
      minWidth: 2 * hull.routeRadius + 1,
      path: linePath(ring.from, ring.centre),
    },
    hull.routeRadius,
    level,
  );
  const half = Math.floor(hull.ringPadSize / 2);
  raster.layPad(
    {
      kind: HookKinds.DOCKING_RING,
      x: ring.centre.x - half,
      z: ring.centre.z - half,
      size: hull.ringPadSize,
      level,
      meta: { side: ring.side },
    },
    SurfaceIds.INFESTED,
  );

  // The hatch to stage 2, on the spine near the far edge.
  const exitZ = raster.depth - 1 - hull.exitBack - hull.exitPadSize;
  const exitX = spineXAt(spine, exitZ) ?? cx;
  const exitHalf = Math.floor(hull.exitPadSize / 2);
  raster.layPad(
    {
      kind: HookKinds.PLATFORM_EXIT,
      x: exitX - exitHalf,
      z: exitZ,
      size: hull.exitPadSize,
      level,
    },
    SurfaceIds.INFESTED,
  );

  placePodBeds(raster, tuning, dockCentre, rng.fork("pod-beds"));
  punchBreaches(raster, tuning, dockCentre, rng.fork("breaches"));
  paintRim(raster);
  return raster;
}

// ===========================================
// Outline
// ===========================================

/**
 * Lays the deck: the flat dock plate at the prow, the flare, then the
 * full width to the far edge, its sides wandering by up to `rimNoise`.
 * Deck columns take their plate's level and chitin; the dock plate is
 * level and walnut.
 */
function outlineDeck(
  raster: PlatformRaster,
  tuning: SporePlatformTuning,
  plates: readonly Plate[],
  rng: Rng,
): void {
  const hull = tuning.hull;
  const noise = new ValueNoise(rng);
  const cx = Math.floor(raster.width / 2);
  const flareStart = PROW_GAP + hull.prowLength;
  for (let z = PROW_GAP; z < raster.depth; z++) {
    let halfWidth: number = hull.prowHalfWidth;
    let west = 0;
    let east = 0;
    if (z >= flareStart) {
      const t = Math.min(1, (z - flareStart) / hull.flareLength);
      const eased = t * t * (3 - 2 * t);
      halfWidth =
        hull.prowHalfWidth + (hull.maxHalfWidth - hull.prowHalfWidth) * eased;
      const wander = Math.min(1, (z - flareStart) / 4);
      // Fractal noise clusters near 0.5, so it is stretched fourfold
      // to wander the full `rimNoise` either way.
      west = Math.round(
        (noise.fbm(z * tuning.rimFrequency, 0.37, 2, 0.5) - 0.5) *
          4 *
          tuning.rimNoise *
          wander,
      );
      east = Math.round(
        (noise.fbm(z * tuning.rimFrequency, 7.61, 2, 0.5) - 0.5) *
          4 *
          tuning.rimNoise *
          wander,
      );
    }
    const from = Math.max(hull.sideMargin, Math.round(cx - halfWidth) - west);
    const to = Math.min(
      raster.width - 1 - hull.sideMargin,
      Math.round(cx + halfWidth) + east,
    );
    for (let x = from; x <= to; x++) {
      if (z < flareStart) {
        raster.setDeck(x, z, tuning.deckLevel, SurfaceIds.HULL_PLATE_DARK);
        raster.keepClear[raster.indexOf(x, z)] = 1;
        continue;
      }
      const plate = plates[raster.plate[raster.indexOf(x, z)] ?? -1];
      raster.setDeck(
        x,
        z,
        tuning.deckLevel + (plate?.raised === true ? 1 : 0),
        plateSurface(plate),
      );
    }
  }
}

/** Paints every rim column tan: the plates' toasted rims. */
function paintRim(raster: PlatformRaster): void {
  const rim: number[] = [];
  for (let z = 0; z < raster.depth; z++) {
    for (let x = 0; x < raster.width; x++) {
      if (raster.isRim(x, z)) rim.push(raster.indexOf(x, z));
    }
  }
  for (const i of rim) {
    if (raster.surface[i] !== SurfaceIds.INFESTED) {
      raster.surface[i] = SurfaceIds.HULL_RIM;
    }
  }
}

// ===========================================
// Spine and ring
// ===========================================

/**
 * The spine's centre line: from the dock plate's middle to the far edge
 * through waypoints drawn every `spineWaypointEvery` rows, each within
 * `spineBow` of the centre column.
 */
function spinePath(
  raster: PlatformRaster,
  tuning: SporePlatformTuning,
  rng: Rng,
): ColumnCoord[] {
  const hull = tuning.hull;
  const cx = Math.floor(raster.width / 2);
  const start = { x: cx, z: PROW_GAP + 1 };
  const flareEnd = PROW_GAP + hull.prowLength + hull.flareLength;
  const points: ColumnCoord[] = [start, { x: cx, z: flareEnd - 8 }];
  for (
    let z = flareEnd - 8 + hull.spineWaypointEvery;
    z < raster.depth - 1;
    z += hull.spineWaypointEvery
  ) {
    points.push({ x: cx + rng.nextInt(-hull.spineBow, hull.spineBow), z });
  }
  const last = points[points.length - 1]!;
  points.push({ x: last.x, z: raster.depth - 1 });
  return polylinePath(points);
}

/** The spine's centre column on a row, if the spine crosses it. */
function spineXAt(
  spine: readonly ColumnCoord[],
  z: number,
): number | undefined {
  return spine.find((column) => column.z === z)?.x;
}

/** Where the docking ring stands and where its branch leaves the spine. */
function ringCentre(
  raster: PlatformRaster,
  tuning: SporePlatformTuning,
  spine: readonly ColumnCoord[],
  rng: Rng,
): { centre: ColumnCoord; from: ColumnCoord; side: string } {
  const hull = tuning.hull;
  const share =
    hull.ringDepthShare.min +
    rng.next() * (hull.ringDepthShare.max - hull.ringDepthShare.min);
  const z = Math.round(raster.depth * share);
  const east = rng.chance(0.5);
  const x0 = spineXAt(spine, z) ?? Math.floor(raster.width / 2);
  // The plaza keeps two deck columns between it and the rim, pulling in
  // toward the spine where the outline wanders close.
  let offset = hull.ringOffset;
  const clear = hull.ringPlazaRadius + 2;
  while (offset > hull.routeRadius + hull.ringPlazaRadius + 2) {
    const x = x0 + (east ? offset : -offset);
    let fits = true;
    raster.forEachWithin({ x, z }, clear, (px, pz) => {
      if (!raster.isDeck(px, pz)) fits = false;
    });
    if (
      fits &&
      raster.inBounds(x - clear, z) &&
      raster.inBounds(x + clear, z)
    ) {
      break;
    }
    offset--;
  }
  return {
    centre: { x: x0 + (east ? offset : -offset), z },
    from: { x: x0, z },
    side: east ? "east" : "west",
  };
}

// ===========================================
// Pod beds and breaches
// ===========================================

/**
 * Pod beds: flesh discs off the routes where the spawner pods cluster.
 * The first lies a short walk from the dock, so the fight starts soon;
 * the rest spread over the deck at least `podBedSpacing` apart.
 */
function placePodBeds(
  raster: PlatformRaster,
  tuning: SporePlatformTuning,
  dock: ColumnCoord,
  rng: Rng,
): void {
  const hull = tuning.hull;
  const count = rng.nextInt(hull.podBeds.min, hull.podBeds.max);
  const centres: ColumnCoord[] = [];
  for (let n = 0; n < count; n++) {
    for (let attempt = 0; attempt < ATTEMPTS * 4; attempt++) {
      const at = {
        x: rng.nextInt(0, raster.width - 1),
        z: rng.nextInt(0, raster.depth - 1),
      };
      const distance = Math.abs(at.x - dock.x) + Math.abs(at.z - dock.z);
      if (
        n === 0 &&
        attempt < ATTEMPTS * 3 &&
        (distance < hull.firstPodBedDistance.min ||
          distance > hull.firstPodBedDistance.max)
      ) {
        continue;
      }
      if (distance < hull.firstPodBedDistance.min) continue;
      if (
        centres.some(
          (c) =>
            Math.abs(c.x - at.x) + Math.abs(c.z - at.z) < hull.podBedSpacing,
        )
      ) {
        continue;
      }
      if (!fitsOffRoute(raster, at, hull.podBedRadius, RIM_KEEP, 1)) continue;
      centres.push(at);
      raster.forEachWithin(at, hull.podBedRadius + 0.5, (x, z) => {
        const i = raster.indexOf(x, z);
        raster.podBeds[i] = 1;
        raster.surface[i] = SurfaceIds.INFESTED;
      });
      break;
    }
  }
}

/**
 * Breaches: a few round holes torn through the deck into space, well off
 * every route, pad and pod bed. One that would cut deck off from the
 * dock is filled back in.
 */
function punchBreaches(
  raster: PlatformRaster,
  tuning: SporePlatformTuning,
  dock: ColumnCoord,
  rng: Rng,
): void {
  const hull = tuning.hull;
  const count = rng.nextInt(hull.breaches.min, hull.breaches.max);
  for (let n = 0; n < count; n++) {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const radius = rng.nextInt(hull.breachRadius.min, hull.breachRadius.max);
      const at = {
        x: rng.nextInt(0, raster.width - 1),
        z: rng.nextInt(0, raster.depth - 1),
      };
      if (!fitsOffRoute(raster, at, radius, RIM_KEEP + 3, BREACH_KEEP)) {
        continue;
      }
      const saved: { i: number; level: number; surface: string }[] = [];
      raster.forEachWithin(at, radius + 0.5, (x, z) => {
        const i = raster.indexOf(x, z);
        saved.push({
          i,
          level: raster.level[i] ?? 0,
          surface: raster.surface[i] ?? SurfaceIds.VOID,
        });
        raster.setVoid(x, z);
      });
      if (deckConnected(raster, dock)) break;
      for (const cell of saved) {
        raster.deck[cell.i] = 1;
        raster.level[cell.i] = cell.level;
        raster.surface[cell.i] = cell.surface;
      }
    }
  }
}

/**
 * True when a disc of `radius` about the column is deck at least
 * `rimKeep` from void and at least `keep` from any route, pad apron or
 * pod bed.
 */
function fitsOffRoute(
  raster: PlatformRaster,
  at: ColumnCoord,
  radius: number,
  rimKeep: number,
  keep: number,
): boolean {
  let fits = true;
  raster.forEachWithin(at, radius + rimKeep + 0.5, (x, z) => {
    if (!raster.isDeck(x, z)) fits = false;
  });
  if (!fits) return false;
  const reach = radius + rimKeep;
  if (
    !raster.inBounds(at.x - reach, at.z - reach) ||
    !raster.inBounds(at.x + reach, at.z + reach)
  ) {
    return false;
  }
  raster.forEachWithin(at, radius + keep + 0.5, (x, z) => {
    const i = raster.indexOf(x, z);
    if (
      raster.route[i] === 1 ||
      raster.keepClear[i] === 1 ||
      raster.podBeds[i] === 1
    ) {
      fits = false;
    }
  });
  return fits;
}

/** True when every deck column still joins the dock by free steps. */
function deckConnected(raster: PlatformRaster, dock: ColumnCoord): boolean {
  const reached = raster.floodDeck(dock);
  for (let i = 0; i < raster.deck.length; i++) {
    if (raster.deck[i] === 1 && reached[i] !== 1) return false;
  }
  return true;
}
