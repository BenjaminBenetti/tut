// ===========================================
// Deployable levels
// ===========================================

/**
 * Upgrade level of an installation (GDD §5.6). Every type has exactly
 * three: level 1 is what a build buys, and each upgrade steps the level
 * once, growing the effect and the upkeep for a one-off price.
 */
export type DeployableLevel = 1 | 2 | 3;

/** Every level in ascending order, for iteration and validation. */
export const DEPLOYABLE_LEVELS = [
  1, 2, 3,
] as const satisfies readonly DeployableLevel[];

/** The level a freshly built installation starts at. */
export const MIN_DEPLOYABLE_LEVEL: DeployableLevel = 1;

/** The level past which an installation cannot be upgraded. */
export const MAX_DEPLOYABLE_LEVEL: DeployableLevel = 3;

/** Narrows an arbitrary value (from a save file, say) to a `DeployableLevel`. */
export function isDeployableLevel(value: unknown): value is DeployableLevel {
  return (DEPLOYABLE_LEVELS as readonly unknown[]).includes(value);
}

/** The level one upgrade from `level` reaches, or `undefined` at the top. */
export function nextDeployableLevel(
  level: DeployableLevel,
): DeployableLevel | undefined {
  switch (level) {
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return undefined;
  }
}
