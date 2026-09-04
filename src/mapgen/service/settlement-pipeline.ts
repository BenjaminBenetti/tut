import { BuildingPass } from "../generator/building-pass";
import { ConnectivityPass } from "../generator/connectivity-pass";
import { CraterPass } from "../generator/crater-pass";
import { DebrisPass } from "../generator/debris-pass";
import { ElevationPass } from "../generator/elevation-pass";
import { HookPass } from "../generator/hook-pass";
import { InteriorPass } from "../generator/interior-pass";
import { LotPass } from "../generator/lot-pass";
import { PropPass } from "../generator/prop-pass";
import { RampPass } from "../generator/ramp-pass";
import { RoadPass } from "../generator/road-pass";
import { TerrainPass } from "../generator/terrain-pass";
import { WaterPass } from "../generator/water-pass";
import type { GenerationPass } from "../model/generation-pass";
import type { MapArchetype } from "../model/map-recipe";
import type { MapGenRegistries } from "../model/registries";
import type { PipelineOptions } from "./pipeline-map-generator";
import { PipelineMapGenerator } from "./pipeline-map-generator";

// ===========================================
// Pass lists
// ===========================================

/**
 * The ordered passes of the settlement archetype (ADR 0004 §7.3).
 * Fresh instances per call; passes are stateless but a list is cheap and
 * keeps pipelines independent.
 */
export function createSettlementPasses(): GenerationPass[] {
  return [
    new TerrainPass(),
    new WaterPass(),
    new RoadPass(),
    new LotPass(),
    new ElevationPass(),
    new BuildingPass(),
    new InteriorPass(),
    new PropPass(),
    new RampPass(),
    new HookPass(),
    new ConnectivityPass(),
  ];
}

/**
 * The ordered passes of the crash-site archetype (#447, GDD §8).
 *
 * **Prototype.** It reuses the tail of the settlement list — ramps,
 * hooks, connectivity — and replaces the town-building middle with two
 * passes of its own: a terraced impact bowl and a debris field.
 *
 * It *could* now take the biome's vegetation from the settlement's own
 * prop pass — #714 made that pass's requirements follow its placements,
 * so asking for scattering alone asks only for a heightmap, where before
 * it demanded `interiors` a site with no buildings can never provide.
 * It deliberately does not. Debris already fills this ground: adding
 * vegetation on top doubles the prototype's prop load, from 137 props and
 * 18 % of open tiles beside cover to 271 and 31 %. Wreckage and
 * vegetation are alternatives competing for the same tiles, not layers,
 * so which one a crash site is made of is a design call for when the
 * archetype becomes content rather than a side effect of a refactor.
 *
 * ```
 *   terrain ─► water ─► crater ─► debris ─► ramps ─► hooks ─► connectivity
 * ```
 */
export function createCrashSitePasses(): GenerationPass[] {
  return [
    new TerrainPass(),
    new WaterPass(),
    new CraterPass(),
    new DebrisPass(),
    new RampPass(),
    new HookPass(),
    new ConnectivityPass(),
  ];
}

/**
 * Pass list per archetype. Hives and the space platform (M3/M4) add
 * entries here and reuse the tail of the settlement list.
 */
const PASSES_BY_ARCHETYPE: Readonly<
  Record<MapArchetype, () => GenerationPass[]>
> = {
  settlement: createSettlementPasses,
  "crash-site": createCrashSitePasses,
};

// ===========================================
// Factory
// ===========================================

/**
 * Builds a validated pipeline for the archetype over the given
 * registries.
 */
export function createPipeline(
  archetype: MapArchetype,
  registries: MapGenRegistries,
  options: PipelineOptions = {},
): PipelineMapGenerator {
  return new PipelineMapGenerator(
    PASSES_BY_ARCHETYPE[archetype](),
    registries,
    options,
  );
}
