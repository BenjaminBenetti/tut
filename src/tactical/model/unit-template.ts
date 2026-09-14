import type { ModelAssetId } from "../../content/data/model-ids";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { EquipmentId } from "./equipment";
import type { PassClass } from "./unit";
import type { UnitWeapon } from "./unit-weapon";

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
// Rank
// ===========================================

/**
 * The rank a TDF unit fought at, frozen with the rest of its template
 * (#1130): the HUD names it and the bonuses it bought are already in the
 * template's numbers. The index is what those bonuses scaled with.
 */
export interface TemplateRank {
  readonly name: string;
  /** Position on the roster's ladder, `0` for the lowest rung. */
  readonly index: number;
}

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
  /**
   * Every attack this unit can make (#532), ordered; the first is what a
   * bare "attack" means. A squad or a bug carries one; a mech carries
   * its arm weapon and its back weapon, each with its own range.
   */
  readonly weapons: readonly UnitWeapon[];
  /**
   * Tiles the unit can see, for fog of war (ADR 0006 §2.1). Deliberately
   * longer than the weapon's range: a unit that saw no further than it
   * shot would teach the player that walking into range is the only way
   * to find anything. Positive integer.
   */
  readonly sightRange: number;
  /** Damage absorbed per hit before hit points. Non-negative integer. */
  readonly armor: number;
  /** Which tiles the unit may stand on (GDD §6.1: mechs stay outside). */
  readonly passClass: PassClass;
  /**
   * Tiles per side the unit covers on the ground plane (#1130). Absent
   * means one tile, as every unit was before it; the brute is `2`, a
   * 2×2 block. `Unit.pos` is the footprint's **anchor**: the tile with
   * the lowest `x` and lowest `z`, every tile of the footprint sharing
   * its `y`. `footprint-service` enumerates the rest.
   *
   * ```
   *   footprint 2, anchor at (x, z)
   *
   *      (x, z)   (x+1, z)
   *      (x, z+1) (x+1, z+1)     drawn centred on (x+1, z+1)
   * ```
   */
  readonly footprint?: number;
  /**
   * Model graphics draws for every unit of this template. For a mech it
   * is the reference assembly, drawn only when `loadout` is absent.
   */
  readonly modelId: ModelAssetId;
  /**
   * The limited-use items the unit carries (#1132), by catalogue id:
   * grenades, a radar dish, a breaching charge. Absent for bugs, mechs
   * and older saved templates, which carry nothing.
   */
  readonly equipment?: readonly EquipmentId[];
  /**
   * The loadout a mech was built from, so graphics can assemble the
   * parts the player actually fitted (#1115); the mech bay preview and
   * the battlefield then agree. Absent for squads and bugs, and on
   * missions saved before it existed, which keep drawing `modelId`.
   */
  readonly loadout?: MechLoadout;
  /**
   * The rank the roster entry held at mission start (#1130), for the
   * HUD; its move, accuracy and action-point bonuses are already folded
   * into the fields above. Absent for bugs and on older saved missions.
   */
  readonly rank?: TemplateRank;
  /**
   * Experience killing one of these earns the killer (#1130), copied
   * from the species so the resolver reads it off the log's casualty
   * without a catalogue. Absent for TDF units and on older saved
   * missions, which then credit nothing.
   */
  readonly xpValue?: number;
  /**
   * What the unit is made of (#1138), which decides which kit can mend
   * it: a medkit heals only `"organic"` units, a repair kit only
   * `"mechanical"` ones. Absent on most templates, where it follows the
   * unit's kind — see `constructionOf` in `service/construction-service`
   * — so only a template that breaks the rule (a mechanical unit that is
   * not a mech, such as a deployed turret) has to say so.
   */
  readonly construction?: Construction;
}

/**
 * What a unit is made of (#1138): flesh that a medic can patch, or metal
 * that an engineer can weld. Bugs and squads are organic, mechs are
 * mechanical, and a template may say otherwise for itself.
 */
export type Construction = "organic" | "mechanical";

/** Every `Construction`, in a fixed order. */
export const CONSTRUCTIONS = [
  "organic",
  "mechanical",
] as const satisfies readonly Construction[];
