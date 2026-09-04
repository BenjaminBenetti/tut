import type { ModelAssetId } from "../../content/data/model-ids";
import type { WeaponProfile } from "./weapon-profile";

// ===========================================
// Bug unit source
// ===========================================

/**
 * What the unit factory reads from a bug species to build a unit. A
 * structural subset of `BugSpecies` (#322, `bugs/model`), declared here
 * so `tactical` never imports `bugs` data and #322 can land in either
 * order; the species record satisfies it as is.
 */
export interface BugUnitSource {
  /** Species id, e.g. `"swarmer"`; becomes the unit's `sourceId`. */
  readonly id: string;
  readonly name: string;
  readonly hp: number;
  readonly armor: number;
  readonly move: number;
  readonly ap: number;
  readonly weapon: WeaponProfile;
  /** Tiles it can see, for fog of war (ADR 0006). Positive. */
  readonly sightRange: number;
  readonly modelId: ModelAssetId;
}
