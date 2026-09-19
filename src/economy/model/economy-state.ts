import type { Transaction } from "./transaction";

/**
 * The economy slice of `GameState`: credits (GDD §5.5) and tech points
 * (GDD §5.5.1). Plain serializable data; services return a new object
 * rather than mutating this one.
 *
 * ```
 *   EconomyState
 *   ├── credits      current balance, never negative
 *   ├── ledger       append-only history of every credit movement
 *   │                [ txn-1, txn-2, … ]  oldest first
 *   └── techPoints   research currency, never negative; earned on
 *                    missions, spent on the tech tree (#1171)
 * ```
 *
 * The ledger records credit movements after the campaign starts; the
 * opening balance is not a transaction, so at any moment
 * `credits === startingCredits + Σ ledger[i].amount`. Tech points keep
 * no ledger: every movement is a mission debrief or a tech unlock, both
 * of which the overworld already records.
 */
export interface EconomyState {
  /** Whole credits currently available to spend. */
  readonly credits: number;
  /** Every transaction since campaign start, oldest first. Append only. */
  readonly ledger: readonly Transaction[];
  /** Whole tech points currently available to spend on the tech tree. */
  readonly techPoints: number;
}
