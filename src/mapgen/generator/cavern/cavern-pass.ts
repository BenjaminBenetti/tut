import type { Rng } from "../../../core/model/rng";
import { IMPASSABLE_GROUND_SURFACES, SurfaceIds } from "../../data/surfaces";
import type { CavernLayout, CavernTunnel } from "../../model/cavern-layout";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../../model/generation-pass";
import type { HiveCavernTuning } from "../../model/hive-cavern-tuning";
import type { MapDraft } from "../../model/map-draft";
import type { ColumnCoord } from "../../model/road";
import type { SurfaceId } from "../../model/surface";
import { ValueNoise } from "../../service/value-noise";
import { carveCavern, type CavernRaster } from "./cavern-carver";
import { planCavern, type CavernPlan, type TunnelPlan } from "./cavern-planner";

// ===========================================
// Constants
// ===========================================

/** Contrast applied to fractal noise before thresholding, as the terrain pass does. */
const CONTRAST = 2.2;

/** Share of infested floor at the front of the cavern, past the mouth. */
const INFESTED_FRONT = 0.15;

/** Extra share of infested floor by the back of the cavern. */
const INFESTED_GAIN = 0.6;

/** Narrowest width each tunnel kind's brush guarantees, in tiles. */
const MIN_WIDTH: Readonly<Record<CavernTunnel["kind"], number>> = {
  main: 3,
  burrow: 3,
  side: 2,
};

// ===========================================
// CavernPass
// ===========================================

/**
 * Cuts a hive cavern into solid rock (#1179): plans chambers and tunnels,
 * carves and levels them, raises the rock around them at least
 * `wallLayers` over every floor it walls in, and paints the floor rock,
 * dirt and infested ground that deepens toward the core. The layout is
 * left on the draft for the dressing, hook and brood-chamber passes.
 *
 * ```
 *   terrain (biome ground) ─► cavern ─► drop ship at the mouth ─► dressing …
 *        ▓▓▓▓▓▓ bedrock: raised, impassable, never a spawn or landing
 *        ░░░░░░ floor: spine level, terraces, ledges, pits
 * ```
 *
 * It replaces the heightmap outright and provides `water` and `elevation`
 * as well: a sealed cavern has no shoreline, and its carve is the map's
 * relief. The cavern is open to the sky: the camera looks down into it
 * (see `docs/design/mapgen-pipeline.md`, "Hive cavern").
 */
export class CavernPass implements GenerationPass {
  // ===========================================
  // Fields
  // ===========================================

  readonly id = "cavern";
  readonly requires: readonly DraftCapability[] = ["heightmap"];
  readonly provides: readonly DraftCapability[] = [
    "water",
    "elevation",
    "cavern",
  ];

  // ===========================================
  // Construction
  // ===========================================

  /** Shapes caverns by `tuning` (`HIVE_CAVERN_TUNING` in the shipped pipeline). */
  constructor(private readonly tuning: HiveCavernTuning) {}

  // ===========================================
  // Public Methods
  // ===========================================

  /** Plans, carves, levels and paints the cavern and records its layout. */
  run(context: GenerationContext): void {
    const { draft, rng, diagnostics } = context;
    const board = { width: draft.width, depth: draft.depth };
    const plan = planCavern(board, this.tuning, rng.fork("plan"));
    const raster = carveCavern(plan, board, this.tuning, rng.fork("carve"));
    paintSurfaces(draft, plan, raster, this.tuning, rng.fork("surfaces"));
    let floor = 0;
    let highest = 0;
    for (let z = 0; z < draft.depth; z++) {
      for (let x = 0; x < draft.width; x++) {
        const i = z * draft.width + x;
        const level = raster.level[i] ?? 0;
        draft.setGroundLevel(x, z, level);
        draft.setNaturalLevel(x, z, level);
        highest = Math.max(highest, level);
        if (raster.open[i] === 1) floor++;
      }
    }
    draft.cavern = layoutOf(plan, raster, this.tuning.spineLevel);
    const sides = plan.chambers.filter((c) => c.role === "side").length;
    const burrows = plan.tunnels.filter((t) => t.kind === "burrow").length;
    diagnostics.note(
      `hive cavern: ${String(plan.chambers.length)} chambers ` +
        `(${String(sides)} side), ${String(plan.tunnels.length)} tunnels ` +
        `(${String(burrows)} burrows), ${String(floor)} floor columns, ` +
        `rock up to layer ${String(highest)}`,
    );
  }
}

