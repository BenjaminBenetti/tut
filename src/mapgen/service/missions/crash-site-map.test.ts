import { describe, expect, it } from "vitest";

import { CRASH_SITE } from "../../../content/data/mission-types";
import type { Mission } from "../../../overworld/model/mission";
import { CRASH_SITE_MAP_RULE } from "./crash-site-map";
import { GREAT_POD_MAP_RULE } from "./great-pod-map";
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
  it("is the crash site's entry in the shipped table, behind the story decorator", () => {
    const entry = MISSION_MAP_RULES["crash-site"];
    expect(entry.typeId).toBe("crash-site");
    expect(CRASH_SITE_MAP_RULE.typeId).toBe("crash-site");
    // An ordinary offer is planned exactly as the type's own rule plans it.
    expect(entry.recipe(MISSION, CRASH_SITE)).toEqual(
      CRASH_SITE_MAP_RULE.recipe(MISSION, CRASH_SITE),
    );
  });

  it("fights a drawn crash site in the crater with nothing beyond the type's own hooks", () => {
    expect(CRASH_SITE_MAP_RULE.recipe(MISSION, CRASH_SITE)).toEqual({
      archetype: "crash-site",
      extraHooks: [],
    });
    // A story crash site with no map of its own places its pod as any other.
    expect(
      MISSION_MAP_RULES["crash-site"].recipe(
        { ...MISSION, storyId: "intact-pod" },
        CRASH_SITE,
      ),
    ).toEqual({ archetype: "crash-site", extraHooks: [] });
  });

  it("sends First Skyfall to the great pod (#1238)", () => {
    const skyfall = { ...MISSION, storyId: "first-skyfall", pinned: true } as const;
    expect(MISSION_MAP_RULES["crash-site"].recipe(skyfall, CRASH_SITE)).toEqual(
      GREAT_POD_MAP_RULE.recipe(skyfall, CRASH_SITE),
    );
    expect(
      MISSION_MAP_RULES["crash-site"].recipe(skyfall, CRASH_SITE).archetype,
    ).toBe("great-pod");
  });
});
