import type { ModelAssetId } from "../../content/data/model-ids";
import type { BugSpeciesId } from "../../content/model/bug-species-id";

// ===========================================
// Armoured variants
// ===========================================

/**
 * The species an Act III armoured variant is derived from (campaign arc
 * §8, #1179): the three melee bugs. A subset of the shared `BugSpeciesId`
 * union, kept here because only the bestiary's own data derives from it.
 */
export type ArmouredBaseId = Extract<
  BugSpeciesId,
  "swarmer" | "lurker" | "brute"
>;

/**
 * The armoured variants themselves, one per base (arc §8). Each id is its
 * base's followed by `-armoured`, which reads as its model id without the
 * `bug.` prefix (`bug.swarmer-armoured`).
 */
export type ArmouredVariantId = Extract<
  BugSpeciesId,
  "swarmer-armoured" | "lurker-armoured" | "brute-armoured"
>;

/**
 * What an armoured variant adds to its base species' stat block. Only
 * the plate and the body under it change; everything else (move, action
 * points, weapon, sight, behaviour, footprint, kill value) is the base's,
 * so a retune of the base carries straight through to its variant.
 *
 * ```
 *   variant.armor = base.armor + delta.armor
 *   variant.hp    = base.hp    + delta.hp
 * ```
 */
export interface ArmourDelta {
  /** Armour points added to the base's. Whole and positive. */
  readonly armor: number;
  /** Hit points added to the base's. Whole and positive: a little more body under the plate. */
  readonly hp: number;
}

/**
 * The one tuning object for every armoured variant: each base species'
 * delta, keyed by the base. See `ARMOURED_VARIANT_TUNING`.
 */
export type ArmouredVariantTuning = Readonly<
  Record<ArmouredBaseId, ArmourDelta>
>;

/**
 * Who a variant is, apart from its stats: the fields an armoured variant
 * does not inherit from its base.
 */
export interface ArmouredVariantIdentity {
  /** The variant's species id, `<base>-armoured`. */
  readonly id: ArmouredVariantId;
  /** Display name on the unit card and in the log, e.g. `"Armoured Swarmer"`. */
  readonly name: string;
  /** One or two sentences for the bestiary and contact reports. */
  readonly description: string;
  /** Its own model: the base's anatomy under slab armour, `bug.<id>`. */
  readonly modelId: ModelAssetId;
}
