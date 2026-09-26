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

  it("names only registered models", () => {
    for (const models of Object.values(SPAWNER_MODELS)) {
      expect(MODEL_MANIFEST[models.standing]).toBeDefined();
      if (models.ripe !== undefined) {
        expect(MODEL_MANIFEST[models.ripe]).toBeDefined();
      }
    }
  });
});
