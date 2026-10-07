import { describe, expect, it } from "vitest";

import { CRASH_SITE } from "../../../content/data/mission-types";
import type { Mission } from "../../../overworld/model/mission";
import type { MissionMapRule } from "../../model/mission-map-rule";
import { GREAT_POD_MAP_RULE } from "./great-pod-map";
import { STORY_MAP_RULES, withStoryMaps } from "./story-map-rules";

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
  },
  rewards: { credits: 300, techPoints: 17 },
  createdDay: 0,
  expiresDay: 4,
  ignorePenalty: 15,
  crashSite: { landingCityId: "city-1", preLandingInfestation: 0 },
};

/** A rule of `typeId` that plans `archetype`, so a test can tell who planned. */
function rule(
  typeId: MissionMapRule["typeId"],
  archetype: "crash-site" | "great-pod" | "settlement",
): MissionMapRule {
  return {
    typeId,
    /** A plan naming the archetype. */
    recipe() {
      return { archetype, extraHooks: [] };
    },
  };
}

// ===========================================
// Tests
// ===========================================

describe("withStoryMaps", () => {
  const ordinary = rule("crash-site", "crash-site");

  it("keeps the type's id", () => {
    expect(withStoryMaps(ordinary, {}).typeId).toBe("crash-site");
  });

  it("plans an offer without a story as the type's own rule does", () => {
    const decorated = withStoryMaps(ordinary, {
      "first-skyfall": rule("crash-site", "great-pod"),
    });
    expect(decorated.recipe(MISSION, CRASH_SITE).archetype).toBe("crash-site");
  });

  it("sends a story with a rule of the same type to that rule", () => {
    const decorated = withStoryMaps(ordinary, {
      "first-skyfall": rule("crash-site", "great-pod"),
    });
    expect(
      decorated.recipe({ ...MISSION, storyId: "first-skyfall" }, CRASH_SITE)
        .archetype,
    ).toBe("great-pod");
    // A story with no entry keeps the type's map.
    expect(
      decorated.recipe({ ...MISSION, storyId: "intact-pod" }, CRASH_SITE)
        .archetype,
    ).toBe("crash-site");
  });

  it("ignores a story rule of another type", () => {
    const decorated = withStoryMaps(ordinary, {
      "first-skyfall": rule("hive-assault", "settlement"),
    });
    expect(
      decorated.recipe({ ...MISSION, storyId: "first-skyfall" }, CRASH_SITE)
        .archetype,
    ).toBe("crash-site");
  });
});

describe("STORY_MAP_RULES", () => {
  it("gives First Skyfall the great pod and no other story a map of its own (#1238)", () => {
    expect(STORY_MAP_RULES).toEqual({ "first-skyfall": GREAT_POD_MAP_RULE });
    expect(GREAT_POD_MAP_RULE.typeId).toBe("crash-site");
  });
});
