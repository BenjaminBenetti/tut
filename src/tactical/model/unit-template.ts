import type { ModelAssetId } from "../../content/data/model-ids";
import type { PassClass } from "./unit";
import type { WeaponProfile } from "./weapon-profile";

// ===========================================
// Ids
// ===========================================

/**
 * Id of a unit template, unique within one mission. Derived, not drawn:
 * `"<kind>:<sourceId>"`, e.g. `"squad:squad-1"` or `"bug:swarmer"`, so
 * every unit built from the same source shares one template.
 */
export type UnitTemplateId = string;

// ===========================================
// Unit template
// ===========================================

/**
 * The tactical stats a kind of unit fights with, derived once at mission
 * start from its roster entry or species data and frozen for the mission
 * (GDD §6). Units reference a template by id; the roster models stay
 * untouched.
 *
 * ```
 *   Squad + SquadType ─┐
 *   Mech + StatSheet  ─┼─► unit-factory ─► UnitTemplate ◄─ Unit.templateId
 *   BugSpecies        ─┘                   (per mission)
 * ```
 */
export interface UnitTemplate {
  readonly id: UnitTemplateId;
  /** Display name, e.g. the squad type or species name. */
  readonly name: string;
  /** Hit points at full health. Positive integer. */
  readonly maxHp: number;
  /** Action points per turn. Positive integer (GDD §6.2: two by default). */
  readonly maxAp: number;
  /** Tiles one move action covers. Positive integer. */
  readonly move: number;
  readonly weapon: WeaponProfile;
  /** Damage absorbed per hit before hit points. Non-negative integer. */
  readonly armor: number;
  /** Which tiles the unit may stand on (GDD §6.1: mechs stay outside). */
  readonly passClass: PassClass;
  /** Model graphics draws for every unit of this template. */
  readonly modelId: ModelAssetId;
}
