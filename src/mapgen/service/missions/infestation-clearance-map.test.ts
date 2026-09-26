import { describe, expect, it } from "vitest";

import { INFESTATION_CLEARANCE } from "../../../content/data/mission-types";
import type { Mission } from "../../../overworld/model/mission";
import { INFESTATION_CLEARANCE_MAP_RULE } from "./infestation-clearance-map";

const MISSION: Mission = {
  id: "mission-1",
  typeId: "infestation-clearance",
  cityId: "city-1",
  difficulty: 5,
  mapParams: {
    biome: "temperate",
    settlement: "town",
    size: "small",
    seed: "seed",
    techCarcass: { techPoints: 12 },
  },
  rewards: { credits: 0, techPoints: 0 },
  createdDay: 0,
  expiresDay: 3,
  ignorePenalty: 0,
};

describe("INFESTATION_CLEARANCE_MAP_RULE", () => {
  it("fights in the settlement with nothing beyond the type's own hooks", () => {
    expect(
      INFESTATION_CLEARANCE_MAP_RULE.recipe(MISSION, INFESTATION_CLEARANCE),
    ).toEqual({ archetype: "settlement", extraHooks: [] });
  });
});
