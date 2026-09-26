import { describe, expect, it } from "vitest";

import { DEFEND_INSTALLATION } from "../../../content/data/mission-types";
import type { Mission } from "../../../overworld/model/mission";
import { HookKinds } from "../../model/hook";
import { DEFEND_INSTALLATION_MAP_RULE } from "./defend-installation-map";

/** A defence offer, with or without its `defence` payload. */
function defence(withPayload: boolean): Mission {
  return {
    id: "mission-1",
    typeId: "defend-installation",
    cityId: "city-1",
    difficulty: 5,
    mapParams: {
      biome: "temperate",
      settlement: "town",
      size: "medium",
      seed: "seed",
    },
    ...(withPayload
      ? {
          defence: {
            installation: "repellent-dispersal",
            deployableId: "dep-1",
            generators: 3,
            waves: 4,
          },
        }
      : {}),
    rewards: { credits: 0, techPoints: 0 },
    createdDay: 0,
    expiresDay: 3,
    ignorePenalty: 0,
  };
}

describe("DEFEND_INSTALLATION_MAP_RULE", () => {
  it("reserves the installation's site and asks for one hook per generator", () => {
    expect(
      DEFEND_INSTALLATION_MAP_RULE.recipe(defence(true), DEFEND_INSTALLATION),
    ).toEqual({
      archetype: "settlement",
      extraHooks: [{ kind: HookKinds.GENERATOR, count: 3 }],
      site: "repellent-dispersal",
    });
  });

  it("raises the compound a story facility borrows: the tracking array stands in the sensor array's yard", () => {
    const uplink = defence(true);
    expect(
      DEFEND_INSTALLATION_MAP_RULE.recipe(
        {
          ...uplink,
          defence: {
            installation: "tracking-array",
            generators: 2,
            waves: 5,
          },
        },
        DEFEND_INSTALLATION,
      ),
    ).toEqual({
      archetype: "settlement",
      extraHooks: [{ kind: HookKinds.GENERATOR, count: 2 }],
      site: "sensor-array",
    });
  });

  it("falls back to a plain settlement for an offer without a defence", () => {
    expect(
      DEFEND_INSTALLATION_MAP_RULE.recipe(defence(false), DEFEND_INSTALLATION),
    ).toEqual({ archetype: "settlement", extraHooks: [] });
  });
});
