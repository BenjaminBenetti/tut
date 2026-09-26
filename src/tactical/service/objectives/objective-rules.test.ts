import { describe, expect, it } from "vitest";

import type { ObjectiveRulesTable } from "../../model/objective-rules";
import type { Objective } from "../../model/tactical-state";
import { DEFEND_GENERATORS_OBJECTIVE } from "./defend-generators-objective";
import { DESTROY_SPAWNER_OBJECTIVE } from "./destroy-spawner-objective";
import { RESCUE_CIVILIANS_OBJECTIVE } from "./rescue-civilians-objective";
import {
  OBJECTIVE_RULES,
  objectivePhaseSteps,
  objectiveRulesFor,
} from "./objective-rules";

// ===========================================
// Compile-time completeness
// ===========================================

// @ts-expect-error a table without every objective kind does not compile
const MISSING_A_KIND: ObjectiveRulesTable = {
  "destroy-spawner": DESTROY_SPAWNER_OBJECTIVE,
};

const MISFILED: ObjectiveRulesTable = {
  "destroy-spawner": DESTROY_SPAWNER_OBJECTIVE,
  // @ts-expect-error one kind's rules filed under another kind do not compile
  "defend-generators": DESTROY_SPAWNER_OBJECTIVE,
};

// ===========================================
// The table
// ===========================================

describe("OBJECTIVE_RULES (ADR 0013 §2.3)", () => {
  it("files every kind's rules under that kind", () => {
    for (const [key, rules] of Object.entries(OBJECTIVE_RULES)) {
      expect([key, rules.kind]).toEqual([key, key]);
    }
    // The type errors above are the real check; these keep the fixtures used.
    expect(Object.keys(MISSING_A_KIND)).toHaveLength(1);
    expect(Object.keys(MISFILED)).toHaveLength(2);
  });

  it("hands out the rules for an objective's own kind", () => {
    const spawner: Objective = {
      id: "objective-1",
      kind: "destroy-spawner",
      targetId: "spawner-1",
      complete: false,
    };
    const defence: Objective = {
      id: "objective-2",
      kind: "defend-generators",
      installation: "sensor-array",
      targetIds: [],
      complete: false,
      failed: false,
    };
    expect(objectiveRulesFor(spawner)).toBe(DESTROY_SPAWNER_OBJECTIVE);
    expect(objectiveRulesFor(defence)).toBe(DEFEND_GENERATORS_OBJECTIVE);
  });

  it("collects each kind's own phase step in table order, and only those", () => {
    expect(objectivePhaseSteps()).toEqual([
      DEFEND_GENERATORS_OBJECTIVE.phaseStep,
      OBJECTIVE_RULES["capture-specimen"].phaseStep,
      RESCUE_CIVILIANS_OBJECTIVE.phaseStep,
    ]);
    const extra = (): never => {
      throw new Error("not run");
    };
    expect(
      objectivePhaseSteps({
        ...OBJECTIVE_RULES,
        "destroy-spawner": { ...DESTROY_SPAWNER_OBJECTIVE, phaseStep: extra },
      }),
    ).toEqual([
      extra,
      DEFEND_GENERATORS_OBJECTIVE.phaseStep,
      OBJECTIVE_RULES["capture-specimen"].phaseStep,
      RESCUE_CIVILIANS_OBJECTIVE.phaseStep,
    ]);
  });
});
