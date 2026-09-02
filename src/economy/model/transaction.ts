// ===========================================
// Transaction kinds
// ===========================================

/**
 * Every reason credits can move, in one place so the ledger can be
 * grouped, filtered and validated. Add a kind here rather than reusing a
 * loosely-fitting one; `TRANSACTION_KINDS` must list every member.
 *
 * | Kind            | Typical sign | Example                                  |
 * |-----------------|--------------|------------------------------------------|
 * | `purchase`      | −            | buying a squad, part, chassis, deployable |
 * | `sale`          | +            | selling a part                            |
 * | `reward`        | +            | mission payout                            |
 * | `stipend`       | +            | per-day income scaled by unfested Earth   |
 * | `upkeep`        | −            | per-day deployable running cost           |
 * | `repair`        | −            | fixing a damaged mech                     |
 * | `reinforcement` | −            | bringing a squad back to strength         |
 * | `event`         | ±            | outcome of an overworld event choice      |
 */
export type TransactionKind =
  | "purchase"
  | "sale"
  | "reward"
  | "stipend"
  | "upkeep"
  | "repair"
  | "reinforcement"
  | "event";

/**
 * Runtime list of every `TransactionKind`, for validation and for tests
 * that must cover each kind. Kept in sync with the union by the
 * `satisfies` check below: adding a kind to one without the other fails
 * to compile.
 */
export const TRANSACTION_KINDS = [
  "purchase",
  "sale",
  "reward",
  "stipend",
  "upkeep",
  "repair",
  "reinforcement",
  "event",
] as const satisfies readonly TransactionKind[];

/**
 * Narrows an arbitrary string (e.g. from a save file or a UI filter) to a
 * `TransactionKind`.
 */
export function isTransactionKind(value: string): value is TransactionKind {
  return (TRANSACTION_KINDS as readonly string[]).includes(value);
}

// ===========================================
// Transaction
// ===========================================

/**
 * One movement of credits, recorded in the economy ledger. Plain data,
 * never edited after it is appended.
 *
 * ```
 *   amount < 0   credits left the treasury   (purchase, upkeep, repair …)
 *   amount > 0   credits entered the treasury (reward, stipend, sale …)
 * ```
 */
export interface Transaction {
  /** Unique id from `core/` id generation, e.g. `"txn-12"`. */
  readonly id: string;
  /** Overworld day on which the transaction happened. */
  readonly day: number;
  /** Signed whole credits: negative for spending, positive for income. */
  readonly amount: number;
  /** Why the credits moved. */
  readonly kind: TransactionKind;
  /**
   * What the transaction concerns: the id of the mech, squad, part,
   * mission, deployable or event involved, or a short label when there
   * is no entity (a stipend, for instance).
   */
  readonly ref: string;
}