// ===========================================
// Surfaces
// ===========================================

/**
 * Rock columns become bedrock. The mouth keeps the biome's ground from
 * the terrain pass (never water); deeper floors are dirt with patches of
 * bare rock, and infested ground spreads with depth until the core is
 * mostly infested.
 */
function paintSurfaces(
  draft: MapDraft,
  plan: CavernPlan,
  raster: CavernRaster,
  tuning: HiveCavernTuning,
  rng: Rng,
): void {
  const infest = new ValueNoise(rng.fork("infested"));
  const rock = new ValueNoise(rng.fork("rock"));
  const f = tuning.surfaceFrequency;
  const mouth = plan.chambers[0];
  const front = (mouth?.centre.z ?? 0) + (mouth?.radius ?? 0);
  const span = Math.max(1, draft.depth - front);
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      const i = z * draft.width + x;
      if (raster.open[i] !== 1) {
        draft.setGroundSurface(x, z, SurfaceIds.BEDROCK);
        continue;
      }
      const chamber = plan.chambers[raster.chamberOf[i] ?? -1];
      if (chamber?.role === "mouth") {
        if (IMPASSABLE_GROUND_SURFACES.has(draft.groundSurfaceAt(x, z))) {
          draft.setGroundSurface(x, z, SurfaceIds.DIRT);
        }
        continue;
      }
      const deep = Math.min(1, Math.max(0, (z - front) / span));
      const share =
        chamber?.role === "core"
          ? tuning.coreInfestedShare
          : INFESTED_FRONT + INFESTED_GAIN * deep;
      draft.setGroundSurface(
        x,
        z,
        floorSurface(
          spread(infest.fbm(x * f, z * f, 2, 0.5)),
          spread(rock.fbm(x * f * 1.7, z * f * 1.7, 2, 0.5)),
          share,
          tuning.rockShare,
        ),
      );
    }
  }
}

/** Infested below the depth's share, else rock in the top `rockShare`, else dirt. */
function floorSurface(
  infested: number,
  rocky: number,
  share: number,
  rockShare: number,
): SurfaceId {
  if (infested < share) return SurfaceIds.INFESTED;
  if (rocky > 1 - rockShare) return SurfaceIds.ROCK;
  return SurfaceIds.DIRT;
}

/** Stretches clustered fractal noise about its middle and clamps it to [0, 1]. */
function spread(value: number): number {
  return Math.min(1, Math.max(0, (value - 0.5) * CONTRAST + 0.5));
}

// ===========================================
// Layout
// ===========================================

/** The plan and carve as the draft keeps them for later passes. */
function layoutOf(
  plan: CavernPlan,
  raster: CavernRaster,
  spineLevel: number,
): CavernLayout {
  return {
    chambers: plan.chambers.map((chamber, index) => ({
      id: `chamber-${String(index)}`,
      index,
      role: chamber.role,
      centre: chamber.centre,
      radius: chamber.radius,
      depth: chamber.depth,
    })),
    tunnels: plan.tunnels.map((tunnel, index) => ({
      id: `tunnel-${String(index)}`,
      kind: tunnel.kind,
      from: tunnel.from,
      ...(tunnel.to === undefined ? {} : { to: tunnel.to }),
      minWidth: MIN_WIDTH[tunnel.kind],
      path: centreLine(tunnel),
    })),
    chamberOf: raster.chamberOf,
    open: raster.open,
    spine: raster.spine,
    spineLevel,
    corePad: raster.corePad,
  };
}

/** A tunnel's samples snapped to columns, consecutive repeats dropped. */
function centreLine(tunnel: TunnelPlan): ColumnCoord[] {
  const path: ColumnCoord[] = [];
  for (const sample of tunnel.samples) {
    const column = { x: Math.round(sample.x), z: Math.round(sample.z) };
    const last = path[path.length - 1];
    if (last?.x === column.x && last.z === column.z) continue;
    path.push(column);
  }
  return path;
}
