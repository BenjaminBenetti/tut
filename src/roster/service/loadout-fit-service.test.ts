import { describe, expect, it } from "vitest";

import { STARTER_PARTS } from "../data/parts";
import { STARTER_LOADOUT } from "../data/starter-roster";
import type { MechPart } from "../model/mech-part";
import { StaticPartCatalogue } from "../repository/static-part-catalogue";
import { fitPart, removeUtility, utilitySlotsOf } from "./loadout-fit-service";

// ===========================================
// Fixtures
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);

/** A catalogue part by id, or a thrown test failure. */
function part(id: string): MechPart {
  const found = PARTS.getPart(id);
  if (found === undefined) throw new Error(`no part ${id}`);
  return found;
}

// ===========================================
// Tests
// ===========================================

describe("fitPart", () => {
  it("replaces the part in a single-part slot and leaves the rest", () => {
    const next = fitPart(STARTER_LOADOUT, part("arm-weapon-railgun"), PARTS);
    expect(next.armWeaponId).toBe("arm-weapon-railgun");
    expect(next.legsId).toBe(STARTER_LOADOUT.legsId);
    expect(next.utilityIds).toEqual(STARTER_LOADOUT.utilityIds);
    expect(next.name).toBe(STARTER_LOADOUT.name);
  });

  it("never mutates the draft it was given", () => {
    const before = structuredClone(STARTER_LOADOUT);
    fitPart(STARTER_LOADOUT, part("legs-jumper"), PARTS);
    fitPart(STARTER_LOADOUT, part("utility-radiator"), PARTS, 1);
    expect(STARTER_LOADOUT).toEqual(before);
  });

  it("swaps the chassis and keeps the utilities the new frame has room for", () => {
    const atlas = fitPart(STARTER_LOADOUT, part("chassis-atlas"), PARTS);
    const full = {
      ...atlas,
      utilityIds: [
        "utility-radiator",
        "utility-armor-plating",
        "utility-targeting-computer",
      ],
    };
    // Back to the Vanguard, which carries two: the first two survive.
    const vanguard = fitPart(full, part("chassis-vanguard"), PARTS);
    expect(vanguard.chassisId).toBe("chassis-vanguard");
    expect(vanguard.utilityIds).toEqual([
      "utility-radiator",
      "utility-armor-plating",
    ]);
  });

  it("puts a utility into the first free slot when no slot is named", () => {
    // The starter Vanguard has two slots and one radiator fitted.
    const next = fitPart(STARTER_LOADOUT, part("utility-armor-plating"), PARTS);
    expect(next.utilityIds).toEqual([
      ...STARTER_LOADOUT.utilityIds,
      "utility-armor-plating",
    ]);
  });

  it("replaces the last utility when every slot is taken", () => {
    const full = fitPart(STARTER_LOADOUT, part("utility-armor-plating"), PARTS);
    const next = fitPart(full, part("utility-targeting-computer"), PARTS);
    expect(next.utilityIds).toEqual([
      STARTER_LOADOUT.utilityIds[0],
      "utility-targeting-computer",
    ]);
  });

  it("drops a utility onto the slot it was dropped on", () => {
    const next = fitPart(
      STARTER_LOADOUT,
      part("utility-targeting-computer"),
      PARTS,
      0,
    );
    expect(next.utilityIds).toEqual(["utility-targeting-computer"]);
    // A slot past the fitted ones appends rather than leaving a hole.
    const appended = fitPart(
      STARTER_LOADOUT,
      part("utility-targeting-computer"),
      PARTS,
      1,
    );
    expect(appended.utilityIds).toEqual([
      STARTER_LOADOUT.utilityIds[0],
      "utility-targeting-computer",
    ]);
  });

  it("ignores a utility slot index the chassis does not have", () => {
    const next = fitPart(STARTER_LOADOUT, part("utility-radiator"), PARTS, 7);
    expect(next.utilityIds).toHaveLength(2);
  });

  it("leaves the draft alone when the chassis has no utility slots", () => {
    const noChassis = { ...STARTER_LOADOUT, chassisId: "chassis-nope" };
    expect(fitPart(noChassis, part("utility-radiator"), PARTS)).toBe(noChassis);
  });
});

describe("removeUtility", () => {
  it("takes the named utility off and keeps the others in order", () => {
    const two = fitPart(STARTER_LOADOUT, part("utility-armor-plating"), PARTS);
    expect(removeUtility(two, 0).utilityIds).toEqual(["utility-armor-plating"]);
    expect(removeUtility(two, 1).utilityIds).toEqual(
      STARTER_LOADOUT.utilityIds,
    );
  });

  it("returns the same draft for an index with nothing in it", () => {
    expect(removeUtility(STARTER_LOADOUT, 5)).toBe(STARTER_LOADOUT);
    expect(removeUtility(STARTER_LOADOUT, -1)).toBe(STARTER_LOADOUT);
  });
});

describe("utilitySlotsOf", () => {
  it("reads the chassis' slot count and answers 0 for an unknown chassis", () => {
    expect(utilitySlotsOf(STARTER_LOADOUT, PARTS)).toBe(2);
    expect(
      utilitySlotsOf({ ...STARTER_LOADOUT, chassisId: "legs-strider" }, PARTS),
    ).toBe(0);
  });
});
