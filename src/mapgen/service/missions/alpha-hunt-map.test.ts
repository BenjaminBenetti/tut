import { describe, expect, it } from "vitest";

import { ALPHA_HUNT } from "../../../content/data/mission-types";
import type { Mission } from "../../../overworld/model/mission";
import { ALPHA_HUNT_MAP_RULE } from "./alpha-hunt-map";
import { MISSION_MAP_RULES } from "./mission-map-rules";

const MISSION: Mission = {
  id: "mission-1",
  typeId: "alpha-hunt",
  cityId: "city-1",
  difficulty: 5,
  mapParams: {
    biome: "temperate",
    settlement: "town",
    size: "medium",
    seed: "seed",
  },
  rewards: { credits: 0, techPoints: 0 },
  createdDay: 0,
  expiresDay: 3,
  ignorePenalty: 0,
  alphaHunt: { name: "Old Scald", scars: 0 },
};

describe("ALPHA_HUNT_MAP_RULE", () => {
  it("hunts through the settlement with nothing beyond the type's own hooks", () => {
    expect(MISSION_MAP_RULES["alpha-hunt"]).toBe(ALPHA_HUNT_MAP_RULE);
    expect(ALPHA_HUNT_MAP_RULE.recipe(MISSION, ALPHA_HUNT)).toEqual({
      archetype: "settlement",
      extraHooks: [],
    });
  });
});
