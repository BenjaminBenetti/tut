import { describe, expect, it } from "vitest";

import {
  DEPLOYABLE_LEVELS,
  isDeployableLevel,
  MAX_DEPLOYABLE_LEVEL,
  MIN_DEPLOYABLE_LEVEL,
  nextDeployableLevel,
} from "./deployable-level";

describe("deployable levels", () => {
  it("runs from 1 to 3 in order", () => {
    expect(DEPLOYABLE_LEVELS).toEqual([1, 2, 3]);
    expect(MIN_DEPLOYABLE_LEVEL).toBe(1);
    expect(MAX_DEPLOYABLE_LEVEL).toBe(3);
  });

  it("recognises exactly the three levels", () => {
    for (const level of DEPLOYABLE_LEVELS) {
      expect(isDeployableLevel(level)).toBe(true);
    }
    for (const bad of [0, 4, 1.5, -1, "1", null, undefined, Number.NaN]) {
      expect(isDeployableLevel(bad), String(bad)).toBe(false);
    }
  });

  it("steps to the next level and stops at the top", () => {
    expect(nextDeployableLevel(1)).toBe(2);
    expect(nextDeployableLevel(2)).toBe(3);
    expect(nextDeployableLevel(3)).toBeUndefined();
  });
});
