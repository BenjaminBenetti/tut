import { describe, expect, it } from "vitest";

import { PERSONA_IDS } from "../../content/model/persona-id";
import { ALPHA, BROODMOTHER, PERSONAS } from "../data/personas";
import { createPersonaLookup, personaName } from "./persona-lookup";

describe("createPersonaLookup", () => {
  it("resolves every shipped persona to its definition", () => {
    const personaOf = createPersonaLookup(PERSONAS);
    for (const id of PERSONA_IDS) {
      expect(personaOf(id)).toBe(PERSONAS[id]);
    }
  });

  it("resolves an id outside the union, or a prototype key, to nothing", () => {
    const personaOf = createPersonaLookup(PERSONAS);
    expect(personaOf("queen-of-the-future")).toBeUndefined();
    expect(personaOf("toString")).toBeUndefined();
    expect(personaOf("")).toBeUndefined();
  });
});

describe("personaName", () => {
  it("names a one-of-a-kind enemy by its display name alone", () => {
    expect(personaName(BROODMOTHER, "Swarmer")).toBe("Broodmother");
  });

  it("names a persona that carries its species with the species after it", () => {
    expect(personaName(ALPHA, "Lurker")).toBe("Alpha Lurker");
  });

  it("falls back to the display name when the species is unknown", () => {
    expect(personaName(ALPHA, undefined)).toBe("Alpha");
  });
});
