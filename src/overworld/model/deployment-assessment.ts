import type { Deployment } from "./deployment";
import type { Mission } from "./mission";
import type { MissionResolutionState } from "./mission-resolution-state";

// ===========================================
// Assessment
// ===========================================

/** How a planned deployment measures up against a mission, for presentation. */
export interface DeploymentAssessment {
  /** Force rating of the deployed units as the resolver counts them. */
  readonly force: number;
  /** Force at which the fight is even: `difficulty × difficultyScale`. */
  readonly target: number;
  /** Chance of a win in `[0, 1]`, on the resolver's own curve. */
  readonly winProbability: number;
}

/**
 * Rates a deployment the way the mission resolver will, so the deployment
 * screen can show force against difficulty without owning any formula.
 * The M1 implementation reads the auto-resolver's rating and win curve;
 * M2's tactical resolver supplies its own estimate.
 */
export interface DeploymentAssessor {
  /** Assesses `deployment` against `mission` given the roster and host city. */
  assess(
    mission: Mission,
    deployment: Deployment,
    state: MissionResolutionState,
  ): DeploymentAssessment;
}
