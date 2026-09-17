import type { EconomyApplied } from "../model/economy-event";
import type { EconomyState } from "../model/economy-state";
import type { EconomyTuning } from "../model/economy-tuning";
import type { TransactionService } from "../model/transaction-service";

// ===========================================
// Constants
// ===========================================

/**
 * Ledger `ref` for stipend entries. No single entity pays the stipend;
 * the label stands in for Earth's governments as a whole.
 */
export const STIPEND_REF = "earth";

// ===========================================
// Stipend
// ===========================================

/**
 * The stipend Earth pays for one day (GDD §5.5): the base stipend scaled
 * by how much of Earth is unfested, never below the floor, plus whatever
 * the player's banks add (GDD §5.6), which the floor does not eat.
 *
 * ```
 *   stipend = max( stipendFloor, round( baseStipend × unfestedFraction ) ) + incomeBonus
 *
 *   credits
 *   base ┤╲
 *        │  ╲
 *        │    ╲
 *  floor ┤      ╲______________
 *        └──────────────────────► mean city infestation
 *        0                    100
 * ```
 *
 * `unfestedFraction` is in `[0, 1]`; the caller derives it from the map
 * with `unfestedFraction(map)` in `overworld/service/threat-service`, so
 * this domain never reads the overworld directly. Always a whole number
 * of credits when the tuning is whole. The floor keeps a nearly overrun
 * Earth from starving the player of the credits needed to fight back.
 * `incomeBonus` is the whole number of credits online banks add, `0` by
 * default.
 */
export function computeStipend(
  unfestedFraction: number,
  tuning: EconomyTuning,
  incomeBonus = 0,
): number {
  return (
    Math.max(
      tuning.stipendFloor,
      Math.round(tuning.baseStipend * unfestedFraction),
    ) + incomeBonus
  );
}

/**
 * Pays the day's stipend into the treasury through the transaction
 * service: exactly one `stipend` ledger entry against `STIPEND_REF` and
 * a `CreditsChanged` event. Pure over its inputs; the day tick supplies
 * `day`, the current unfested fraction and the banks' `incomeBonus`, and
 * mission rewards are not applied here.
 */
export function applyStipend(
  economy: EconomyState,
  unfestedFraction: number,
  day: number,
  tuning: EconomyTuning,
  transactions: TransactionService,
  incomeBonus = 0,
): EconomyApplied {
  return transactions.earn(
    economy,
    computeStipend(unfestedFraction, tuning, incomeBonus),
    "stipend",
    STIPEND_REF,
    day,
  );
}
