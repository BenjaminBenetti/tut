import { assertWholeCredits } from "../model/credit-amount";
import type { EconomyState } from "../model/economy-state";

/**
 * Builds the economy slice for a fresh campaign: the starting balance, an
 * empty ledger and the starting tech points. The opening balance is
 * deliberately not recorded as a transaction (see `EconomyState`).
 *
 * @throws {RangeError} if either amount is negative or not a whole
 *   number, since a campaign must never begin in debt or with fractional
 *   currency.
 */
export function createInitialEconomyState(
  startingCredits: number,
  startingTechPoints = 0,
): EconomyState {
  assertWholeCredits(startingCredits, "startingCredits");
  assertWholeCredits(startingTechPoints, "startingTechPoints");
  return {
    credits: startingCredits,
    ledger: [],
    techPoints: startingTechPoints,
  };
}
