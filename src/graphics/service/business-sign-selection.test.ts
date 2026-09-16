import { describe, expect, it } from "vitest";
import type { Building } from "../../mapgen/model/building";
import { BUSINESS_NAMES } from "../data/business-names";
import type { BusinessFrontageKind } from "../model/building-frontage-style";
import { resolveBusinessSigns } from "./business-sign-selection";

const KINDS = Object.keys(BUSINESS_NAMES) as BusinessFrontageKind[];

/** A saved use identity is sufficient; visual names never depend on room or wall mutations. */
function business(kind: BusinessFrontageKind, ordinal: number): Building {
  return {
    id: `${kind}-${String(ordinal).padStart(3, "0")}`,
    kind:
      kind === "offices" ? "tower" : kind === "depot" ? "warehouse" : "shop",
    ...(kind === "offices" || kind === "depot" ? {} : { interiorStyle: kind }),
    footprint: [{ x: ordinal * 8, z: 0, w: 5, d: 5 }],
    groundLevel: 0,
    floors: [{ index: 0, y: 0, rooms: [] }],
    entrances: [{ tile: { x: ordinal * 8 + 2, y: 0, z: 4 }, side: "s" }],
    roof: { kind: "flat", walkable: false },
    connectorIds: [],
  };
}

describe("business sign names", () => {
  it.each(KINDS)("provides fifty distinct authored names for %s", (kind) => {
    const names = BUSINESS_NAMES[kind];
    expect(names).toHaveLength(50);
    expect(new Set(names.map((name) => name.trim().toLowerCase())).size).toBe(
      50,
    );
    expect(names.every((name) => name.trim().length > 0)).toBe(true);
  });

  it.each(KINDS)(
    "uses all fifty %s names before repeating and keeps usage balanced",
    (kind) => {
      const buildings = Array.from({ length: 125 }, (_, i) =>
        business(kind, i),
      );
      const selections = [
        ...resolveBusinessSigns(buildings, "high-street").values(),
      ];
      expect(selections).toHaveLength(buildings.length);
      expect(selections.every((sign) => sign.kind === kind)).toBe(true);
      expect(
        new Set(selections.slice(0, 50).map((sign) => sign.nameIndex)).size,
      ).toBe(50);
      expect(
        new Set(selections.slice(50, 100).map((sign) => sign.nameIndex)).size,
      ).toBe(50);
      const counts = Array<number>(50).fill(0);
      for (const sign of selections) counts[sign.nameIndex]!++;
      expect(Math.min(...counts)).toBe(2);
      expect(Math.max(...counts)).toBe(3);
    },
  );

  it("is deterministic across building iteration order without mutating the saved map", () => {
    const buildings = KINDS.flatMap((kind) =>
      Array.from({ length: 12 }, (_, i) => business(kind, i)),
    );
    const before = JSON.stringify(buildings);
    const first = resolveBusinessSigns(buildings, "market-district");
    expect(resolveBusinessSigns(buildings, "market-district")).toEqual(first);
    expect(
      resolveBusinessSigns([...buildings].reverse(), "market-district"),
    ).toEqual(first);
    expect(resolveBusinessSigns(buildings, "harbour-district")).not.toEqual(
      first,
    );
    expect(JSON.stringify(buildings)).toBe(before);
  });

  it("balances trades independently and keeps names through terrain or entrance changes", () => {
    const groceries = Array.from({ length: 30 }, (_, i) =>
      business("grocery", i),
    );
    const offices = Array.from({ length: 30 }, (_, i) =>
      business("offices", i),
    );
    const selections = resolveBusinessSigns(
      [...groceries, ...offices],
      "market-district",
    );
    for (const [id, appearance] of resolveBusinessSigns(
      groceries,
      "market-district",
    ))
      expect(selections.get(id)).toEqual(appearance);
    expect(
      resolveBusinessSigns(
        [...groceries, ...offices].map((building) => ({
          ...building,
          entrances: [],
          groundLevel: building.groundLevel + 2,
          floors: [],
          footprint: building.footprint.map((rect) => ({
            ...rect,
            x: rect.x + 100,
            z: rect.z + 100,
          })),
        })),
        "market-district",
      ),
    ).toEqual(selections);
  });

  it("takes the bag size from the authored catalogue", () => {
    const buildings = Array.from({ length: 7 }, (_, i) =>
      business("grocery", i),
    );
    const selections = [
      ...resolveBusinessSigns(buildings, "small-catalogue", {
        ...BUSINESS_NAMES,
        grocery: ["Peas Be With You", "Lettuce In", "Shelf Esteem"],
      }).values(),
    ];
    expect(
      new Set(selections.slice(0, 3).map((sign) => sign.nameIndex)).size,
    ).toBe(3);
    expect(
      new Set(selections.slice(3, 6).map((sign) => sign.nameIndex)).size,
    ).toBe(3);
    expect(
      selections.every((sign) => sign.nameIndex >= 0 && sign.nameIndex < 3),
    ).toBe(true);
    expect(
      resolveBusinessSigns(buildings, "empty-catalogue", {
        ...BUSINESS_NAMES,
        grocery: [],
      }).size,
    ).toBe(0);
  });

  it("leaves legacy, unknown and domestic identities on their original signs", () => {
    const original = business("grocery", 0);
    const buildings: Building[] = [
      { ...original, id: "legacy", interiorStyle: undefined },
      { ...original, id: "unknown", interiorStyle: "future-business" },
      { ...original, id: "prototype", interiorStyle: "constructor" },
      { ...original, id: "domestic", kind: "house" },
      { ...original, id: "unknown-kind", kind: "constructor" },
      { ...original, id: "office-shop", interiorStyle: "offices" },
    ];
    expect(resolveBusinessSigns(buildings, "legacy-save").size).toBe(0);
  });
});
