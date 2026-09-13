import type { Rank, RankBonusTuning, RankLadder } from "../model/rank";

// ===========================================
// Types
// ===========================================

/** What a rank adds to a unit's template, in whole units. */
export interface RankBonuses {
  /** Extra tiles per move action. */
  readonly move: number;
  /** Extra percentage points of accuracy on every weapon. */
  readonly accuracy: number;
  /** Extra action points per turn. */
  readonly ap: number;
}

/** No bonus at all: the first rung of any ladder. */
export const NO_RANK_BONUSES: RankBonuses = { move: 0, accuracy: 0, ap: 0 };

// ===========================================
// Ladder
// ===========================================

/**
 * Index of the rung `xp` has reached: the last rank whose threshold is
 * at or below `xp`. Experience below the first rung — which the shipped
 * ladder starts at zero — still reads as the first rung, so a unit is
 * never rankless.
 *
 * @param xp - The unit's accumulated experience.
 * @param ladder - Ranks from lowest to highest.
 * @returns The rank index, `0` for an empty ladder.
 */
export function rankIndexOf(xp: number, ladder: RankLadder): number {
  let index = 0;
  for (let i = 1; i < ladder.length; i++) {
    if (ladder[i]!.xp <= xp) {
      index = i;
    }
  }
  return index;
}

/**
 * The rank `xp` has reached, or undefined for an empty ladder.
 *
 * @param xp - The unit's accumulated experience.
 * @param ladder - Ranks from lowest to highest.
 */
export function rankOf(xp: number, ladder: RankLadder): Rank | undefined {
  return ladder[rankIndexOf(xp, ladder)];
}

/**
 * The rung after the one `xp` has reached, or undefined at the top of
 * the ladder.
 *
 * @param xp - The unit's accumulated experience.
 * @param ladder - Ranks from lowest to highest.
 */
export function nextRank(xp: number, ladder: RankLadder): Rank | undefined {
  return ladder[rankIndexOf(xp, ladder) + 1];
}

/**
 * Experience still needed for the next rung, or undefined at the top.
 *
 * @param xp - The unit's accumulated experience.
 * @param ladder - Ranks from lowest to highest.
 */
export function xpToNextRank(
  xp: number,
  ladder: RankLadder,
): number | undefined {
  const next = nextRank(xp, ladder);
  return next === undefined ? undefined : Math.max(0, next.xp - xp);
}

/**
 * The rank a unit was promoted to between two experience totals, or
 * undefined when it stayed on its rung. Used by the casualty service to
 * announce a promotion and by the debrief to show it, so the two agree
 * on what a promotion is.
 *
 * @param xpBefore - Experience before the mission.
 * @param xpAfter - Experience after it.
 * @param ladder - Ranks from lowest to highest.
 */
export function promotionBetween(
  xpBefore: number,
  xpAfter: number,
  ladder: RankLadder,
): Rank | undefined {
  const before = rankIndexOf(xpBefore, ladder);
  const after = rankIndexOf(xpAfter, ladder);
  return after > before ? ladder[after] : undefined;
}

// ===========================================
// Bonuses
// ===========================================

/**
 * What rank `index` is worth in the field: each rate times the index,
 * floored, so a bonus only ever lands as a whole tile, point or action.
 *
 * ```
 *   movePerRank 0.5, apPerRank 0.25, accuracyPerRank 2
 *   index 2 ──► move 1, accuracy 4, ap 0
 *   index 4 ──► move 2, accuracy 8, ap 1
 * ```
 *
 * @param index - The rank index from `rankIndexOf`.
 * @param tuning - The per-rank rates.
 * @returns Whole-number bonuses, never negative.
 */
export function rankBonuses(
  index: number,
  tuning: RankBonusTuning,
): RankBonuses {
  const steps = Math.max(0, Math.floor(index));
  return {
    move: Math.floor(steps * tuning.movePerRank),
    accuracy: Math.floor(steps * tuning.accuracyPerRank),
    ap: Math.floor(steps * tuning.apPerRank),
  };
}
