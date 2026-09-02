import type { Transaction } from "./transaction";

/**
 * The economy slice of `GameState`. One currency, credits, per GDD §5.5.
 * Plain serializable data; services return a new object rather than
 * mutating this one.
 *
 * ```
 *   EconomyState
 *   ├── credits   current balance, never negative
 *   └── ledger    append-only history of every credit movement
 *                 [ txn-1, txn-2, … ]  oldest first
 * ```
 *
 * The ledger records movements after the campaign starts; the opening
 * balance is not a transaction, so at any moment
 * `credits === startingCredits + Σ ledger[i].amount`.
 */
export interface EconomyState {
  /** Whole credits currently available to spend. */
  readonly credits: number;
  /** Every transaction since campaign start, oldest first. Append only. */
  readonly ledger: readonly Transaction[];
}
