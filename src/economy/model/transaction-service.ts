import type { Result } from "../../core/model/result";
import type { EconomyApplied } from "./economy-event";
import type { EconomyState } from "./economy-state";
import type { InsufficientCreditsError } from "./insufficient-credits-error";
import type { TransactionKind } from "./transaction";

/**
 * The one door through which credits move (GDD §5.5). Every purchase,
 * reward, stipend, upkeep and repair calls this; nothing else edits
 * `EconomyState.credits` or the ledger. Implementations never mutate the
 * state they are given and append exactly one ledger entry per
 * successful call.
 *
 * ```
 *   spend ──► canAfford? ──► no  ──► Err(InsufficientCreditsError)   (state untouched)
 *                       └──► yes ──► Ok({ state', [CreditsChanged] })
 *   earn  ──────────────────────────► { state', [CreditsChanged] }
 * ```
 *
 * `amount` is always a whole, non-negative magnitude; the service applies
 * the sign when it writes the ledger entry.
 */
export interface TransactionService {
  /** True when `state.credits` covers `amount`. */
  canAfford(state: EconomyState, amount: number): boolean;

  /**
   * Removes `amount` credits. Fails without changing anything when the
   * balance cannot cover it.
   */
  spend(
    state: EconomyState,
    amount: number,
    kind: TransactionKind,
    ref: string,
    day: number,
  ): Result<EconomyApplied, InsufficientCreditsError>;

  /** Adds `amount` credits. Cannot fail. */
  earn(
    state: EconomyState,
    amount: number,
    kind: TransactionKind,
    ref: string,
    day: number,
  ): EconomyApplied;
}
