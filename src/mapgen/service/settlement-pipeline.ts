import { BuildingPass } from "../generator/building-pass";
import { ConnectivityPass } from "../generator/connectivity-pass";
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
 * Pass list per archetype. Hives, crash sites and the space platform
 * (M3/M4) add entries here and reuse the tail of the settlement list.
 */
const PASSES_BY_ARCHETYPE: Readonly<
  Record<MapArchetype, () => GenerationPass[]>
> = {
  settlement: createSettlementPasses,
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
