import { describe, expect, it } from "vitest";

import { MISSION_TYPE_IDS } from "../../../content/model/mission-type-id";
import { MISSION_CONSEQUENCE_RULES } from "./mission-consequence-rules";

describe("MISSION_CONSEQUENCE_RULES", () => {
  it("has one rule per mission type, keyed by its own type", () => {
    expect(Object.keys(MISSION_CONSEQUENCE_RULES).sort()).toEqual(
      [...MISSION_TYPE_IDS].sort(),
    );
    for (const typeId of MISSION_TYPE_IDS) {
      expect(MISSION_CONSEQUENCE_RULES[typeId].typeId).toBe(typeId);
    }
  });
});
