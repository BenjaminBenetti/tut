import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import type { Mission } from "../../overworld/model/mission";
import type { MissionMapRules } from "../model/mission-map-rule";
import { mapRulesForStage } from "./mission-stage-map-rules";
import { MISSION_MAP_RULES } from "./missions/mission-map-rules";

// ===========================================
// Fixtures
// ===========================================

/** The shipped rules with the clearance's answering by stage. */
const STAGED: MissionMapRules = {
  ...MISSION_MAP_RULES,
  "infestation-clearance": {
    typeId: "infestation-clearance",
    /** Stage 0 a city block; any later stage the hive cavern. */
    recipe: (_mission, _type, stage) => ({
      archetype: (stage ?? 0) === 0 ? "settlement" : "hive-cavern",
      extraHooks: [],
    }),
  },
};

const MISSION = { typeId: "infestation-clearance" } as Mission;

// ===========================================
// Tests
// ===========================================

describe("mapRulesForStage", () => {
  it("hands stage 0 the rules exactly as given", () => {
    expect(mapRulesForStage(STAGED, 0)).toBe(STAGED);
  });

  it("asks every rule for the bound stage's plan", () => {
    const type = MISSION_TYPES["infestation-clearance"];
    expect(
      STAGED["infestation-clearance"].recipe(MISSION, type).archetype,
    ).toBe("settlement");
    const bound = mapRulesForStage(STAGED, 1);
    expect(bound["infestation-clearance"].recipe(MISSION, type).archetype).toBe(
      "hive-cavern",
    );
    expect(Object.keys(bound)).toEqual(Object.keys(STAGED));
    for (const [typeId, rule] of Object.entries(bound)) {
      expect(rule.typeId).toBe(typeId);
    }
  });
});
