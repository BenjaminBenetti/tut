import type { ObjectiveResult } from "../../../overworld/model/mission-result";
import type {
  ObjectiveResultFields,
  ObjectiveRulesTable,
} from "../../model/objective-rules";
import type { Objective, TacticalState } from "../../model/tactical-state";
import { OBJECTIVE_RULES, objectiveRulesFor } from "./objective-rules";

// ===========================================
// Status
// ===========================================

/**
 * True when the objective is done: never once it has failed, otherwise
 * whatever its kind's rule says (ADR 0013 §2.3). A defence answers live;
 * a spawner objective answers from its flag.
 *
 * ```
 *   objective.failed          ──► false   (the flags are never both set)
 *   rules[kind].complete(…)   ──► the answer
 * ```
 *
 * @param mission - The mission the objective belongs to.
 * @param objective - The objective to judge.
 * @param rules - The table; the shipped one unless a test substitutes it.
 */
export function objectiveComplete(
  mission: TacticalState,
  objective: Objective,
  rules: ObjectiveRulesTable = OBJECTIVE_RULES,
): boolean {
  return (
    objective.failed !== true &&
    objectiveRulesFor(objective, rules).complete(objective, mission)
  );
}

/**
 * True when the objective can never be completed now: it was recorded
 * failed (its deadline passed, or its own step gave up on it), or its
 * kind's rule says so live.
 *
 * @param mission - The mission the objective belongs to.
 * @param objective - The objective to judge.
 * @param rules - The table; the shipped one unless a test substitutes it.
 */
export function objectiveFailed(
  mission: TacticalState,
  objective: Objective,
  rules: ObjectiveRulesTable = OBJECTIVE_RULES,
): boolean {
  return (
    objective.failed === true ||
    objectiveRulesFor(objective, rules).failed(objective, mission)
  );
}

/**
 * The objectives that decide the mission (#1179): every one not marked
 * `optional`, in objective order. A win needs each of them complete;
 * an optional objective (a story mission's host nests) never holds a
 * win back.
 *
 * ```
 *   objectives.filter(optional ≠ true)
 * ```
 *
 * @param objectives - The mission's objectives.
 */
export function decidingObjectives(
  objectives: readonly Objective[],
): readonly Objective[] {
  return objectives.filter((objective) => objective.optional !== true);
}

/**
 * Whether the generic services should still offer the objective to be
 * worked — the Interact handler, the reach query and the fog blips. An
 * objective is workable until it is complete, unless its kind is
 * `workedUntilEmpty` (a rescue, campaign arc §6.4), which is workable
 * whatever its flags say and answers "nothing left" through its own
 * rules instead.
 *
 * ```
 *   kind workedUntilEmpty ──► true
 *   objective.complete    ──► false
 *   otherwise             ──► true
 * ```
 *
 * @param objective - The objective to judge.
 * @param rules - The table; the shipped one unless a test substitutes it.
 */
export function objectiveWorkable(
  objective: Objective,
  rules: ObjectiveRulesTable = OBJECTIVE_RULES,
): boolean {
  return (
    objectiveRulesFor(objective, rules).workedUntilEmpty === true ||
    !objective.complete
  );
}

// ===========================================
// Mission result
// ===========================================

/**
 * One `ObjectiveResult` row per objective, in objective order, for the
 * mission result the overworld's consequence rules read (ADR 0013
 * §2.3). Filled the same way for every kind: the kind as a plain string
 * (the overworld never imports tactical types), the generic status, and
 * the kind's tally when it keeps one.
 *
 * ```
 *   { kind, complete: objectiveComplete, failed: objectiveFailed, done?, total? }
 * ```
 *
 * @param mission - The finished mission.
 * @param rules - The table; the shipped one unless a test substitutes it.
 */
export function objectiveResults(
  mission: TacticalState,
  rules: ObjectiveRulesTable = OBJECTIVE_RULES,
): readonly ObjectiveResult[] {
  return mission.objectives.map((objective): ObjectiveResult => {
    const tally = objectiveRulesFor(objective, rules).tally?.(
      objective,
      mission,
    );
    return {
      kind: objective.kind,
      complete: objectiveComplete(mission, objective, rules),
      failed: objectiveFailed(mission, objective, rules),
      ...(tally === undefined ? {} : { done: tally.done, total: tally.total }),
    };
  });
}

/**
 * The kinds' own result fields, merged in objective order with the
 * first objective to name a field keeping it: a defence's `defence`,
 * say. Empty when no objective adds any, so a mission without them
 * reports exactly what it did before the table existed.
 *
 * @param mission - The finished mission.
 * @param rules - The table; the shipped one unless a test substitutes it.
 */
export function objectiveResultFields(
  mission: TacticalState,
  rules: ObjectiveRulesTable = OBJECTIVE_RULES,
): ObjectiveResultFields {
  let fields: ObjectiveResultFields = {};
  for (const objective of mission.objectives) {
    const own = objectiveRulesFor(objective, rules).resultFields?.(
      objective,
      mission,
    );
    if (own !== undefined) {
      fields = { ...own, ...fields };
    }
  }
  return fields;
}
