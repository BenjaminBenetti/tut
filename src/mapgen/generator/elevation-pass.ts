import { DIRECTIONS } from "../../core/model/direction";
import type { Rect } from "../../core/model/grid";
import type { Rng } from "../../core/model/rng";
import { stepGridPos } from "../../core/service/grid-math";
import { SurfaceIds } from "../data/surfaces";
import { isPassableGround } from "../service/draft-queries";
import type { ElevatedFeature } from "../model/elevated-feature";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import type { MapDraft } from "../model/map-draft";
import type { SettlementDefinition } from "../model/settlement-definition";
import { areaFactor } from "./lot-pass";

// ===========================================
// Constants
// ===========================================

/** Levels a feature stands above the ground it is stamped on. */
const FEATURE_HEIGHT = 1;

/** Columns of clear ground kept between two features. */
const FEATURE_GAP = 1;

/**
 * Columns kept clear around every lot, on all four sides (#762). A raised
 * park hard against a house whose ground is one level up puts grass at
 * exactly the height of its second floor, and the Executive Director read
 * it as a floor with grass on it. Correct data that reads wrong is still
 * wrong, so no feature stands within this of a lot.
 */
const LOT_MARGIN = 1;

/**
 * Columns of the map border no feature touches. Deploy zones and edge
 * spawns are placed later, in the outer band, and they need flat ground
 * to stand on and walk off: a plaza raised against the border can box a
 * squad into its own deploy zone with nowhere to step. Wider than the
 * deploy placer's own band so the ramps have room too.
 */
const EDGE_KEEPOUT = 5;

/**
 * Columns of open ground a feature needs around its edge. The ramp pass
 * bridges one-level steps between *ground* components, so a platform
 * ringed entirely by lots and buildings gets no ramp and becomes an
 * island: tiles a unit can stand on and never reach. Three columns is
 * enough for a ramp and its landing.
 */
const MIN_APPROACH_COLUMNS = 3;

// ===========================================
// ElevationPass
// ===========================================

/**
 * Raises outdoor structures on a graded plat so a mech has height to hold
 * (#512). City plats are flat by construction (#206) and mechs cannot
 * enter buildings or stand on roofs, so before this pass the only
 * elevation on a city map was indoors and the mech's fire-support role
 * (GDD §6.1) had nowhere to stand.
 *
 * ```
 *   ═══════════  street stays where it is
 *   ░░▓▓▓▓▓░░░░  a plaza one level up, inside the block
 *   ░░▓▓▓▓▓░░██  ██ lot, untouched: buildings keep flat ground
 *   ═══════════
 * ```
 *
 * Each feature is exactly `FEATURE_HEIGHT` above its surroundings, which
 * is what makes it reachable: the ramp pass joins one-level steps and
 * skips cliffs, so both classes walk up and neither needs a stair. Runs
 * after lots and before buildings, and never touches a road, a sidewalk,
 * water or a lot, so nothing downstream has to know it happened.
 */
export class ElevationPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "elevation";
  readonly requires: readonly DraftCapability[] = ["roads", "lots"];
  readonly provides: readonly DraftCapability[] = ["elevation"];

  // ===========================================
  // Public Methods
  // ===========================================

  /** Stamps the settlement's share of features onto the free ground. */
  run(context: GenerationContext): void {
    const { draft, params, registries, rng, diagnostics } = context;
    const { settlement } = params;
    // No raised feature carries a road (#785). The simulation treats a
    // raised tile as solid ground, so a lifted carriageway is a road on a
    // column with a lower road dying into its face where they cross; a
    // real overpass needs a passable underside and is M3's if it is
    // anyone's. Terraces stay: a plaza with a retaining wall is a thing.
    const eligible = registries.elevatedFeatures.values.filter(
      (feature) =>
        feature.scales.includes(settlement.id) &&
        feature.surface !== SurfaceIds.ROAD,
    );
    const target = featureTarget(draft, settlement);
    if (eligible.length === 0 || target === 0) {
      return;
    }

    const free = freeColumns(draft);
    let sums = freeSums(draft, free);
    const raised = new Array<boolean>(draft.width * draft.depth).fill(false);
    let placed = 0;
    let columns = 0;
    const byId = new Map<string, number>();
    const missed = new Map<string, number>();
    for (let i = 0; i < target; i++) {
      const feature = rng.pickWeighted(eligible, (entry) => entry.weight);
      const rect =
        feature.shape === "viaduct"
          ? findViaduct(draft, raised, feature, rng)
          : findSpot(draft, free, sums, feature, rng);
      if (rect === undefined) {
        missed.set(feature.id, (missed.get(feature.id) ?? 0) + 1);
        continue;
      }
      columns += raise(draft, rect, feature, free, raised);
      sums = freeSums(draft, free);
      byId.set(feature.id, (byId.get(feature.id) ?? 0) + 1);
      placed++;
    }
    const parapets = railRaisedEdges(draft, raised);
    const tally = [...byId.entries()]
      .map(([id, count]) => `${id} ${count}`)
      .join(", ");
    const misses = [...missed.entries()]
      .map(([id, count]) => `${id} ${count}`)
      .join(", ");
    diagnostics.note(
      `${placed}/${target} elevated features, ${columns} columns raised, ` +
        `${parapets} parapets` +
        (tally === "" ? "" : ` (${tally})`) +
        (misses === "" ? "" : ` · no room for ${misses}`),
    );
  }
}

