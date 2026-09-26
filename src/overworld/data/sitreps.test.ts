import { describe, expect, it } from "vitest";

import { SITREP_IDS } from "../../content/model/sitrep-id";
import { FIRST_SITREP_MISSION, SITREPS } from "./sitreps";

describe("SITREPS", () => {
  it("keys every definition by its own id", () => {
    for (const id of SITREP_IDS) {
      expect(SITREPS[id].id).toBe(id);
    }
  });

  it("debuts all five Act I sitreps at mission 10 (arc §3, §11)", () => {
    expect(FIRST_SITREP_MISSION).toBe(10);
    for (const id of SITREP_IDS) {
      expect(SITREPS[id].debutMission).toBe(FIRST_SITREP_MISSION);
    }
  });

  it("gives every sitrep a positive weight", () => {
    for (const id of SITREP_IDS) {
      expect(SITREPS[id].weight).toBeGreaterThan(0);
    }
  });

  it("marks exactly Salvage Rich and Local Guides as helping the player", () => {
    const helping = SITREP_IDS.filter((id) => SITREPS[id].helpsPlayer);
    expect(helping).toEqual(["salvage-rich", "local-guides"]);
  });
});
