import { describe, expect, it } from "vitest";

import { CRASH_SITE } from "../../../content/data/mission-types";
import type { Mission } from "../../../overworld/model/mission";
import { HookKinds } from "../../model/hook";
import { CRASH_SITE_MAP_RULE, SCRIPTED_POD_PLACEMENT } from "./crash-site-map";
import { MISSION_MAP_RULES } from "./mission-map-rules";

// ===========================================
// Fixtures
// ===========================================

/** A crash-site offer at d1, with nothing story-specific on it. */
const MISSION: Mission = {
  id: "mission-1",
  typeId: "crash-site",
  cityId: "city-1",
  difficulty: 1,
  mapParams: {
    biome: "temperate",
    settlement: "rural",
    size: "small",
    seed: "seed",
    infestation: 1,
  },
  rewards: { credits: 300, techPoints: 17 },
  createdDay: 0,
  expiresDay: 4,
  ignorePenalty: 15,
  crashSite: { landingCityId: "city-1", preLandingInfestation: 0 },
};

// ===========================================
// Tests
// ===========================================

describe("CRASH_SITE_MAP_RULE", () => {
  it("is the crash site's entry in the shipped table", () => {
    expect(MISSION_MAP_RULES["crash-site"]).toBe(CRASH_SITE_MAP_RULE);
    expect(CRASH_SITE_MAP_RULE.typeId).toBe("crash-site");
  });

  it("fights a drawn crash site in the crater with nothing beyond the type's own hooks", () => {
    expect(CRASH_SITE_MAP_RULE.recipe(MISSION, CRASH_SITE)).toEqual({
      archetype: "crash-site",
      extraHooks: [],
    });
    // A story crash site that is not First Skyfall places its pod as any other.
    expect(
      CRASH_SITE_MAP_RULE.recipe(
        { ...MISSION, storyId: "intact-pod" },
        CRASH_SITE,
      ),
    ).toEqual({ archetype: "crash-site", extraHooks: [] });
  });

  it("brings First Skyfall's pod in close to the drop zone (arc §6.9)", () => {
    expect(SCRIPTED_POD_PLACEMENT).toEqual({
      minDistanceFromDeploy: 6,
      maxNearestDistanceFromDeploy: 14,
    });
    expect(
      CRASH_SITE_MAP_RULE.recipe(
        { ...MISSION, storyId: "first-skyfall", pinned: true },
        CRASH_SITE,
      ),
    ).toEqual({
      archetype: "crash-site",
      extraHooks: [],
      hookPlacement: { [HookKinds.SPORE_POD]: SCRIPTED_POD_PLACEMENT },
    });
  });
});