// ===========================================
// Target
// ===========================================

/**
 * Features to attempt on this map: the settlement's count for a medium
 * map, scaled by area so a large city is not as bare as a small one.
 */
function featureTarget(
  draft: MapDraft,
  settlement: SettlementDefinition,
): number {
  const range = settlement.elevatedFeatures;
  if (range === undefined) {
    return 0;
  }
  return Math.round(
    ((range.min + range.max) / 2) * areaFactor(draft.width, draft.depth),
  );
}

// ===========================================
// Placement
// ===========================================

/**
 * Ground a feature may stand on, as a column grid: everything that is not
 * a road, a sidewalk, water, a lot, or within `LOT_MARGIN` of a lot.
 *
 * It used to be allowed against a lot's back and sides, on the argument
 * that a terrace abutting a building is what a city looks like. #762
 * withdrew that: a plat one level up against a building whose ground is
 * one level up sits at its second floor, and reads as a floor rather than
 * as ground. The margin covers the frontage too, where a raised face
 * across the door would be a building nothing can walk into. Placed
 * features clear their own columns out of the grid as they go.
 */
function freeColumns(draft: MapDraft): boolean[] {
  const free = new Array<boolean>(draft.width * draft.depth).fill(true);
  const block = (x: number, z: number): void => {
    if (draft.inBounds(x, z)) {
      free[z * draft.width + x] = false;
    }
  };
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      const surface = draft.groundSurfaceAt(x, z);
      if (
        draft.isRoad(x, z) ||
        surface === SurfaceIds.SIDEWALK ||
        surface === SurfaceIds.WATER ||
        isNearBorder(draft, x, z)
      ) {
        block(x, z);
      }
    }
  }
  for (const lot of draft.lots) {
    const { x, z, w, d } = lot.rect;
    for (let zz = z - LOT_MARGIN; zz < z + d + LOT_MARGIN; zz++) {
      for (let xx = x - LOT_MARGIN; xx < x + w + LOT_MARGIN; xx++) {
        block(xx, zz);
      }
    }
  }
  return free;
}

/** True inside the border band the hook placers need left flat. */
function isNearBorder(draft: MapDraft, x: number, z: number): boolean {
  return (
    x < EDGE_KEEPOUT ||
    z < EDGE_KEEPOUT ||
    x >= draft.width - EDGE_KEEPOUT ||
    z >= draft.depth - EDGE_KEEPOUT
  );
}

/**
 * A spot for the feature, drawn uniformly from every position it fits.
 * Enumerating beats sampling here: between a block grid and its lots the
 * free rectangles are a small share of the plat, and a dozen random
 * throws found two of twelve.
 *
 * ```
 *   for each size, largest first ──► every (x, z) where the rect is free
 *                                    and sits on one level ──► rng.pick
 * ```
 *
 * Strips try both orientations, and every feature falls back through
 * smaller sizes down to its minimum before giving up, so a crowded map
 * still gets a smaller plaza rather than nothing.
 */
function findSpot(
  draft: MapDraft,
  free: readonly boolean[],
  sums: Int32Array,
  feature: ElevatedFeature,
  rng: Rng,
): Rect | undefined {
  for (const [w, d] of candidateSizes(feature)) {
    const spots = fittingRects(draft, free, sums, w, d);
    if (spots.length > 0) {
      return rng.pick(spots);
    }
  }
  return undefined;
}

