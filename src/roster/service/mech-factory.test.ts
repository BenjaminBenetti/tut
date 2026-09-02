import { describe, expect, it } from "vitest";

import { STARTER_PARTS } from "../data/parts";
import { StaticPartCatalogue } from "../repository/static-part-catalogue";
import type { Mech } from "../model/mech";
import { MECH_MAX_DAMAGE } from "../model/mech";
import { loadoutPartIds, type MechLoadout } from "../model/mech-loadout";
import { createMech } from "./mech-factory";

/** A loadout whose ids all exist in the starter catalogue. */
function starterLoadout(): MechLoadout {
  return {
    name: "Skirmisher",
    chassisId: "chassis-vanguard",
    legsId: "legs-strider",
    armsId: "arms-manipulator",
    armWeaponId: "arm-weapon-autocannon",
    backWeaponId: "back-weapon-missile-pod",
    utilityIds: ["utility-radiator"],
  };
}

describe("createMech", () => {
  it("returns an undamaged mech with no history", () => {
    const loadout = starterLoadout();
    const mech = createMech(loadout, "mech-1", "Hammerhead");
    expect(mech).toStrictEqual<Mech>({
      id: "mech-1",
      name: "Hammerhead",
      loadout,
      damage: 0,
      kills: 0,
      missionsSurvived: 0,
      xp: 0,
    });
    expect(mech.damage).toBeLessThan(MECH_MAX_DAMAGE);
  });

  it("uses a loadout whose parts all exist in the starter catalogue", () => {
    const catalogue = new StaticPartCatalogue(STARTER_PARTS);
    const mech = createMech(starterLoadout(), "mech-2", "Anvil");
    for (const id of loadoutPartIds(mech.loadout)) {
      expect(catalogue.getPart(id), id).toBeDefined();
    }
  });

  it("copies the loadout so the template can change independently", () => {
    const utilityIds = ["utility-radiator"];
    const upgrades = { "arm-weapon-autocannon": 1 };
    const template: MechLoadout = { ...starterLoadout(), utilityIds, upgrades };
    const mech = createMech(template, "mech-3", "Bishop");

    utilityIds.push("utility-armor-plating");
    upgrades["arm-weapon-autocannon"] = 2;

    expect(mech.loadout).not.toBe(template);
    expect(mech.loadout.utilityIds).toEqual(["utility-radiator"]);
    expect(mech.loadout.upgrades).toEqual({ "arm-weapon-autocannon": 1 });
  });

  it("omits upgrades when the loadout has none", () => {
    const mech = createMech(starterLoadout(), "mech-4", "Castle");
    expect("upgrades" in mech.loadout).toBe(false);
  });

  it("produces independent objects on each call", () => {
    const a = createMech(starterLoadout(), "mech-5", "Rook");
    const b = createMech(starterLoadout(), "mech-5", "Rook");
    expect(a).toStrictEqual(b);
    expect(a).not.toBe(b);
    expect(a.loadout).not.toBe(b.loadout);
  });

  it("round-trips through JSON unchanged", () => {
    const mech = createMech(
      { ...starterLoadout(), upgrades: { "legs-strider": 1 } },
      "mech-6",
      "Knight",
    );
    const restored = JSON.parse(JSON.stringify(mech)) as Mech;
    expect(restored).toStrictEqual(mech);
  });
});
