// ===========================================
// Deployable type ids
// ===========================================

/**
 * Key of a deployable type in `overworld/data/deployable-types.ts`. A
 * closed union rather than a plain string so the data record is checked
 * for completeness by the compiler: adding a member here without a
 * matching entry in `DEPLOYABLE_TYPES` fails to build.
 */
export type DeployableTypeId =
  "defensive-battery" | "repellent-dispersal" | "sensor-array";

/**
 * Runtime list of every `DeployableTypeId`, in a fixed order, for
 * validation and for tests that must cover each type. The `satisfies`
 * check rejects a stray member; the data test checks the list is complete.
 */
export const DEPLOYABLE_TYPE_IDS = [
  "defensive-battery",
  "repellent-dispersal",
  "sensor-array",
] as const satisfies readonly DeployableTypeId[];

/**
 * Narrows an arbitrary string (from a save file or a build command, for
 * instance) to a `DeployableTypeId`.
 */
export function isDeployableTypeId(value: string): value is DeployableTypeId {
  return (DEPLOYABLE_TYPE_IDS as readonly string[]).includes(value);
}

// ===========================================
// Effects
// ===========================================
//
// A deployable's effect is a bag of optional numbers, not a code path.
// The tick services that consume them (#66 for suppression and spread,
// mission generation for intel) read the field they care about and treat
// a missing one as zero, so a new type never needs a new branch.

/**
 * What an installation does to its region every day it is online. Each
 * field is optional; absent means no effect on that axis. At least one
 * field is set on every catalogue entry.
 */
export interface DeployableEffect {
  /**
   * Infestation points removed from each infested city in the region per
   * day, subtracted from that day's growth (`growthDelta` in the
   * infestation growth service). Positive.
   */
  readonly suppression?: number;
  /**
   * Fraction in `(0, 1]` by which the chance of infestation spreading out
   * of the region to a neighbour is reduced. Several installations in
   * one region stack multiplicatively; the spread service (#58) owns
   * the exact rule.
   */
  readonly spreadDeterrence?: number;
  /**
   * Whole days earlier that missions attached to the region's cities are
   * revealed to the player, giving more time before they expire.
   * Positive integer.
   */
  readonly intelBonus?: number;
}

/** Field names of `DeployableEffect`, for validation and tests. */
export const DEPLOYABLE_EFFECT_KEYS = [
  "suppression",
  "spreadDeterrence",
  "intelBonus",
] as const satisfies readonly (keyof DeployableEffect)[];

// ===========================================
// Deployable type
// ===========================================

/**
 * Static definition of a region-level installation (GDD §5.6). One
 * record per type lives in `overworld/data/deployable-types.ts`; built
 * instances (`Deployable`) reference it by `id`.
 *
 * ```
 *   DeployableType (catalogue, static)      Deployable (instance)
 *   ┌────────────────────────────┐          ┌──────────────────────────┐
 *   │ id: "defensive-battery"    │◄─────────│ typeId                   │
 *   │ buildCost / upkeepPerDay   │          │ regionId                 │
 *   │ maxPerRegion               │          │ builtDay, online         │
 *   │ effect { suppression: 2 }  │          └──────────────────────────┘
 *   └────────────────────────────┘
 * ```
 *
 * Pure data: cost checks, caps and effect application live in the
 * command and tick services (#65, #66).
 */
export interface DeployableType {
  /** Unique catalogue key. */
  readonly id: DeployableTypeId;
  /** Display name, e.g. `"Defensive battery"`. */
  readonly name: string;
  /** Credits charged once when the installation is built. Positive integer. */
  readonly buildCost: number;
  /** Credits charged every day the installation exists. Positive integer. */
  readonly upkeepPerDay: number;
  /** How many of this type one region may hold at once. At least 1. */
  readonly maxPerRegion: number;
  /** What the installation does while online. */
  readonly effect: DeployableEffect;
  /** One or two sentences of flavour and plain-language effect for the UI. */
  readonly description: string;
}
