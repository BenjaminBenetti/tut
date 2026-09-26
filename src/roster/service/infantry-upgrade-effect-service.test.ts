import { describe, expect, it } from "vitest";

import { INFANTRY_UPGRADES } from "../data/infantry-upgrades";
import type {
  InfantryUpgradeDefinition,
  InfantryUpgradeId,
} from "../model/infantry-upgrade";
import {
  activeInfantryUpgrades,
  infantryArmorBonus,
  upgradedEquipment,
} from "./infantry-upgrade-effect-service";

/** The definitions of `ids`, in the order given. */
function upgrades(...ids: InfantryUpgradeId[]): InfantryUpgradeDefinition[] {
  return ids.map((id) => INFANTRY_UPGRADES[id]);
}

describe("activeInfantryUpgrades", () => {
  it("returns the definitions in application order whatever order the ids come in", () => {
    const active = activeInfantryUpgrades(
      new Set<InfantryUpgradeId>([
        "field-medic-training",
        "incendiary-grenades",
        "squad-armour-1",
        "frag-grenades",
      ]),
      INFANTRY_UPGRADES,
    );
    expect(active.map((u) => u.id)).toEqual([
      "squad-armour-1",
      "frag-grenades",
      "incendiary-grenades",
      "field-medic-training",
    ]);
    expect(active[0]).toBe(INFANTRY_UPGRADES["squad-armour-1"]);
  });

  it("returns nothing for no research", () => {
    expect(activeInfantryUpgrades(new Set(), INFANTRY_UPGRADES)).toEqual([]);
  });
});

describe("infantryArmorBonus", () => {
  it("is zero with no plate, +1 with the first rung and +2 with both", () => {
    expect(infantryArmorBonus([])).toBe(0);
    expect(infantryArmorBonus(upgrades("frag-grenades"))).toBe(0);
    expect(infantryArmorBonus(upgrades("squad-armour-1"))).toBe(1);
    expect(
      infantryArmorBonus(
        upgrades("squad-armour-1", "frag-grenades", "squad-armour-2"),
      ),
    ).toBe(2);
  });
});

describe("upgradedEquipment", () => {
  it("swaps what an upgrade names and keeps the rest in place", () => {
    expect(
      upgradedEquipment(
        ["grenade", "radar-dish"],
        upgrades("squad-armour-1", "frag-grenades"),
      ),
    ).toEqual(["frag-grenade", "radar-dish"]);
    expect(
      upgradedEquipment(
        ["grenade", "medkit"],
        upgrades("field-medic-training"),
      ),
    ).toEqual(["grenade", "field-medkit"]);
  });

  it("lands on the incendiary grenade whether or not frag grenades came first", () => {
    const kit = ["grenade", "breaching-charge"];
    const both = upgradedEquipment(
      kit,
      upgrades("frag-grenades", "incendiary-grenades"),
    );
    expect(both).toEqual(["incendiary-grenade", "breaching-charge"]);
    expect(
      upgradedEquipment(kit, upgrades("incendiary-grenades", "frag-grenades")),
    ).toEqual(both);
    expect(upgradedEquipment(kit, upgrades("incendiary-grenades"))).toEqual(
      both,
    );
  });

  it("returns the kit unchanged, as a new list, with no upgrades", () => {
    const kit = ["grenade", "medkit"];
    const out = upgradedEquipment(kit, []);
    expect(out).toEqual(kit);
    expect(out).not.toBe(kit);
    expect(kit).toEqual(["grenade", "medkit"]);
  });
});
