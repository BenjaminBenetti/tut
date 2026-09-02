import type { Rng } from "../../core/model/rng";
import type { Deployment } from "./deployment";
import type { Mission } from "./mission";
import type { MissionResolutionState } from "./mission-resolution-state";
import type { MissionResult } from "./mission-result";

/**
 * Turns a launched mission into a result (architecture §5). The overworld
 * does not care how: M1 ships `AutoResolveMissionResolver` (#62), which
 * rolls the outcome from ratings and difficulty; M2 replaces it with the
 * tactical layer, which plays the mission out on a generated map.
 *
 * ```
 *   Mission + Deployment + MissionResolutionState + Rng
 *                          │
 *                          ▼
 *                   MissionResolver.resolve
 *                          │
 *                          ▼
 *                    MissionResult ──► LaunchMission applies it (#67)
 * ```
 *
 * Implementations are pure: every random draw comes from `rng`, inputs
 * are never mutated, and nothing is applied here.
 */
export interface MissionResolver {
  /**
   * Resolves one mission. `state` holds the roster units and host city
   * the resolver may read; `rng` is the only source of randomness so a
   * seed reproduces the result.
   */
  resolve(
    mission: Mission,
    deployment: Deployment,
    state: MissionResolutionState,
    rng: Rng,
  ): MissionResult;
}
