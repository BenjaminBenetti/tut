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
 * by how much of Earth is unfested, never below the floor.
 *
 * ```
 *   stipend = max( stipendFloor, round( baseStipend × unfestedFraction ) )
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
 */
export function computeStipend(
  unfestedFraction: number,
  tuning: EconomyTuning,
): number {
  return Math.max(
    tuning.stipendFloor,
    Math.round(tuning.baseStipend * unfestedFraction),
  );
}

/**
 * Pays the day's stipend into the treasury through the transaction
 * service: exactly one `stipend` ledger entry against `STIPEND_REF` and
 * a `CreditsChanged` event. Pure over its inputs; the day tick supplies
 * `day` and the current unfested fraction, and mission rewards are not
 * applied here.
 */
export function applyStipend(
  economy: EconomyState,
  unfestedFraction: number,
  day: number,
  tuning: EconomyTuning,
  transactions: TransactionService,
): EconomyApplied {
  return transactions.earn(
    economy,
    computeStipend(unfestedFraction, tuning),
    "stipend",
    STIPEND_REF,
    day,
  );
}
