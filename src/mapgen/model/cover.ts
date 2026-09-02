// ===========================================
// Cover level
// ===========================================

/**
 * How much cover an occupant grants to units on adjacent tiles
 * (ADR 0004 §4.4). Directional cover for a unit is derived by tactical from
 * the neighbouring tiles' `coverProvided` and the walls on its own edges.
 */
export const CoverLevel = {
  NONE: 0,
  LOW: 1,
  HIGH: 2,
} as const;

/** One of the `CoverLevel` values. */
export type CoverLevel = (typeof CoverLevel)[keyof typeof CoverLevel];

/** Every cover level, lowest first. */
export const COVER_LEVELS: readonly CoverLevel[] = [
  CoverLevel.NONE,
  CoverLevel.LOW,
  CoverLevel.HIGH,
];
