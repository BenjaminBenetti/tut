import { describe, expect, it } from "vitest";

import {
  DEPLOYABLE_EFFECT_KEYS,
  DEPLOYABLE_TYPE_IDS,
  isDeployableTypeId,
} from "./deployable-type";

describe("DeployableTypeId", () => {
  it("lists each id once", () => {
    expect(new Set(DEPLOYABLE_TYPE_IDS).size).toBe(DEPLOYABLE_TYPE_IDS.length);
  });

  it("narrows known ids and rejects unknown strings", () => {
    for (const id of DEPLOYABLE_TYPE_IDS) {
      expect(isDeployableTypeId(id)).toBe(true);
    }
    expect(isDeployableTypeId("")).toBe(false);
    expect(isDeployableTypeId("orbital-laser")).toBe(false);
    expect(isDeployableTypeId("Defensive-Battery")).toBe(false);
  });
});

describe("DeployableEffect keys", () => {
  it("lists each key once", () => {
    expect(new Set(DEPLOYABLE_EFFECT_KEYS).size).toBe(
      DEPLOYABLE_EFFECT_KEYS.length,
    );
  });
});
