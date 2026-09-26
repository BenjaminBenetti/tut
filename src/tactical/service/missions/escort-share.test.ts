import { describe, expect, it } from "vitest";

import type { SpeciesMix } from "../../../bugs/model/species-mix";
import { withEscortShare } from "./escort-share";

/** A finale-like mix over three species, summing to 1. */
const MIX: SpeciesMix = { swarmer: 0.5, lurker: 0.3, brute: 0.2 };

/** Sum of a mix's weights. */
function total(mix: SpeciesMix | undefined): number {
  return Object.values(mix ?? {}).reduce((sum, weight) => sum + weight, 0);
}

describe("withEscortShare", () => {
  it("gives the escort its share in equal parts and scales the rest", () => {
    const mixed = withEscortShare(
      MIX,
      ["swarmer-armoured", "lurker-armoured"],
      0.15,
    );
    expect(mixed?.swarmer).toBeCloseTo(0.425);
    expect(mixed?.lurker).toBeCloseTo(0.255);
    expect(mixed?.brute).toBeCloseTo(0.17);
    expect(mixed?.["swarmer-armoured"]).toBeCloseTo(0.075);
    expect(mixed?.["lurker-armoured"]).toBeCloseTo(0.075);
    expect(total(mixed)).toBeCloseTo(1);
  });

  it("adds the escort's part to a species already in the mix", () => {
    const mixed = withEscortShare(MIX, ["swarmer"], 0.15);
    expect(mixed?.swarmer).toBeCloseTo(0.5 * 0.85 + 0.15);
    expect(total(mixed)).toBeCloseTo(1);
  });

  it("leaves the mix alone with no mix, no escort or no share", () => {
    expect(withEscortShare(undefined, ["swarmer"], 0.15)).toBeUndefined();
    expect(withEscortShare(MIX, [], 0.15)).toBe(MIX);
    expect(withEscortShare(MIX, ["swarmer"], 0)).toBe(MIX);
  });

  it("clamps a share outside [0, 1]", () => {
    const all = withEscortShare(MIX, ["brute-armoured"], 2);
    expect(all?.["brute-armoured"]).toBeCloseTo(1);
    expect(all?.swarmer).toBeCloseTo(0);
    expect(withEscortShare(MIX, ["brute-armoured"], -1)).toBe(MIX);
  });
});
