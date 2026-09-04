import { describe, expect, it } from "vitest";

import { BUG_SPECIES } from "../data/species";
import { createSpeciesLookup } from "./species-lookup";

describe("createSpeciesLookup", () => {
  it("resolves a shipped species id and nothing else", () => {
    const speciesOf = createSpeciesLookup(BUG_SPECIES);
    expect(speciesOf("swarmer")).toBe(BUG_SPECIES.swarmer);
    expect(speciesOf("lurker")).toBe(BUG_SPECIES.lurker);
    expect(speciesOf("squad-1")).toBeUndefined();
    expect(speciesOf("toString")).toBeUndefined();
  });
});
