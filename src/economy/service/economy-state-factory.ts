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
  if (!Number.isInteger(startingCredits) || startingCredits < 0) {
    throw new RangeError(
      `Invalid startingCredits ${String(startingCredits)}: must be a non-negative integer`,
    );
  }
  return { credits: startingCredits, ledger: [] };
}
