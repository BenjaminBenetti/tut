import type { TacticalApplied } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";

// ===========================================
// Re-exports
// ===========================================

/**
 * The defence's rules moved into their objective module when objective
 * kinds got a rules table (ADR 0013 §2.3), and the generic completion
 * predicates into `objectives/objective-status`. These names stay here
 * so the HUD, the tracker and the sims keep importing them from where
 * they always have; new code imports from `objectives/`.
 *
 * ```
 *   defendStatus, defenceProgress, createDefenceStep ──► objectives/defend-generators-objective
 *   objectiveComplete, objectiveFailed               ──► objectives/objective-status
 * ```
 */
export type {
  DefenceProgress,
  DefendStatus,
} from "./objectives/defend-generators-objective";
export {
  createDefenceStep,
  defenceProgress,
  defendStatus,
} from "./objectives/defend-generators-objective";
export {
  objectiveComplete,
  objectiveFailed,
} from "./objectives/objective-status";

/** The result type phase steps return, re-exported for step tests. */
export type DefenceStepResult = TacticalApplied<TacticalState>;
