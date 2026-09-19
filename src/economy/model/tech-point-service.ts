import type { Result } from "../../core/model/result";
import type { EconomyApplied } from "./economy-event";
import type { EconomyState } from "./economy-state";
import type { InsufficientTechPointsError } from "./insufficient-tech-points-error";

/**
 * The one door through which tech points move (GDD §5.5.1). The mission
 * debrief earns them and the tech tree spends them; nothing else edits
 * `EconomyState.techPoints`. Implementations never mutate the state they
 * are given.
 *
 * ```
 *   spend ──► canAfford? ──► no  ──► Err(InsufficientTechPointsError)   (state untouched)
 *                       └──► yes ──► Ok({ state', [TechPointsChanged] })
 *   earn  ──────────────────────────► { state', [TechPointsChanged] }
 * ```
 *
 * `amount` is always a whole, non-negative magnitude; the service applies
 * the sign. `ref` names what the movement was for (a mission id, a tech
 * node id) so the event can be read back.
 */
export interface TechPointService {
  /** True when `state.techPoints` covers `amount`. */
  canAfford(state: EconomyState, amount: number): boolean;

  /**
   * Removes `amount` tech points. Fails without changing anything when
   * the pool cannot cover it.
   */
  spend(
    state: EconomyState,
    amount: number,
    ref: string,
    day: number,
  ): Result<EconomyApplied, InsufficientTechPointsError>;

  /** Adds `amount` tech points. Cannot fail. */
  earn(
    state: EconomyState,
    amount: number,
    ref: string,
    day: number,
  ): EconomyApplied;
}
