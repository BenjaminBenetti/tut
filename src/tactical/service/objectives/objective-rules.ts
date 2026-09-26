import type {
  ObjectiveKind,
  ObjectiveRules,
  ObjectiveRulesTable,
} from "../../model/objective-rules";
import type { PhaseStep } from "../../model/phase-step";
import type { Objective } from "../../model/tactical-state";
import { SHIPPED_EQUIPMENT } from "../../repository/equipment-catalogue";
import { createCaptureSpecimenObjective } from "./capture-specimen-objective";
import { DEFEND_GENERATORS_OBJECTIVE } from "./defend-generators-objective";
import { DESTROY_POD_OBJECTIVE } from "./destroy-pod-objective";
import { DESTROY_SPAWNER_OBJECTIVE } from "./destroy-spawner-objective";
import { RESCUE_CIVILIANS_OBJECTIVE } from "./rescue-civilians-objective";
import { STRIP_WRECK_OBJECTIVE } from "./strip-wreck-objective";

// ===========================================
// The table
// ===========================================

/**
 * The rules of every objective kind (ADR 0013 §2.3), one module each.
 * This file only lists them: what a kind does lives in its module, and
 * the generic services — `objective-status`, the Interact handler,
 * reach, fog markers, Jev destinations, the deadline step and the
 * mission result — read it from here.
 *
 * ```
 *   destroy-spawner    ──► destroy-spawner-objective.ts
 *   defend-generators  ──► defend-generators-objective.ts
 *   destroy-pod        ──► destroy-pod-objective.ts
 *   capture-specimen   ──► capture-specimen-objective.ts (with the shipped
 *                          equipment, to tell a net from the rest)
 *   rescue-civilians   ──► rescue-civilians-objective.ts
 *   strip-wreck        ──► strip-wreck-objective.ts
 * ```
 *
 * Typed by `ObjectiveRulesTable`, so a kind added to `Objective` without
 * an entry here, or rules filed under the wrong kind, fails to compile.
 * Entry order is the order `objectivePhaseSteps` runs the kinds' steps
 * in: append, never insert.
 */
export const OBJECTIVE_RULES: ObjectiveRulesTable = {
  "destroy-spawner": DESTROY_SPAWNER_OBJECTIVE,
  "defend-generators": DEFEND_GENERATORS_OBJECTIVE,
  "destroy-pod": DESTROY_POD_OBJECTIVE,
  "capture-specimen": createCaptureSpecimenObjective(SHIPPED_EQUIPMENT),
  "rescue-civilians": RESCUE_CIVILIANS_OBJECTIVE,
  "strip-wreck": STRIP_WRECK_OBJECTIVE,
};

// ===========================================
// Lookups
// ===========================================

/**
 * The rules for `objective`'s own kind. Typed for the whole union so a
 * generic service can call them with the objective it looked them up
 * by; see `ObjectiveRules` for why that needs no cast.
 *
 * @param objective - The objective whose rules are wanted.
 * @param rules - The table; the shipped one unless a test substitutes it.
 */
export function objectiveRulesFor(
  objective: Objective,
  rules: ObjectiveRulesTable = OBJECTIVE_RULES,
): ObjectiveRules<ObjectiveKind> {
  return rules[objective.kind];
}

/**
 * Every kind's own phase step, in table order, for `EndTurn`'s list
 * (#1175's defence is the first). The composition root spreads these
 * after the edge waves, so a passive objective judges the wave that
 * has just landed.
 *
 * @param rules - The table; the shipped one unless a test substitutes it.
 * @returns The kinds' steps; kinds without one add nothing.
 */
export function objectivePhaseSteps(
  rules: ObjectiveRulesTable = OBJECTIVE_RULES,
): readonly PhaseStep[] {
  const steps: PhaseStep[] = [];
  for (const kindRules of Object.values<ObjectiveRules<ObjectiveKind>>(rules)) {
    if (kindRules.phaseStep !== undefined) {
      steps.push(kindRules.phaseStep);
    }
  }
  return steps;
}