/**
 * Footprints to try, largest first: the feature's full size shrinking to
 * its minimum, each in both orientations for a strip.
 */
function candidateSizes(feature: ElevatedFeature): [number, number][] {
  const sizes: [number, number][] = [];
  for (let long = feature.length.max; long >= feature.length.min; long--) {
    const widest = Math.min(feature.breadth.max, long);
    for (let across = widest; across >= feature.breadth.min; across--) {
      sizes.push([long, across]);
      if (long !== across) {
        sizes.push([across, long]);
      }
    }
  }
  return sizes;
}

/**
 * Every position where a `w × d` rectangle is free and on one level.
 *
 * The free test runs off a summed-area table so it costs the same
 * whatever the rectangle's size; only the positions that pass it pay for
 * the level and approach checks. Without that, a map's worth of feature
 * draws walks the plat tens of millions of times and the property sweep
 * blows its budget.
 */
function fittingRects(
  draft: MapDraft,
  free: readonly boolean[],
  sums: Int32Array,
  w: number,
  d: number,
): Rect[] {
  const spots: Rect[] = [];
  const stride = draft.width + 1;
  for (let z = 1; z + d <= draft.depth - 1; z++) {
    for (let x = 1; x + w <= draft.width - 1; x++) {
      const inside =
        (sums[(z + d) * stride + x + w] ?? 0) -
        (sums[z * stride + x + w] ?? 0) -
        (sums[(z + d) * stride + x] ?? 0) +
        (sums[z * stride + x] ?? 0);
      if (inside !== w * d) {
        continue;
      }
      const rect: Rect = { x, z, w, d };
      if (isFree(draft, free, rect)) {
        spots.push(rect);
      }
    }
  }
  return spots;
}

/** Summed-area table over the free grid, one row and column bigger. */
function freeSums(draft: MapDraft, free: readonly boolean[]): Int32Array {
  const stride = draft.width + 1;
  const sums = new Int32Array(stride * (draft.depth + 1));
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      sums[(z + 1) * stride + x + 1] =
        (free[z * draft.width + x] === true ? 1 : 0) +
        (sums[z * stride + x + 1] ?? 0) +
        (sums[(z + 1) * stride + x] ?? 0) -
        (sums[z * stride + x] ?? 0);
    }
  }
  return sums;
}

/**
 * True when the feature can stand here: every column inside the rectangle
 * is free ground on one level, and every column in the `FEATURE_GAP`
 * margin is either that same level or already one step up.
 *
 * The margin rule is what lets a district grow. Neighbouring a finished
 * feature is allowed because the two end up on the same level and merge
 * into one terrace; neighbouring anything else would leave a two-level
 * face, and the ramp pass treats those as cliffs, so the ground above
 * would be height nothing could climb.
 */
function isFree(
  draft: MapDraft,
  free: readonly boolean[],
  rect: Rect,
): boolean {
  const level = draft.groundLevelAt(rect.x, rect.z);
  let approaches = 0;
  for (let z = rect.z - FEATURE_GAP; z < rect.z + rect.d + FEATURE_GAP; z++) {
    for (let x = rect.x - FEATURE_GAP; x < rect.x + rect.w + FEATURE_GAP; x++) {
      if (!draft.inBounds(x, z)) {
        return false;
      }
      const here = draft.groundLevelAt(x, z);
      const inside =
        x >= rect.x &&
        x < rect.x + rect.w &&
        z >= rect.z &&
        z < rect.z + rect.d;
      if (inside) {
        if (!free[z * draft.width + x] || here !== level) {
          return false;
        }
        continue;
      }
      if (here !== level && here !== level + FEATURE_HEIGHT) {
        return false;
      }
      if (here === level && isPassableGround(draft, x, z)) {
        approaches++;
      }
    }
  }
  return approaches >= MIN_APPROACH_COLUMNS;
}

// ===========================================
// Parapets
// ===========================================

