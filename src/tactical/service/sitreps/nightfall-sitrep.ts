import type { SitrepRule } from "../../model/sitrep-rule";
import type { NightfallTuning } from "../../model/sitrep-tuning";

// ===========================================
// Nightfall
// ===========================================

/**
 * Nightfall (campaign arc §11): the mission is fought in the dark, and
 * every unit of **both** sides sees `sightPenalty` tiles less, never
 * below `sightFloor`. A sight hook only: the vision service applies it
 * inside `sightRangeOf`, the one read of a unit's sight, so fog,
 * spotting, the bug AI and overwatch reach all shrink together, and the
 * unit tuning is never edited.
 *
 * ```
 *   range 14 (mech)      ──► 10
 *   range 12 (infantry)  ──► 8
 *   range 10 (bugs)      ──► 6
 *   range 4 (generator)  ──► 3   the floor
 *   range 2              ──► 2   the dark never raises sight
 * ```
 *
 * @param tuning - The penalty and the floor.
 * @returns The rule for the sitrep table.
 */
export function nightfallSitrep(tuning: NightfallTuning): SitrepRule {
  return {
    id: "nightfall",
    sight: (range) => nightSight(range, tuning),
  };
}

/**
 * A sight range after dark: `range − sightPenalty`, but never below
 * `sightFloor`, and never above `range` itself.
 *
 * @param range - The unit's sight range in daylight, in tiles.
 * @param tuning - The penalty and the floor.
 * @returns Its sight range under Nightfall.
 */
export function nightSight(range: number, tuning: NightfallTuning): number {
  return Math.max(
    Math.min(range, tuning.sightFloor),
    range - tuning.sightPenalty,
  );
}
