import type { AutoResolveTuning } from "../model/auto-resolve-tuning";
import type { Deployment } from "../model/deployment";
import type {
  DeploymentAssessment,
  DeploymentAssessor,
} from "../model/deployment-assessment";
import type { Mission } from "../model/mission";
import type { MissionResolutionState } from "../model/mission-resolution-state";
import { winProbability } from "./auto-resolve-mission-resolver";
import type { ForceRatingDeps } from "./force-rating-service";
import { computeForceRating } from "./force-rating-service";

// ===========================================
// Dependencies
// ===========================================

/** What the auto-resolve assessor reads: the same catalogue, rater and tuning as the resolver. */
export interface AutoResolveAssessorDeps {
  readonly squadTypes: ForceRatingDeps["squadTypes"];
  readonly mechRater: ForceRatingDeps["mechRater"];
  readonly tuning: Pick<
    AutoResolveTuning,
    "damagePenalty" | "difficultyScale" | "winSpread"
  >;
}

// ===========================================
// AutoResolveDeploymentAssessor
// ===========================================

/**
 * `DeploymentAssessor` over the auto-resolver's force rating and win
 * curve (#62), so what the deployment screen shows is exactly what the
 * roll will use.
 *
 * ```
 *   force  = computeForceRating(deployment, state)
 *   target = difficulty × difficultyScale
 *   P(win) = winProbability(force, difficulty)
 * ```
 */
export class AutoResolveDeploymentAssessor implements DeploymentAssessor {
  // ===========================================
  // Fields
  // ===========================================

  private readonly deps: AutoResolveAssessorDeps;

  // ===========================================
  // Constructor
  // ===========================================

  /** Assesses with the given catalogue, rater and tuning. */
  constructor(deps: AutoResolveAssessorDeps) {
    this.deps = deps;
  }

  // ===========================================
  // DeploymentAssessor
  // ===========================================

  /** Force, even-fight target and win chance for the deployment. */
  assess(
    mission: Mission,
    deployment: Deployment,
    state: MissionResolutionState,
  ): DeploymentAssessment {
    const force = computeForceRating(deployment, state, this.deps);
    return {
      force,
      target: mission.difficulty * this.deps.tuning.difficultyScale,
      winProbability: winProbability(
        force,
        mission.difficulty,
        this.deps.tuning,
      ),
    };
  }
}

/** Builds the M1 assessor. */
export function createDeploymentAssessor(
  deps: AutoResolveAssessorDeps,
): DeploymentAssessor {
  return new AutoResolveDeploymentAssessor(deps);
}
