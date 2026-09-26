import type { NamedAlpha } from "../../../overworld/model/named-alpha";
import type { AlphaPresentTuning } from "../../../tactical/model/sitrep-tuning";
import { formatWhole } from "../format";

// ===========================================
// Alpha Present's line
// ===========================================

/**
 * Alpha Present's effect line (campaign arc §8, §11): who leads the
 * swarm and what the crown gives it, in the tuning's numbers. The
 * crowning adds `hpBonus` and `hpPerLevel` for each nemesis level to
 * the bug's hit points, so a level-2 alpha is +100% where a fresh one
 * is +50%.
 *
 * ```
 *   no alpha on the offer   One bug leads: +50% hp, +1 damage; hunts the weakest.
 *   a fresh alpha           Grinder leads: +50% hp, +1 damage; hunts the weakest.
 *   a nemesis, level 2      Grinder, level 2, leads: +100% hp, +1 damage; hunts the weakest.
 * ```
 *
 * @param alpha - The alpha the offer froze, or undefined for the generic line.
 * @param tuning - The crown's numbers: `SITREP_TUNING.alphaPresent` in the shipped game.
 * @returns One sentence.
 */
export function alphaPresentEffect(
  alpha: Pick<NamedAlpha, "name" | "level"> | undefined,
  tuning: AlphaPresentTuning,
): string {
  const level = alpha?.level ?? 0;
  const who =
    alpha === undefined
      ? "One bug"
      : level > 0
        ? `${alpha.name}, level ${formatWhole(level)},`
        : alpha.name;
  const hp = Math.round((tuning.hpBonus + tuning.hpPerLevel * level) * 100);
  return `${who} leads: +${formatWhole(hp)}% hp, +${formatWhole(tuning.damageBonus)} damage; hunts the weakest.`;
}
