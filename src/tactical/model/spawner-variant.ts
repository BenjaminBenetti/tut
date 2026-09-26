// ===========================================
// Variants
// ===========================================

/**
 * What a destructible bug object on an objective hook is (ADR 0013
 * §2.3). Every variant is a `Spawner`: it stands on one tile, has hit
 * points, and loses them through `damageSpawner` whether a charge, a
 * shot, a blast or a fire did it, so attacks, picking, fog blips and
 * the scene entity serve them all. What differs is in the traits.
 *
 * ```
 *   egg-spawner   the clearance's nest: hatches on a timer (GDD §6.3)
 *   spore-pod     the crash site's pod: never hatches, matures instead
 *                 (campaign arc §6.3), bursting into a wave
 * ```
 */
export type SpawnerVariant = "egg-spawner" | "spore-pod";

/** The variant a spawner without one is: every spawner saved before pods existed. */
export const DEFAULT_SPAWNER_VARIANT: SpawnerVariant = "egg-spawner";

/** What a spawner variant is, beside the hit points its tuning gives it. */
export interface SpawnerVariantTraits {
  /** What the aim readouts, the log and the tracker call it. */
  readonly name: string;
  /** Armour against a shot; a sac of eggs or a spore husk has none. */
  readonly armor: number;
  /** True when its timer releases hatchlings in the bug phase. */
  readonly hatches: boolean;
}

/**
 * Every variant's traits. Structural facts about what the thing is, as
 * `TEAM_FOR_PHASE` is; the numbers a designer turns (hit points, hatch
 * interval, maturity turn) live in `SpawnTuning`.
 */
export const SPAWNER_VARIANT_TRAITS: Readonly<
  Record<SpawnerVariant, SpawnerVariantTraits>
> = {
  "egg-spawner": { name: "Egg spawner", armor: 0, hatches: true },
  "spore-pod": { name: "Spore pod", armor: 0, hatches: false },
};

/** Anything that may name a spawner variant: a `Spawner`, or a saved one. */
export interface SpawnerVariantCarrier {
  readonly variant?: SpawnerVariant;
}

// ===========================================
// Lookups
// ===========================================

/**
 * The spawner's variant; an egg spawner when it names none.
 *
 * @param spawner - Anything carrying the optional `variant` field.
 */
export function spawnerVariantOf(
  spawner: SpawnerVariantCarrier,
): SpawnerVariant {
  return spawner.variant ?? DEFAULT_SPAWNER_VARIANT;
}

/**
 * The traits of the spawner's variant.
 *
 * @param spawner - Anything carrying the optional `variant` field.
 */
export function spawnerTraitsOf(
  spawner: SpawnerVariantCarrier,
): SpawnerVariantTraits {
  return SPAWNER_VARIANT_TRAITS[spawnerVariantOf(spawner)];
}
