import type { Registry } from "../../core/model/registry";
import type { PropDefinition } from "../../mapgen/model/prop";
import type { SurfaceDefinition } from "../../mapgen/model/surface";
import type { StructureCatalogue } from "../model/structure-catalogue";

// ===========================================
// Registry adapter
// ===========================================

/** The two registries demolition reads. */
export interface StructureRegistries {
  readonly props: Registry<PropDefinition>;
  readonly surfaces: Registry<SurfaceDefinition>;
}

/**
 * A `StructureCatalogue` over the mapgen registries (#1121): the one
 * adapter between the rules' port and the shipped data. The composition
 * root builds it once over `createDefaultRegistries()`.
 *
 * A prop kind the registry lacks — a fixture map's stand-in — cannot be
 * demolished rather than throwing, since demolition is a side effect of
 * a shot and must not fail the shot.
 */
export function registryStructureCatalogue(
  registries: StructureRegistries,
): StructureCatalogue {
  return {
    propForce: (kind) => registries.props.find(kind)?.demolition,
    surfacePass: (surface) => registries.surfaces.get(surface).defaultPass,
  };
}
