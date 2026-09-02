import type { IdGenerator } from "../../core/model/id-generator";
import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import { assertWholeCredits } from "../model/credit-amount";
import type { EconomyApplied } from "../model/economy-event";
import { CREDITS_CHANGED } from "../model/economy-event";
import type { EconomyState } from "../model/economy-state";
import type { InsufficientCreditsError } from "../model/insufficient-credits-error";
import type { Transaction, TransactionKind } from "../model/transaction";
import { TRANSACTION_ID_PREFIX } from "../model/transaction";
import type { TransactionService } from "../model/transaction-service";

// ===========================================
// LedgerTransactionService
// ===========================================

/**
 * `TransactionService` backed by the append-only ledger in
 * `EconomyState`. Ids for ledger entries come from the injected
 * `IdGenerator`; the caller owns that generator and persists its state
 * (see `GameMeta.ids`). An id is drawn only when an entry is actually
 * appended, so a refused spend leaves the counter untouched.
 */
export class LedgerTransactionService implements TransactionService {
  // ===========================================
  // Fields
  // ===========================================

  private readonly ids: IdGenerator;

  // ===========================================
  // Construction
  // ===========================================

  /** Creates a service that draws ledger-entry ids from `ids`. */
  constructor(ids: IdGenerator) {
    this.ids = ids;
  }

  // ===========================================
  // TransactionService
  // ===========================================

  /**
   * True when the balance covers `amount`.
   *
   * @throws {RangeError} if `amount` is not a whole, non-negative number.
   */
  canAfford(state: EconomyState, amount: number): boolean {
    assertWholeCredits(amount, "amount");
    return state.credits >= amount;
  }

  /**
   * Removes `amount` credits and records a negative ledger entry. Returns
   * an `InsufficientCreditsError` without touching state or ids when the
   * balance is too low.
   *
   * @throws {RangeError} if `amount` or `day` is not a whole, non-negative
   *   number; these are programmer errors, not player-facing failures.
   */
  spend(
    state: EconomyState,
    amount: number,
    kind: TransactionKind,
    ref: string,
    day: number,
  ): Result<EconomyApplied, InsufficientCreditsError> {
    assertWholeCredits(amount, "amount");
    assertWholeCredits(day, "day");
    if (!this.canAfford(state, amount)) {
      return err({
        type: "insufficient-credits",
        required: amount,
        available: state.credits,
      });
    }
    // `0 - amount` rather than `-amount` so a zero spend records +0, not -0.
    return ok(this.record(state, 0 - amount, kind, ref, day));
  }

  /**
   * Adds `amount` credits and records a positive ledger entry.
   *
   * @throws {RangeError} if `amount` or `day` is not a whole, non-negative
   *   number.
   */
  earn(
    state: EconomyState,
    amount: number,
    kind: TransactionKind,
    ref: string,
    day: number,
  ): EconomyApplied {
    assertWholeCredits(amount, "amount");
    assertWholeCredits(day, "day");
    return this.record(state, amount, kind, ref, day);
  }

  // ===========================================
  // Private
  // ===========================================

  /**
   * Appends one signed ledger entry, adjusts the balance, and describes
   * the change as a `CreditsChanged` event. The only place credits move.
   */
  private record(
    state: EconomyState,
    signedAmount: number,
    kind: TransactionKind,
    ref: string,
    day: number,
  ): EconomyApplied {
    const transaction: Transaction = {
      id: this.ids.nextId(TRANSACTION_ID_PREFIX),
      day,
      amount: signedAmount,
      kind,
      ref,
    };
    const next: EconomyState = {
      credits: state.credits + signedAmount,
      ledger: [...state.ledger, transaction],
    };
    return {
      state: next,
      events: [
        {
          type: CREDITS_CHANGED,
          payload: { before: state.credits, after: next.credits, transaction },
        },
      ],
    };
  }
}
