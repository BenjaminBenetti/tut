import type { DeployableTypeId } from "./deployable-type";
import type { RegionId } from "./region";

// ===========================================
// Ids
// ===========================================

/**
 * Id of a built installation. Plain string (ADR 0003); runtime instances
 * get `"deployable-<n>"` from the sequential id generator.
 */
export type DeployableId = string;

// ===========================================
// Deployable
// ===========================================

/**
 * One installation the player has built in a region (GDD §5.6). Its
 * behaviour comes entirely from the `DeployableType` it references; this
 * record only says where it is, when it was built and whether it is
 * currently acting. Lives in `OverworldState.deployables`.
 */
export interface Deployable {
  /** Unique within the campaign. */
  readonly id: DeployableId;
  /** Catalogue entry that defines cost, cap and effect. */
  readonly typeId: DeployableTypeId;
  /** Region the installation sits in and acts on. */
  readonly regionId: RegionId;
  /** The overworld day the installation was completed. */
  readonly builtDay: number;
  /**
   * Whether the installation applies its effect. Built installations
   * start online; the upkeep tick takes one offline when its upkeep
   * cannot be paid and brings it back the first day it can be.
   */
  readonly online: boolean;
}
