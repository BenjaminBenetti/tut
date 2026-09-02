import { assertWholeCredits } from "../model/credit-amount";
import type { EconomyState } from "../model/economy-state";

/**
 * Builds the economy slice for a fresh campaign: the starting balance and
 * an empty ledger. The opening balance is deliberately not recorded as a
 * transaction (see `EconomyState`).
 *
 * @throws {RangeError} if `startingCredits` is negative or not a whole
 *   number, since a campaign must never begin in debt or with fractional
 *   credits.
 */
export function createInitialEconomyState(
  startingCredits: number,
): EconomyState {
  assertWholeCredits(startingCredits, "startingCredits");
  return { credits: startingCredits, ledger: [] };
}