/**
 * Rails the outer edge of everything raised with a half wall, and returns
 * how many segments it set (#508).
 *
 * A parapet is the low-cover primitive that does not eat a tile: infantry
 * crouches at it and shoots over, vaults it to drop off the edge, and a
 * mech has to use a ramp. Cover props stand *on* a tile, so cover and
 * standing room compete; an edge-mounted piece does not, which is why a
 * plaza rim is worth more than another crate on it.
 *
 * ```
 *   ▓▓▓▓▓▓▓   the raised feature
 *   ▔▔▔▔▔▔▔   half walls along every edge that drops a level
 * ```
 *
 * Ramps still work: a connector joins its two tiles directly and does not
 * consult the wall between them, so the ramp pass punches through the
 * rail exactly as a flight of steps does.
 */
function railRaisedEdges(draft: MapDraft, raised: readonly boolean[]): number {
  let segments = 0;
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (raised[z * draft.width + x] !== true) {
        continue;
      }
      const level = draft.groundLevelAt(x, z);
      for (const side of DIRECTIONS) {
        const at = stepGridPos({ x, y: level, z }, side);
        if (!draft.inBounds(at.x, at.z)) {
          continue;
        }
        if (draft.groundLevelAt(at.x, at.z) >= level) {
          continue;
        }
        if (draft.wallAt({ x, y: level, z }, side) !== undefined) {
          continue;
        }
        draft.setWall({ x, y: level, z }, side, "half");
        segments++;
      }
    }
  }
  return segments;
}

// ===========================================
// Viaduct
// ===========================================

/** Widest corridor a viaduct will lift, sidewalk to sidewalk. */
const MAX_CORRIDOR = 6;

/**
 * A run of carriageway to lift, or `undefined` when none is clear. The
 * sidewalks stay down: a building's door opens onto the footway, so
 * lifting that too would leave every frontage on the run facing a wall.
 * What is left is an elevated roadway with the pavement beside it, and
 * the ramp pass puts the on-ramps in — a one-level step, so both classes
 * use them.
 *
 * ```
 *   ---══════════---      before: one level
 *   ---▓▓▓▓▓▓▓▓▓▓---      after:  the carriageway one step up, the
 *   ---══════════---              footways either side still at grade
 * ```
 */
function findViaduct(
  draft: MapDraft,
  raised: readonly boolean[],
  feature: ElevatedFeature,
  rng: Rng,
): Rect | undefined {
  const seeds = rng.shuffle(carriagewayColumns(draft));
  const wanted = rng.nextInt(feature.length.min, feature.length.max);
  for (const seed of seeds.slice(0, VIADUCT_ATTEMPTS)) {
    for (const along of rng.chance(0.5) ? AXES : [...AXES].reverse()) {
      const rect = viaductAt(draft, raised, feature, seed, along, wanted);
      if (rect !== undefined) {
        return rect;
      }
    }
  }
  return undefined;
}

/** Seed columns to try before giving up on a viaduct. */
const VIADUCT_ATTEMPTS = 40;

/** The two run directions, as unit steps. */
const AXES: readonly ("x" | "z")[] = ["x", "z"];

/** Every carriageway column. */
function carriagewayColumns(draft: MapDraft): { x: number; z: number }[] {
  const columns: { x: number; z: number }[] = [];
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (draft.isRoad(x, z)) {
        columns.push({ x, z });
      }
    }
  }
  return columns;
}

/**
 * The run through this seed along the axis, cut to `wanted` columns and
 * centred on the seed, or `undefined` when the corridor is the wrong
 * shape, too short, already raised, on more than one level, or beside a
 * lot.
 */
function viaductAt(
  draft: MapDraft,
  raised: readonly boolean[],
  feature: ElevatedFeature,
  seed: { x: number; z: number },
  along: "x" | "z",
  wanted: number,
): Rect | undefined {
  const across = along === "x" ? "z" : "x";
  const band = corridorBand(draft, seed, across);
  if (band === undefined) {
    return undefined;
  }
  const run = corridorRun(draft, seed, along, band, across);
  // Take what the corridor offers rather than only the length drawn: a
  // grid chopped by earlier runs has more short stretches than long ones,
  // and a short viaduct is still high ground.
  const span = Math.min(wanted, run.length);
  if (span < feature.length.min) {
    return undefined;
  }
  const start = run.start + Math.floor((run.length - span) / 2);
  const rect: Rect =
    along === "x"
      ? { x: start, z: band.start, w: span, d: band.width }
      : { x: band.start, z: start, w: band.width, d: span };
  return isLiftable(draft, raised, rect) ? rect : undefined;
}

