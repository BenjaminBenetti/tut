/**
 * Credits are whole, non-negative numbers everywhere they appear as a
 * magnitude: starting balances, prices, rewards, stipends. Only ledger
 * entries carry a sign. These guards centralise that rule so every
 * entry point rejects the same inputs the same way.
 */

// ===========================================
// Guards
// ===========================================

/** True when `value` is a non-negative integer. */
export function isWholeCredits(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Throws unless `value` is a non-negative integer. `label` names the
 * offending parameter in the message.
 *
 * @throws {RangeError} for negative, fractional, NaN or infinite values.
 */
export function assertWholeCredits(value: number, label: string): void {
  if (!isWholeCredits(value)) {
    throw new RangeError(
      `Invalid ${label} ${String(value)}: must be a non-negative integer`,
    );
  }
}
