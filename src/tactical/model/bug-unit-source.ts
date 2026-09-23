import type { ModelAssetId } from "../../content/data/model-ids";
import type { WeaponProfile } from "./weapon-profile";
import type { UnitWeapon } from "./unit-weapon";
import type { EquipmentId } from "./equipment";

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
  /** Explicit named loadout; when absent, `weapon` supplies the legacy primary attack. */
  readonly weapons?: readonly UnitWeapon[];
  /** Usable equipment IDs carried by this species, resolved through the normal catalogue. */
  readonly equipment?: readonly EquipmentId[];
  /** Tiles it can see, for fog of war (ADR 0006). Positive. */
  readonly sightRange: number;
  readonly modelId: ModelAssetId;
  /**
   * Experience a kill of this species earns its killer (#1130); absent
   * means the kill is worth nothing. Copied onto the template.
   */
  readonly xpValue?: number;
  /** Tiles per side it occupies (#1130); absent means one. Copied onto the template. */
  readonly footprint?: number;
}
