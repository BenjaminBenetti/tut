import { describe, expect, it } from "vitest";

import { SPAWNER_MODELS } from "../data/spawner-models";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { spawnerModelId } from "./spawner-model-resolver";

describe("spawnerModelId (#1179)", () => {
  it("draws an egg spawner as one, ripe or not, and one saved without a variant too", () => {
    expect(spawnerModelId({}, false, SPAWNER_MODELS)).toBe("bug.egg-spawner");
    expect(
      spawnerModelId({ variant: "egg-spawner" }, true, SPAWNER_MODELS),
    ).toBe("bug.egg-spawner");
  });

  it("draws a spore pod closed, and split open once ripe", () => {
    expect(
      spawnerModelId({ variant: "spore-pod" }, false, SPAWNER_MODELS),
    ).toBe("bug.spore-pod");
    expect(spawnerModelId({ variant: "spore-pod" }, true, SPAWNER_MODELS)).toBe(
      "bug.spore-pod-mature",
    );
  });

  it("draws a hive core whole, and broken once below half its hit points", () => {
    const core = (hp: number, maxHp?: number) =>
      spawnerModelId(
        { variant: "hive-core", hp, ...(maxHp === undefined ? {} : { maxHp }) },
        false,
        SPAWNER_MODELS,
      );

    expect(core(90, 90)).toBe("bug.hive-core");
    expect(core(45, 90)).toBe("bug.hive-core");
    expect(core(44, 90)).toBe("bug.hive-core-damaged");
    expect(core(1, 90)).toBe("bug.hive-core-damaged");
    // A core that does not know its full health is never drawn broken.
    expect(core(1)).toBe("bug.hive-core");
  });

  it("never draws a variant without a damaged model as damaged", () => {
    expect(
      spawnerModelId(
        { variant: "spore-pod", hp: 1, maxHp: 40 },
        false,
        SPAWNER_MODELS,
      ),
    ).toBe("bug.spore-pod");
  });

  it("names only registered models, the hive core's 3×3", () => {
    for (const models of Object.values(SPAWNER_MODELS)) {
      expect(MODEL_MANIFEST[models.standing]).toBeDefined();
      for (const other of [models.ripe, models.damaged]) {
        if (other !== undefined) {
          expect(MODEL_MANIFEST[other]).toBeDefined();
        }
      }
    }
    expect(MODEL_MANIFEST["bug.hive-core"].footprint).toEqual({ w: 3, d: 3 });
    expect(MODEL_MANIFEST["bug.hive-core-damaged"].footprint).toEqual({
      w: 3,
      d: 3,
    });
  });
});
