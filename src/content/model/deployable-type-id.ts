// ===========================================
// Deployable type id
// ===========================================

/**
 * The Earth installations the player can build (GDD §5.6). A closed
 * union so `DEPLOYABLE_TYPES` in `overworld/data` must define every
 * member and any table keyed by it fails to compile when one is
 * forgotten. Shared vocabulary (ADR 0002 §2.1): the overworld builds
 * and ticks them, map generation raises the matching facility on a
 * defend-installation map (#1175), and the strategic map and the
 * briefing name them.
 */
export type DeployableTypeId =
  "defensive-battery" | "repellent-dispersal" | "sensor-array" | "bank";

/**
 * Every deployable type id, in a fixed order. Used for iteration, for
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
