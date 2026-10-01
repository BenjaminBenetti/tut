import type { Mech, MechId } from "../../roster/model/mech";
import type { MechPricing } from "../../roster/model/mech-pricing";
import type { MechSalvageTuning } from "../../roster/model/mech-salvage-tuning";
import type { MissionResult } from "../model/mission-result";
import { heldTheField } from "../model/mission-result";

// ===========================================
// Types
// ===========================================

/** What valuing a mission's salvage needs: the price of a mech, and the share paid back. */
export interface MechSalvageDeps {
  /** Prices a destroyed mech's loadout: what building it new would cost. */
  readonly pricing: MechPricing;
  /** The share of that price salvage pays; `MECH_SALVAGE_TUNING` at the composition root. */
  readonly tuning: MechSalvageTuning;
}

/** What one resolved mission's destroyed mechs are salvaged for. */
export interface MechSalvage {
  /** Whole credits, `>= 0`: the sum over `mechIds` of `floor(fraction × price)`. */
  readonly credits: number;
  /** The destroyed mechs it was paid for, in `mechsDestroyed` order. */
  readonly mechIds: readonly MechId[];
}

/** Salvage of a mission that pays none. */
export const NO_SALVAGE: MechSalvage = { credits: 0, mechIds: [] };

// ===========================================
// Valuation
// ===========================================

/**
 * Values the salvage of a resolved mission (GDD §5.7, #1179): when the
 * force held the field, each mech it lost is hauled off the map and
 * paid back at a share of its price; when it did not, the salvage is
 * nothing, and the wreck is left for Wreck Recovery (`recordWrecks`,
 * arc §6.6). The two turn on the same `heldTheField`, so a destroyed
 * mech is paid for exactly once, as credits or as parts, never both.
 *
 * ```
 *   heldTheField(outcome)? ──no──► NO_SALVAGE        (the wreck is Wreck Recovery's)
 *        │yes
 *   for each id in mechsDestroyed, read from `mechs` as they stood at launch:
 *        credits += floor(fraction × pricing.priceOf(mech.loadout))
 * ```
 *
 * The price is the mech's full price, chassis, parts and upgrades,
 * whatever the stock saved when it was built. A destroyed id the
 * roster does not know is skipped, and a mech whose loadout prices at
 * nothing pays nothing. Auto-resolve and the tactical layer both report
 * an outcome and the destroyed mechs, so whichever resolver played the
 * mission, the launch handler pays the same salvage for it. Pure: reads
 * only its arguments.
 *
 * @param result - What the resolver reported.
 * @param mechs - The roster's mechs as they stood at launch.
 * @param deps - The pricing and the share paid back.
 * @returns The credits, and the mechs they were paid for.
 */
export function mechSalvageOf(
  result: MissionResult,
  mechs: readonly Mech[],
  deps: MechSalvageDeps,
): MechSalvage {
  if (!heldTheField(result.outcome) || result.mechsDestroyed.length === 0) {
    return NO_SALVAGE;
  }
  let credits = 0;
  const mechIds: MechId[] = [];
  for (const id of result.mechsDestroyed) {
    const mech = mechs.find((each) => each.id === id);
    if (mech === undefined) {
      continue;
    }
    credits += Math.floor(
      deps.tuning.fraction * deps.pricing.priceOf(mech.loadout),
    );
    mechIds.push(id);
  }
  return { credits, mechIds };
}
