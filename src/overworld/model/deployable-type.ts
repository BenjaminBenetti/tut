import type { DeployableLevel } from "./deployable-level";

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
  "defensive-battery" | "repellent-dispersal" | "sensor-array" | "bank";

/**
 * Runtime list of every `DeployableTypeId`, in a fixed order, for
 * validation and for tests that must cover each type. The `satisfies`
 * check rejects a stray member; the data test checks the list is complete.
 */
export const DEPLOYABLE_TYPE_IDS = [
  "defensive-battery",
  "repellent-dispersal",
  "sensor-array",
  "bank",
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
// The tick services that consume them read the field they care about and
// treat a missing one as "no effect", so a new type never needs a new
// branch:
//
//   detectionFactor  ──► infestation detection (sensor array)
//   intelBonus       ──► mission generation     (sensor array)
//   growthFactor     ──► infestation growth     (repellent dispersal)
//   spreadDeterrence ──► infestation seeding    (repellent dispersal)
//   garrisonTurrets  ──► tactical mission start (defensive battery)
//   incomeBonus      ──► daily stipend          (bank)

/**
 * What an installation does to its region every day it is online, at
 * one level. Each field is optional; absent means no effect on that
 * axis. At least one field is set on every level of every catalogue
 * entry.
 */
export interface DeployableEffect {
  /**
   * Fraction in `(0, 1]` the region's detection thresholds are
   * multiplied by (`infestation-tuning`), so infested cities are found at
   * a lower infestation. Several installations take the lowest factor.
   */
  readonly detectionFactor?: number;
  /**
   * Whole days longer that missions attached to the region's cities stay
   * on offer, giving more time before they expire. Positive integer;
   * stacks additively.
   */
  readonly intelBonus?: number;
  /**
   * Fraction in `[0, 1]` the daily infestation growth of every city in
   * the region is multiplied by: `0.75` slows growth by a quarter.
   * Several installations stack multiplicatively.
   */
  readonly growthFactor?: number;
  /**
   * Fraction in `(0, 1]` by which the chance of a fresh landing seeding
   * a clean city in the region is reduced. Several installations stack
   * as `1 − Π(1 − d)`; the spread service owns the exact rule.
   */
  readonly spreadDeterrence?: number;
  /**
   * Automated gun turrets placed on the map of every mission fought in
   * the region, the same turrets an engineer deploys but with no
   * battery life. Non-negative integer; stacks additively.
   */
  readonly garrisonTurrets?: number;
  /**
   * Credits added to the daily stipend, wherever the installation is.
   * Positive integer; stacks additively across every online bank.
   */
  readonly incomeBonus?: number;
}

/** Field names of `DeployableEffect`, for validation and tests. */
export const DEPLOYABLE_EFFECT_KEYS = [
  "detectionFactor",
  "intelBonus",
  "growthFactor",
  "spreadDeterrence",
  "garrisonTurrets",
  "incomeBonus",
] as const satisfies readonly (keyof DeployableEffect)[];

// ===========================================
// Level spec
// ===========================================

/**
 * What one level of a type costs and does. Level 1's `buildCost` is the
 * build price; a higher level's is the price of the upgrade that reaches
 * it. Upkeep is charged at the installation's current level.
 */
export interface DeployableLevelSpec {
  /**
   * Credits charged once: to build (level 1) or to upgrade to this level
   * (levels 2 and 3). Positive integer.
   */
  readonly buildCost: number;
  /** Credits charged every day the installation is at this level. Positive integer. */
  readonly upkeepPerDay: number;
  /** What the installation does at this level while online. */
  readonly effect: DeployableEffect;
}

// ===========================================
// Deployable type
// ===========================================

/**
 * Static definition of a region-level installation (GDD §5.6). One
 * record per type lives in `overworld/data/deployable-types.ts`; built
 * instances (`Deployable`) reference it by `id` and carry their level.
 *
 * ```
 *   DeployableType (catalogue, static)         Deployable (instance)
 *   ┌───────────────────────────────────┐      ┌──────────────────────────┐
 *   │ id: "defensive-battery"           │◄─────│ typeId                   │
 *   │ maxPerRegion                      │      │ regionId, level          │
 *   │ levels:                           │      │ builtDay, online         │
 *   │   1: { buildCost, upkeep, effect }│      └──────────────────────────┘
 *   │   2: { buildCost, upkeep, effect }│
 *   │   3: { buildCost, upkeep, effect }│
 *   └───────────────────────────────────┘
 * ```
 *
 * `levels` is keyed by `DeployableLevel`, so a type cannot omit one.
 * Pure data: cost checks, caps and effect application live in the
 * command and tick services.
 */
export interface DeployableType {
  /** Unique catalogue key. */
  readonly id: DeployableTypeId;
  /** Display name, e.g. `"Defensive battery"`. */
  readonly name: string;
  /** How many of this type one region may hold at once. At least 1. */
  readonly maxPerRegion: number;
  /** Cost, upkeep and effect at each of the three levels. */
  readonly levels: Readonly<Record<DeployableLevel, DeployableLevelSpec>>;
  /** One or two sentences of flavour and plain-language effect for the UI. */
  readonly description: string;
}

/** The spec of `type` at `level`. */
export function levelSpec(
  type: DeployableType,
  level: DeployableLevel,
): DeployableLevelSpec {
  return type.levels[level];
}

/** What building `type` costs: its level 1 price. */
export function deployableBuildCost(type: DeployableType): number {
  return type.levels[1].buildCost;
}
