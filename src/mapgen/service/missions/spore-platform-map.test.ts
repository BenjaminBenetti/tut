import { describe, expect, it } from "vitest";

import { SPORE_PLATFORM } from "../../../content/data/mission-types";
import type { Mission } from "../../../overworld/model/mission";
import {
  SPORE_PLATFORM_CORE_HOOKS,
  SPORE_PLATFORM_CORE_SIZE,
  SPORE_PLATFORM_HULL_HOOKS,
  SPORE_PLATFORM_HULL_SIZE,
} from "../../data/spore-platform-recipe";
import { missionToMapRecipe } from "../mission-map-recipe-adapter";
import { mapRulesForStage } from "../mission-stage-map-rules";
import { MISSION_MAP_RULES } from "./mission-map-rules";
import { SPORE_PLATFORM_MAP_RULE } from "./spore-platform-map";

// ===========================================
// Fixtures
// ===========================================

/** The pinned finale offer, as the story rule makes it. */
const MISSION: Mission = {
  id: "mission-9",
  typeId: "spore-platform",
  cityId: "city-1",
  difficulty: 10,
  mapParams: {
    biome: "snowy",
    settlement: "city",
    size: "large",
    seed: "platform",
    infestation: 2,
  },
  rewards: { credits: 0, techPoints: 0 },
  createdDay: 40,
  expiresDay: 45,
  ignorePenalty: 0,
  pinned: true,
  storyId: "spore-platform",
  act: "finale",
};

// ===========================================
// Tests
// ===========================================

describe("SPORE_PLATFORM_MAP_RULE", () => {
  it("is the platform's entry in the shipped table", () => {
    expect(MISSION_MAP_RULES["spore-platform"]).toBe(SPORE_PLATFORM_MAP_RULE);
    expect(SPORE_PLATFORM_MAP_RULE.typeId).toBe("spore-platform");
  });

  it("plans the hull for stage 0 and for a read that names no stage", () => {
    const hull = {
      archetype: "spore-platform-hull",
      extraHooks: [],
      size: SPORE_PLATFORM_HULL_SIZE,
      hooks: SPORE_PLATFORM_HULL_HOOKS,
    };
    expect(SPORE_PLATFORM_MAP_RULE.recipe(MISSION, SPORE_PLATFORM)).toEqual(
      hull,
    );
    expect(SPORE_PLATFORM_MAP_RULE.recipe(MISSION, SPORE_PLATFORM, 0)).toEqual(
      hull,
    );
  });

  it("plans the core chamber for stage 1, and for any stage past it", () => {
    const core = {
      archetype: "spore-platform-core",
      extraHooks: [],
      size: SPORE_PLATFORM_CORE_SIZE,
      hooks: SPORE_PLATFORM_CORE_HOOKS,
    };
    expect(SPORE_PLATFORM_MAP_RULE.recipe(MISSION, SPORE_PLATFORM, 1)).toEqual(
      core,
    );
    expect(SPORE_PLATFORM_MAP_RULE.recipe(MISSION, SPORE_PLATFORM, 5)).toEqual(
      core,
    );
  });

  it("becomes each stage's recipe through the adapter: the board and hooks are the stage's own", () => {
    const hull = missionToMapRecipe(MISSION, SPORE_PLATFORM);
    const core = missionToMapRecipe(
      MISSION,
      SPORE_PLATFORM,
      undefined,
      mapRulesForStage(MISSION_MAP_RULES, 1),
    );
    if (!hull.ok || !core.ok) {
      throw new Error("the platform's recipes should build");
    }
    expect(hull.value.params.archetype).toBe("spore-platform-hull");
    expect(hull.value.params.size).toEqual(SPORE_PLATFORM_HULL_SIZE);
    expect(hull.value.params.hooks).toEqual(SPORE_PLATFORM_HULL_HOOKS);
    expect(core.value.params.archetype).toBe("spore-platform-core");
    expect(core.value.params.size).toEqual(SPORE_PLATFORM_CORE_SIZE);
    expect(core.value.params.hooks).toEqual(SPORE_PLATFORM_CORE_HOOKS);
    // One offer, one seed: the stage's own map seed is the start's business.
    expect(core.value.seed).toBe(hull.value.seed);
  });
});
