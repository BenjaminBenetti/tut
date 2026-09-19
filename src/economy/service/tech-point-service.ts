import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import { assertWholeCredits } from "../model/credit-amount";
import type { EconomyApplied } from "../model/economy-event";
import { TECH_POINTS_CHANGED } from "../model/economy-event";
import type { EconomyState } from "../model/economy-state";
import type { InsufficientTechPointsError } from "../model/insufficient-tech-points-error";
import type { TechPointService } from "../model/tech-point-service";

// ===========================================
// TechPointTreasury
// ===========================================

/**
 * `TechPointService` over the pool in `EconomyState`. Stateless: unlike
 * the credit ledger it draws no ids, because tech points keep no ledger
 * (see `EconomyState`); every movement is described by the event alone.
 */
export class TechPointTreasury implements TechPointService {
  // ===========================================
  // TechPointService
  // ===========================================

  /**
   * True when the pool covers `amount`.
   *
   * @throws {RangeError} if `amount` is not a whole, non-negative number.
   */
  canAfford(state: EconomyState, amount: number): boolean {
    assertWholeCredits(amount, "amount");
    return state.techPoints >= amount;
  }

  /**
   * Removes `amount` tech points. Returns an `InsufficientTechPointsError`
   * without touching state when the pool is too small.
   *
   * @throws {RangeError} if `amount` or `day` is not a whole, non-negative
   *   number; these are programmer errors, not player-facing failures.
   */
  spend(
    state: EconomyState,
    amount: number,
    ref: string,
    day: number,
  ): Result<EconomyApplied, InsufficientTechPointsError> {
    assertWholeCredits(amount, "amount");
    assertWholeCredits(day, "day");
    if (!this.canAfford(state, amount)) {
      return err({
        type: "insufficient-tech-points",
        required: amount,
        available: state.techPoints,
      });
    }
    // `0 - amount` rather than `-amount` so a zero spend records +0, not -0.
    return ok(this.move(state, 0 - amount, ref, day));
  }

  /**
   * Adds `amount` tech points.
   *
   * @throws {RangeError} if `amount` or `day` is not a whole, non-negative
   *   number.
   */
  earn(
    state: EconomyState,
    amount: number,
    ref: string,
    day: number,
  ): EconomyApplied {
    assertWholeCredits(amount, "amount");
    assertWholeCredits(day, "day");
    return this.move(state, amount, ref, day);
  }

  // ===========================================
  // Private
  // ===========================================

  /** Applies one signed movement to the pool and describes it. The only place tech points move. */
  private move(
    state: EconomyState,
    amount: number,
    ref: string,
    day: number,
  ): EconomyApplied {
    const next: EconomyState = {
      ...state,
      techPoints: state.techPoints + amount,
    };
    return {
      state: next,
      events: [
        {
          type: TECH_POINTS_CHANGED,
          payload: {
            before: state.techPoints,
            after: next.techPoints,
            amount,
            ref,
            day,
          },
        },
      ],
    };
  }
}
