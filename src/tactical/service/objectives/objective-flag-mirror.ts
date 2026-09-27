import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type {
  ObjectiveKind,
  ObjectiveOfKind,
  ObjectiveRules,
} from "../../model/objective-rules";
import type { PhaseStep } from "../../model/phase-step";
import type { TacticalEvent } from "../../model/tactical-event";
import type { Objective, TacticalState } from "../../model/tactical-state";

// ===========================================
// Types
// ===========================================

/**
 * A kind's own live rule: the `complete` and `failed` of its
 * `ObjectiveRules`, and the kind they judge. What a flag mirror reads.
 */
export type LiveObjectiveRule<K extends ObjectiveKind> = Pick<
  ObjectiveRules<K>,
  "kind" | "complete" | "failed"
>;

// ===========================================
// Phase step
// ===========================================

/**
 * A phase step that records a kind's live rule on its objectives'
 * `complete` and `failed` flags (#1179, ADR 0013 §2.3), and announces
 * each change through `ObjectiveUpdated`, as a capture's, a defence's
 * and a hunt's steps do. Anything that reads the flags rather than the
 * rules (Jev's objective list, the tracker's failed row, the fog blips)
 * then sees what the rules say.
 *
 * ```
 *   for each objective of `rule.kind`:
 *     complete ← complete ∨ (¬failed ∧ rule.complete)
 *     failed   ← failed ∨ (¬complete ∧ rule.failed)
 *     changed ──► ObjectiveUpdated { objectiveId, complete, failed }
 *   nothing changed ──► the mission itself, no events
 * ```
 *
 * A flag never goes back, and the two are never both set. The step
 * reads no randomness and leaves every other objective alone.
 *
 * @param rule - The kind and its live `complete` and `failed`.
 * @returns The step, for the kind's `phaseStep`.
 */
export function createObjectiveFlagMirror<K extends ObjectiveKind>(
  rule: LiveObjectiveRule<K>,
): PhaseStep {
  return (mission) => {
    const events: TacticalEvent[] = [];
    const objectives = mission.objectives.map((objective): Objective => {
      if (!isOfKind(objective, rule.kind)) {
        return objective;
      }
      const next = mirrored(rule, objective, mission);
      events.push(...next.events);
      return next.objective;
    });
    return events.length === 0
      ? { state: mission, events: [] }
      : { state: { ...mission, objectives }, events };
  };
}

// ===========================================
// Helpers
// ===========================================

/** Whether `objective` is of `kind`, narrowed to that kind's interface. */
function isOfKind<K extends ObjectiveKind>(
  objective: Objective,
  kind: K,
): objective is ObjectiveOfKind<K> {
  return objective.kind === kind;
}

/**
 * The objective with its flags brought up to the live rule, and the
 * `ObjectiveUpdated` announcing the change; the objective unchanged and
 * no event when nothing moved.
 */
function mirrored<K extends ObjectiveKind>(
  rule: LiveObjectiveRule<K>,
  objective: ObjectiveOfKind<K>,
  mission: TacticalState,
): { objective: Objective; events: TacticalEvent[] } {
  const wasFailed = objective.failed === true;
  const complete =
    objective.complete || (!wasFailed && rule.complete(objective, mission));
  const failed = wasFailed || (!complete && rule.failed(objective, mission));
  if (complete === objective.complete && failed === wasFailed) {
    return { objective, events: [] };
  }
  return {
    objective: { ...objective, complete, failed },
    events: [
      {
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: objective.id, complete, failed },
      },
    ],
  };
}
