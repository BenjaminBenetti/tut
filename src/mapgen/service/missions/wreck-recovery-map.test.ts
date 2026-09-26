import { describe, expect, it } from "vitest";

import { WRECK_RECOVERY } from "../../../content/data/mission-types";
import type { Mission } from "../../../overworld/model/mission";
import { STARTER_LOADOUT } from "../../../roster/data/starter-roster";
import { HookKinds } from "../../model/hook";
import { missionToMapRecipe } from "../mission-map-recipe-adapter";
import { MISSION_MAP_RULES } from "./mission-map-rules";
import {
  MECH_WRECK_FOOTPRINT,
  WRECK_RECOVERY_MAP_RULE,
} from "./wreck-recovery-map";

/** A wreck recovery offer, with or without its wreck payload. */
function recovery(withWreck: boolean): Mission {
  return {
    id: "mission-1",
    typeId: "wreck-recovery",
    cityId: "city-1",
    difficulty: 4,
    mapParams: {
      biome: "temperate",
      settlement: "town",
      size: "small",
      seed: "seed",
    },
    ...(withWreck
      ? {
          wreck: {
            mechId: "mech-1",
            mechName: "Hammerhead",
            chassisId: STARTER_LOADOUT.chassisId,
            parts: [STARTER_LOADOUT.legsId],
            loadout: STARTER_LOADOUT,
            cityId: "city-1",
            missionId: "mission-0",
            lostDay: 3,
            stripTurns: 2,
          },
        }
      : {}),
    rewards: { credits: 0, techPoints: 0 },
    createdDay: 4,
    expiresDay: 7,
    ignorePenalty: 0,
  };
}

describe("WRECK_RECOVERY_MAP_RULE", () => {
  it("is the table's rule for the wreck type", () => {
    expect(MISSION_MAP_RULES["wreck-recovery"]).toBe(WRECK_RECOVERY_MAP_RULE);
  });

  it("asks the settlement pipeline for one wreck the size of a mech chassis", () => {
    expect(
      WRECK_RECOVERY_MAP_RULE.recipe(recovery(true), WRECK_RECOVERY),
    ).toEqual({
      archetype: "settlement",
      extraHooks: [{ kind: HookKinds.WRECK, count: 1, meta: { footprint: 3 } }],
    });
    expect(MECH_WRECK_FOOTPRINT).toBe(3);
  });

  it("still asks for a mech-sized wreck when the offer lost its payload", () => {
    expect(
      WRECK_RECOVERY_MAP_RULE.recipe(recovery(false), WRECK_RECOVERY)
        .extraHooks,
    ).toEqual([{ kind: HookKinds.WRECK, count: 1, meta: { footprint: 3 } }]);
  });

  it("reaches the recipe as an infantry hook, with the type's modest threat", () => {
    const recipe = missionToMapRecipe(recovery(true), WRECK_RECOVERY);
    expect(recipe.ok).toBe(true);
    if (!recipe.ok) return;
    const hooks = recipe.value.params.hooks;
    const wreck = hooks.find((hook) => hook.kind === HookKinds.WRECK);
    expect(wreck).toMatchObject({
      count: 1,
      requiredPass: 1,
      maxNearestDistanceFromDeploy: 30,
      meta: { footprint: 3 },
    });
    expect(
      hooks.find((hook) => hook.kind === HookKinds.EGG_SPAWNER)?.count,
    ).toBe(1);
  });
});
