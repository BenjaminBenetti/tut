import { describe, expect, it } from "vitest";

import { damageResistanceText } from "./damage-resistance-text";

describe("damageResistanceText (campaign arc §10.2)", () => {
  it("names each resisted tag with its points, in the fixed tag order", () => {
    expect(damageResistanceText({ acid: 3 })).toEqual(["acid resist 3"]);
    expect(damageResistanceText({ spine: 3, acid: 2 })).toEqual([
      "acid resist 2",
      "spine resist 3",
    ]);
  });

  it("says nothing for no resistance, or a tag resisted by nothing", () => {
    expect(damageResistanceText(undefined)).toEqual([]);
    expect(damageResistanceText({})).toEqual([]);
    expect(damageResistanceText({ acid: 0 })).toEqual([]);
  });
});
