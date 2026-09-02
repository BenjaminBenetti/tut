import { describe, expect, it } from "vitest";

import { SQUAD_TYPES } from "../data/squad-types";
import type { SquadType } from "../model/squad-type";
import { DataSquadTypeCatalogue } from "./squad-type-catalogue";

const fixture = (id: string, rating = 1): SquadType => ({
  id,
  name: id,
  hireCost: 100,
  reinforceCostPerSoldier: 10,
  combatRating: rating,
  description: "fixture",
});

describe("DataSquadTypeCatalogue", () => {
  it("looks up types by id and reports unknown ids as undefined", () => {
    const catalogue = new DataSquadTypeCatalogue(SQUAD_TYPES);
    expect(catalogue.getSquadType("rifle")?.name).toBe("Rifle Squad");
    expect(catalogue.getSquadType("cavalry")).toBeUndefined();
  });

  it("lists types in the order supplied", () => {
    const types = [fixture("b"), fixture("a"), fixture("c")];
    const catalogue = new DataSquadTypeCatalogue(types);
    expect(catalogue.listSquadTypes().map((t) => t.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("is not affected by later changes to the source array", () => {
    const types = [fixture("a")];
    const catalogue = new DataSquadTypeCatalogue(types);
    types.push(fixture("b"));
    expect(catalogue.listSquadTypes()).toHaveLength(1);
    expect(catalogue.getSquadType("b")).toBeUndefined();
  });

  it("rejects duplicate ids at construction", () => {
    expect(
      () => new DataSquadTypeCatalogue([fixture("a"), fixture("a", 2)]),
    ).toThrow(/Duplicate squad type id "a"/);
  });

  it("indexes the shipped catalogue completely", () => {
    const catalogue = new DataSquadTypeCatalogue(SQUAD_TYPES);
    for (const type of SQUAD_TYPES) {
      expect(catalogue.getSquadType(type.id)).toBe(type);
    }
    expect(catalogue.listSquadTypes()).toEqual(SQUAD_TYPES);
  });
});
