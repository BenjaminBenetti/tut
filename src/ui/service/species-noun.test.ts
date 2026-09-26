import { describe, expect, it } from "vitest";

import { BUG_SPECIES } from "../../bugs/data/species";
import { BUG_SPECIES_IDS } from "../../content/model/bug-species-id";
import { speciesNoun, type SpeciesNames } from "./species-noun";

describe("speciesNoun (#1179)", () => {
  it("leaves the base species reading as they always have", () => {
    expect(speciesNoun("swarmer")).toBe("swarmer");
    expect(speciesNoun("lurker")).toBe("lurker");
    expect(speciesNoun("brute")).toBe("brute");
  });

  it("names an armoured variant adjective first, as a player says it", () => {
    expect(speciesNoun("swarmer-armoured")).toBe("armoured swarmer");
    expect(speciesNoun("lurker-armoured")).toBe("armoured lurker");
    expect(speciesNoun("brute-armoured")).toBe("armoured brute");
  });

  it("never prints an id: no species reads with a hyphen", () => {
    for (const id of BUG_SPECIES_IDS) {
      expect(speciesNoun(id)).toBe(BUG_SPECIES[id].name.toLowerCase());
      expect(speciesNoun(id)).not.toContain("-");
    }
  });

  it("reads the name from the table it is given", () => {
    const renamed: SpeciesNames = {
      ...BUG_SPECIES,
      "lurker-armoured": { name: "Plated Stalker" },
    };
    expect(speciesNoun("lurker-armoured", renamed)).toBe("plated stalker");
  });
});
