import type { RankTuning } from "../../roster/model/rank";
import { rankBonuses } from "../../roster/service/rank-service";
import { formatWhole } from "./format";

// ===========================================
// Constants
// ===========================================

/** What the second line reads once there is no rung above. */
export const TOP_OF_LADDER = "Top of the ladder.";

// ===========================================
// Rank text
// ===========================================

/**
 * The bonuses of one rung as a phrase: `+1 move · +4 accuracy · +0 AP`.
 * Read from `rankBonuses`, never re-derived, so what the popover says a
 * rank is worth is exactly what the unit factory folds in (#1134).
 *
 * @param index - The rank index on the ladder.
 * @param tuning - The ladder and its rates.
 * @returns The phrase.
 */
export function rankBonusPhrase(index: number, tuning: RankTuning): string {
  const bonuses = rankBonuses(index, tuning.bonuses);
  return `+${formatWhole(bonuses.move)} move · +${formatWhole(bonuses.accuracy)} accuracy · +${formatWhole(bonuses.ap)} AP`;
}

/**
 * What a rank's popover says (#1134): the rung's name, its threshold and
 * what it boosts, then the next rung and what that will be worth, or
 * that the ladder ends here.
 *
 * ```
 *   Corporal · 30 xp — +1 move · +4 accuracy · +0 AP
 *   Sergeant at 60 xp: +1 move · +6 accuracy · +0 AP
 * ```
 *
 * @param index - The rank index on the ladder; clamped into it.
 * @param tuning - The ladder and its rates.
 * @returns Two lines; empty for a ladder with no rungs.
 */
export function rankTooltipLines(index: number, tuning: RankTuning): string[] {
  const { ladder } = tuning;
  if (ladder.length === 0) {
    return [];
  }
  const at = Math.min(ladder.length - 1, Math.max(0, Math.floor(index)));
  const rank = ladder[at]!;
  const next = ladder[at + 1];
  return [
    `${rank.name} · ${formatWhole(rank.xp)} xp — ${rankBonusPhrase(at, tuning)}`,
    next === undefined
      ? TOP_OF_LADDER
      : `${next.name} at ${formatWhole(next.xp)} xp: ${rankBonusPhrase(at + 1, tuning)}`,
  ];
}
