import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Unit } from "../../tactical/model/unit";
import { SOVEREIGN_TUNING } from "../data/sovereign-tuning";
import type { SovereignTuning } from "../model/sovereign-tuning";

// ===========================================
// Constants
// ===========================================

/** The Sovereign's species id: what a placed one carries as `Unit.sourceId`. */
export const SOVEREIGN_SPECIES_ID: BugSpeciesId = "sovereign";

// ===========================================
// Hit points
// ===========================================

/**
 * The Sovereign's hit points for a mission (#1179, campaign arc §9):
 * her base and a little more for every difficulty step above 1. The
 * finale's core-stage setup passes the mission's difficulty.
 *
 * ```
 *   hpBase + hpPerDifficulty·max(0, difficulty − 1)
 *
 *   shipped:  d1 → 120   d5 → 136   d8 → 148   d10 → 156
 * ```
 *
 * @param difficulty - The mission's difficulty, 1 or more.
 * @param tuning - Her numbers; the shipped set by default.
 * @returns Her max hit points, a positive whole number.
 */
export function sovereignHp(
  difficulty: number,
  tuning: SovereignTuning = SOVEREIGN_TUNING,
): number {
  return Math.max(
    1,
    Math.round(
      tuning.hpBase + tuning.hpPerDifficulty * Math.max(0, difficulty - 1),
    ),
  );
}

// ===========================================
// Predicates
// ===========================================

/** True when `unit` is a Sovereign: a bug of her species, alive or not. */
export function isSovereign(unit: Pick<Unit, "team" | "sourceId">): boolean {
  return unit.team === "bugs" && unit.sourceId === SOVEREIGN_SPECIES_ID;
}

/**
 * True when a Sovereign has fallen back onto her core (#1179, arc §9):
 * once she has turned (`Unit.retreating`), or whenever her hit points
 * are at or below `retreatAtHpFraction` of her max. The second clause
 * lets the behaviour fall back in the very phase the wound lands,
 * before the retreat step has marked her.
 *
 * @param unit - The Sovereign.
 * @param tuning - Her numbers; the shipped set by default.
 * @returns Whether she is retreating.
 */
export function isRetreating(
  unit: Pick<Unit, "hp" | "maxHp" | "retreating">,
  tuning: SovereignTuning = SOVEREIGN_TUNING,
): boolean {
  return (
    unit.retreating === true ||
    unit.hp <= unit.maxHp * tuning.retreatAtHpFraction
  );
}

// ===========================================
// Geometry
// ===========================================

/**
 * Ground tiles between the nearest tiles of two square blocks (#1179):
 * the Manhattan distance on the ground plane from the closest tile of
 * one to the closest tile of the other, 0 when they overlap. How far
 * the Sovereign's aura has to reach an ally, whatever either's size.
 *
 * ```
 *   A (2×2) at x 0–1, B (1×1) at x 4, same row  ──► gap 3 (tiles 1 → 4)
 *   ┌──┐
 *   │AA│ . . B
 *   │AA│
 *   └──┘
 * ```
 *
 * @param a - The first block's anchor (lowest `x`, lowest `z`).
 * @param aSize - Its tiles per side.
 * @param b - The second block's anchor.
 * @param bSize - Its tiles per side.
 * @returns Whole tiles, never negative.
 */
export function groundGap(
  a: TileCoord,
  aSize: number,
  b: TileCoord,
  bSize: number,
): number {
  const dx = Math.max(0, a.x - (b.x + bSize - 1), b.x - (a.x + aSize - 1));
  const dz = Math.max(0, a.z - (b.z + bSize - 1), b.z - (a.z + aSize - 1));
  return dx + dz;
}