/** Contiguous carriageway columns across the corridor through the seed. */
function corridorBand(
  draft: MapDraft,
  seed: { x: number; z: number },
  across: "x" | "z",
): { start: number; width: number } | undefined {
  const limit = across === "x" ? draft.width : draft.depth;
  const at = (value: number): boolean =>
    across === "x" ? draft.isRoad(value, seed.z) : draft.isRoad(seed.x, value);
  let start = across === "x" ? seed.x : seed.z;
  let end = start;
  while (start - 1 >= 0 && at(start - 1)) {
    start--;
  }
  while (end + 1 < limit && at(end + 1)) {
    end++;
  }
  const width = end - start + 1;
  return width >= 2 && width <= MAX_CORRIDOR ? { start, width } : undefined;
}

/** How far the whole corridor band runs along the axis, through the seed. */
function corridorRun(
  draft: MapDraft,
  seed: { x: number; z: number },
  along: "x" | "z",
  band: { start: number; width: number },
  across: "x" | "z",
): { start: number; length: number } {
  const limit = along === "x" ? draft.width : draft.depth;
  const bandIsRoad = (value: number): boolean => {
    for (let i = band.start; i < band.start + band.width; i++) {
      const x = along === "x" ? value : i;
      const z = along === "x" ? i : value;
      if (!draft.inBounds(x, z) || !draft.isRoad(x, z)) {
        return false;
      }
    }
    return true;
  };
  void across;
  let start = along === "x" ? seed.x : seed.z;
  let end = start;
  while (start - 1 >= 0 && bandIsRoad(start - 1)) {
    start--;
  }
  while (end + 1 < limit && bandIsRoad(end + 1)) {
    end++;
  }
  return { start, length: end - start + 1 };
}

/**
 * True when the run can be lifted: every column in it is unraised
 * carriageway on one level, and every neighbour is on that level or
 * already one step up. The second half is what lets an elevated roadway
 * run through a junction and join the one beyond it — two runs that meet
 * end up at the same height — while still refusing anything that would
 * leave a two-level face, which the ramp pass treats as a cliff.
 */
function isLiftable(
  draft: MapDraft,
  raised: readonly boolean[],
  rect: Rect,
): boolean {
  const level = draft.groundLevelAt(rect.x, rect.z);
  for (let z = rect.z - 1; z < rect.z + rect.d + 1; z++) {
    for (let x = rect.x - 1; x < rect.x + rect.w + 1; x++) {
      if (!draft.inBounds(x, z)) {
        return false;
      }
      const here = draft.groundLevelAt(x, z);
      const inside =
        x >= rect.x &&
        x < rect.x + rect.w &&
        z >= rect.z &&
        z < rect.z + rect.d;
      if (inside) {
        if (
          here !== level ||
          raised[z * draft.width + x] === true ||
          !draft.isRoad(x, z) ||
          isNearBorder(draft, x, z)
        ) {
          return false;
        }
      } else if (here !== level && here !== level + FEATURE_HEIGHT) {
        return false;
      }
    }
  }
  return true;
}

// ===========================================
// Stamping
// ===========================================

/**
 * Raises the feature's columns and marks them taken; returns how many
 * columns were raised. A `mound` drops its corners so the shape reads as
 * spoil rather than construction.
 */
function raise(
  draft: MapDraft,
  rect: Rect,
  feature: ElevatedFeature,
  free: boolean[],
  raised: boolean[],
): number {
  const base = draft.groundLevelAt(rect.x, rect.z);
  let columns = 0;
  for (let z = rect.z; z < rect.z + rect.d; z++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (feature.shape === "mound" && isCorner(rect, x, z)) {
        continue;
      }
      draft.setGroundLevel(x, z, base + FEATURE_HEIGHT);
      // A viaduct carries the street it lifts, so road stays road and
      // sidewalk stays sidewalk; every other feature paves its own.
      if (feature.shape !== "viaduct") {
        draft.setGroundSurface(x, z, feature.surface);
      }
      free[z * draft.width + x] = false;
      raised[z * draft.width + x] = true;
      columns++;
    }
  }
  return columns;
}

/** True on one of the rectangle's four corner columns. */
function isCorner(rect: Rect, x: number, z: number): boolean {
  const onEndX = x === rect.x || x === rect.x + rect.w - 1;
  const onEndZ = z === rect.z || z === rect.z + rect.d - 1;
  return onEndX && onEndZ;
}
