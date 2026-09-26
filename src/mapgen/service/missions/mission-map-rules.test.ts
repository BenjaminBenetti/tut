import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../../content/data/mission-types";
import { MISSION_TYPE_IDS } from "../../../content/model/mission-type-id";
import type { Mission } from "../../../overworld/model/mission";
import { MISSION_MAP_RULES } from "./mission-map-rules";

/** A minimal offer of the type, with nothing type-specific on it. */
function offer(typeId: Mission["typeId"]): Mission {
  return {
    id: "mission-1",
    typeId,
    cityId: "city-1",
    difficulty: 3,
    mapParams: {
      biome: "temperate",
      settlement: "town",
      size: "small",
      seed: "seed",
    },
    rewards: { credits: 0, techPoints: 0 },
    createdDay: 0,
    expiresDay: 3,
    ignorePenalty: 0,
  };
}

describe("MISSION_MAP_RULES", () => {
  it("has one rule per mission type, filed under its own id", () => {
    expect(Object.keys(MISSION_MAP_RULES).sort()).toEqual(
      [...MISSION_TYPE_IDS].sort(),
    );
    for (const typeId of MISSION_TYPE_IDS) {
      expect(MISSION_MAP_RULES[typeId].typeId).toBe(typeId);
    }
  });

  it("gives every rule a plan the recipe can serialise", () => {
    for (const typeId of MISSION_TYPE_IDS) {
      const plan = MISSION_MAP_RULES[typeId].recipe(
        offer(typeId),
        MISSION_TYPES[typeId],
      );
      expect(JSON.parse(JSON.stringify(plan)), typeId).toEqual(plan);
    }
  });
});
