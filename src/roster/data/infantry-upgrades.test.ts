import { describe, expect, it } from "vitest";

import { EQUIPMENT } from "../../tactical/data/equipment";
import type {
  EquipmentDefinition,
  EquipmentId,
} from "../../tactical/model/equipment";
import { INFANTRY_UPGRADE_IDS } from "../model/infantry-upgrade";
import { INFANTRY_UPGRADES } from "./infantry-upgrades";
import { SQUAD_TYPES } from "./squad-types";

/** The catalogue's item `id`, failing the test when there is none. */
function byId(id: EquipmentId | undefined): EquipmentDefinition {
  const item = id === undefined ? undefined : EQUIPMENT[id];
  if (item === undefined) throw new Error(`no item ${String(id)}`);
  return item;
}

describe("INFANTRY_UPGRADES (campaign arc §10.3)", () => {
  it("defines every upgrade id once, under its own key, with copy", () => {
    expect(Object.keys(INFANTRY_UPGRADES).sort()).toEqual(
      [...INFANTRY_UPGRADE_IDS].sort(),
    );
    expect(new Set(INFANTRY_UPGRADE_IDS).size).toBe(
      INFANTRY_UPGRADE_IDS.length,
    );
    for (const [key, upgrade] of Object.entries(INFANTRY_UPGRADES)) {
      expect(upgrade.id).toBe(key);
      expect(upgrade.name.trim(), key).not.toBe("");
      expect(upgrade.summary.trim(), key).not.toBe("");
      // Each does something.
      expect(
        (upgrade.armorBonus ?? 0) > 0 ||
          Object.keys(upgrade.equipmentSwaps ?? {}).length > 0 ||
          (upgrade.equipmentAdds ?? []).length > 0,
        key,
      ).toBe(true);
    }
  });

  it("adds whole, positive armour, +2 across both rungs", () => {
    let total = 0;
    for (const upgrade of Object.values(INFANTRY_UPGRADES)) {
      if (upgrade.armorBonus === undefined) continue;
      expect(Number.isInteger(upgrade.armorBonus), upgrade.id).toBe(true);
      expect(upgrade.armorBonus, upgrade.id).toBeGreaterThan(0);
      total += upgrade.armorBonus;
    }
    expect(INFANTRY_UPGRADES["squad-armour-1"].armorBonus).toBe(1);
    expect(total).toBe(2);
  });

  it("swaps only real items, each for another of the same kind, uses and cost", () => {
    for (const upgrade of Object.values(INFANTRY_UPGRADES)) {
      for (const [from, to] of Object.entries(upgrade.equipmentSwaps ?? {})) {
        // `byId` fails the test on an id the catalogue lacks.
        const before = byId(from);
        const after = byId(to);
        expect(to, upgrade.id).not.toBe(from);
        // A swap changes what the item does, never how it is used, so the
        // wheel and the uses a squad has left read the same.
        expect(after.kind, upgrade.id).toBe(before.kind);
        expect(after.uses, upgrade.id).toBe(before.uses);
        expect(after.apCost, upgrade.id).toBe(before.apCost);
        expect(after.range, upgrade.id).toBe(before.range);
      }
    }
  });

  it("adds only real items no shipped squad type carries itself: the capture net alone (#1179)", () => {
    const carried = new Set<EquipmentId>(
      SQUAD_TYPES.flatMap((type) => type.equipment ?? []),
    );
    const added = Object.values(INFANTRY_UPGRADES).flatMap((upgrade) =>
      (upgrade.equipmentAdds ?? []).map((id) => [upgrade.id, id]),
    );
    expect(added).toEqual([["capture-net", "capture-net"]]);
    for (const [, id] of added) {
      expect(byId(id).kind).toBe("net");
      expect(carried.has(id!)).toBe(false);
    }
  });

  it("names items a shipped squad carries, so every swap reaches someone", () => {
    const carried = new Set<EquipmentId>(
      SQUAD_TYPES.flatMap((type) => type.equipment ?? []),
    );
    for (const upgrade of Object.values(INFANTRY_UPGRADES)) {
      const keys = Object.keys(upgrade.equipmentSwaps ?? {});
      if (keys.length === 0) continue;
      expect(
        keys.some((id) => carried.has(id)),
        upgrade.id,
      ).toBe(true);
    }
  });

  it("makes each rung stronger than what it replaces", () => {
    const profileOf = (id: EquipmentId) => {
      const profile = byId(id).profile;
      if (profile?.aoe === undefined) throw new Error(`${id} is no blast`);
      return { ...profile, aoe: profile.aoe };
    };
    const grenade = profileOf("grenade");
    const frag = profileOf("frag-grenade");
    const incendiary = profileOf("incendiary-grenade");
    expect(frag.damage).toBeGreaterThan(grenade.damage);
    expect(frag.aoe.falloff).toBeLessThan(grenade.aoe.falloff);
    expect(frag.aoe.radius).toBe(grenade.aoe.radius);
    expect({ ...incendiary, aoeEffect: undefined }).toEqual({
      ...frag,
      aoeEffect: undefined,
    });
    expect(incendiary.aoeEffect).toEqual({
      kind: "fire",
      chance: 1,
      falloff: 0.35,
    });
    expect(byId("field-medkit").heal).toEqual({
      ...byId("medkit").heal,
      amount: 15,
    });
  });
});
