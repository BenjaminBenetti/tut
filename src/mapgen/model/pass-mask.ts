// ===========================================
// Passability mask
// ===========================================

/**
 * Bitmask of unit classes that may occupy a tile or use a connector
 * (ADR 0004 §4.1). Combine with `|`, test with `allows`.
 *
 * ```
 *   bit 0  INFANTRY
 *   bit 1  MECH
 * ```
 */
export const PassMask = {
  NONE: 0,
  INFANTRY: 1,
  MECH: 2,
  ALL: 3,
} as const;

/** A combination of `PassMask` bits. */
export type PassMask = number;

/** A mask naming exactly one unit class. */
export type UnitClass = typeof PassMask.INFANTRY | typeof PassMask.MECH;

/** Every single-class mask, for iterating reachability per class. */
export const UNIT_CLASSES: readonly UnitClass[] = [
  PassMask.INFANTRY,
  PassMask.MECH,
];

// ===========================================
// Helpers
// ===========================================

/**
 * Returns true when every class bit in `required` is present in `mask`.
 * `required = NONE` is vacuously allowed.
 */
export function allows(mask: PassMask, required: PassMask): boolean {
  return (mask & required) === required;
}

/**
 * Returns the single-class masks contained in `mask`, in a fixed order.
 */
export function classesIn(mask: PassMask): readonly UnitClass[] {
  return UNIT_CLASSES.filter((unitClass) => allows(mask, unitClass));
}
