import { describe, expect, it } from "vitest";

import {
  isChassisPart,
  PART_SLOTS,
  PART_STAT_KEYS,
  type ChassisPart,
  type ComponentPart,
  type ComponentSlot,
  type PartSlot,
  type PartStats,
} from "../model/mech-part";
import { STARTER_PARTS } from "./parts";

const WEAPON_SLOTS: readonly PartSlot[] = ["arm-weapon", "back-weapon"];
const REQUIRED_SLOTS: readonly ComponentSlot[] = [
  "legs",
  "arms",
  "arm-weapon",
  "back-weapon",
];

const chassisParts = STARTER_PARTS.filter(isChassisPart);
const componentParts = STARTER_PARTS.filter(
  (part): part is ComponentPart => !isChassisPart(part),
);

/** Sums one stat across a list of parts. */
function sum(parts: readonly ComponentPart[], key: keyof PartStats) {
  return parts.reduce((total, part) => total + part.stats[key], 0);
}

/** The lightest part for a slot, and the one drawing the least power. */
function cheapestFor(slot: ComponentSlot, key: "weight" | "power") {
  const candidates = componentParts.filter((part) => part.slot === slot);
  const value = (part: ComponentPart) =>
    key === "weight" ? part.stats.weight : -part.stats.power;
  return candidates.reduce((best, part) =>
    value(part) < value(best) ? part : best,
  );
}

describe("STARTER_PARTS", () => {
  it("has unique ids", () => {
    const ids = STARTER_PARTS.map((part) => part.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("prefixes every id with its slot", () => {
    for (const part of STARTER_PARTS) {
      expect(part.id.startsWith(`${part.slot}-`)).toBe(true);
    }
  });

  it("offers at least two parts for every slot", () => {
    for (const slot of PART_SLOTS) {
      const count = STARTER_PARTS.filter((part) => part.slot === slot).length;
      expect(count, slot).toBeGreaterThanOrEqual(2);
    }
  });

  it("offers a tier 1 part for every slot", () => {
    for (const slot of PART_SLOTS) {
      const tierOne = STARTER_PARTS.filter(
        (part) => part.slot === slot && part.tier === 1,
      );
      expect(tierOne.length, slot).toBeGreaterThanOrEqual(1);
    }
  });

  it("prices every part positively in whole credits", () => {
    for (const part of STARTER_PARTS) {
      expect(part.cost, part.id).toBeGreaterThan(0);
      expect(Number.isInteger(part.cost), part.id).toBe(true);
    }
  });

  it("gives every part a name, a description and every stat", () => {
    for (const part of STARTER_PARTS) {
      expect(part.name.length, part.id).toBeGreaterThan(0);
      expect(part.description.length, part.id).toBeGreaterThan(0);
      for (const key of PART_STAT_KEYS) {
        expect(Number.isFinite(part.stats[key]), `${part.id}.${key}`).toBe(
          true,
        );
      }
      expect(part.stats.weight, part.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives every chassis a positive capacity that its power stat mirrors", () => {
    for (const chassis of chassisParts) {
      expect(chassis.capacity.maxWeight, chassis.id).toBeGreaterThan(0);
      expect(chassis.capacity.powerOutput, chassis.id).toBeGreaterThan(0);
      expect(chassis.capacity.utilitySlots, chassis.id).toBeGreaterThan(0);
      expect(chassis.stats.power, chassis.id).toBe(
        chassis.capacity.powerOutput,
      );
    }
  });

  it("makes weapons the only source of firepower and always a power draw", () => {
    for (const part of componentParts) {
      const isWeapon = WEAPON_SLOTS.includes(part.slot);
      if (isWeapon) {
        expect(part.stats.firepower, part.id).toBeGreaterThanOrEqual(
          part.weapon?.aoeEffect?.kind === "smoke" ? 0 : 1,
        );
        expect(part.stats.power, part.id).toBeLessThan(0);
      } else {
        expect(part.stats.firepower, part.id).toBe(0);
      }
    }
    for (const chassis of chassisParts) {
      expect(chassis.stats.firepower, chassis.id).toBe(0);
    }
  });

  it("keeps every blast, effect and force inside its band (#1121)", () => {
    for (const part of STARTER_PARTS) {
      const weapon = part.slot === "chassis" ? undefined : part.weapon;
      if (weapon === undefined) continue;
      if (weapon.aoe !== undefined) {
        expect(Number.isInteger(weapon.aoe.radius), part.id).toBe(true);
        expect(weapon.aoe.radius, part.id).toBeGreaterThan(0);
        expect(weapon.aoe.falloff, part.id).toBeGreaterThanOrEqual(0);
        expect(weapon.aoe.falloff, part.id).toBeLessThanOrEqual(1);
      }
      if (weapon.aoeEffect !== undefined) {
        expect(weapon.aoeEffect.chance, part.id).toBeGreaterThan(0);
        expect(weapon.aoeEffect.chance, part.id).toBeLessThanOrEqual(1);
        expect(weapon.aoeEffect.falloff, part.id).toBeGreaterThanOrEqual(0);
        expect(weapon.aoeEffect.falloff, part.id).toBeLessThanOrEqual(1);
      }
      if (weapon.demoForce !== undefined) {
        expect(Number.isInteger(weapon.demoForce), part.id).toBe(true);
        expect(weapon.demoForce, part.id).toBeGreaterThan(0);
        expect(weapon.demoForce, part.id).toBeLessThanOrEqual(3);
      }
    }
  });

  it("marks the arsenal the way the design says (#1121): blasts, fire and force where they belong", () => {
    const byId = new Map(STARTER_PARTS.map((part) => [part.id, part]));
    const weapon = (id: string) => {
      const part = byId.get(id);
      return part?.slot === "chassis" ? undefined : part?.weapon;
    };
    expect(weapon("arm-weapon-flamer")?.aoeEffect?.kind).toBe("fire");
    expect(weapon("arm-weapon-flamer")?.aoe?.radius).toBe(1);
    expect(weapon("back-weapon-mortar")?.aoe?.radius).toBe(2);
    expect(weapon("back-weapon-missile-pod")?.aoe?.radius).toBe(1);
    expect(weapon("arm-weapon-laser")?.aoe).toBeUndefined();
    expect(weapon("arm-weapon-laser")?.demoForce ?? 0).toBe(0);
    expect(weapon("arm-weapon-railgun")?.demoForce).toBe(2);
    expect(weapon("arm-weapon-autocannon")?.demoForce).toBe(1);
  });

  it("gives every weapon part a firing profile, and no other part one", () => {
    for (const part of componentParts) {
      if (WEAPON_SLOTS.includes(part.slot)) {
        // A weapon part with no profile is skipped silently when a
        // loadout is turned into a unit's weapons (#532), so the mech
        // would walk into the mission carrying nothing.
        expect(part.weapon, part.id).toBeDefined();
        expect(part.weapon?.range, part.id).toBeGreaterThan(0);
        expect(part.weapon?.armorPen, part.id).toBeGreaterThanOrEqual(0);
      } else {
        expect(part.weapon, part.id).toBeUndefined();
      }
    }
  });

  it("lets every chassis carry the lightest part in each required slot", () => {
    const lightest = REQUIRED_SLOTS.map((slot) => cheapestFor(slot, "weight"));
    const leanest = REQUIRED_SLOTS.map((slot) => cheapestFor(slot, "power"));
    const check = (chassis: ChassisPart) => {
      expect(sum(lightest, "weight"), chassis.id).toBeLessThanOrEqual(
        chassis.capacity.maxWeight,
      );
      expect(-sum(leanest, "power"), chassis.id).toBeLessThanOrEqual(
        chassis.capacity.powerOutput,
      );
    };
    chassisParts.forEach(check);
  });

  it("makes every chassis the best at exactly one of armor, mobility, utility, price, sight and cooling (#1130)", () => {
    // The four frames trade off against each other, and a player has to
    // be able to read which is which: the cheapest frame is nobody's
    // armor, the fastest nobody's capital ship. A chassis that wins two
    // axes makes another pointless, and one that wins none is a trap.
    const axes: readonly (readonly [string, (c: ChassisPart) => number])[] = [
      ["armor", (c) => c.stats.armor],
      ["mobility", (c) => c.stats.mobility],
      ["utility", (c) => c.capacity.utilitySlots],
      ["price", (c) => -c.cost],
      ["sight", (c) => c.traits?.sightBonus ?? 0],
      ["cooling", (c) => -c.stats.heat],
    ];
    const wins = new Map<string, string[]>(
      chassisParts.map((chassis) => [chassis.id, []]),
    );
    for (const [axis, value] of axes) {
      const best = Math.max(...chassisParts.map(value));
      const winners = chassisParts.filter((c) => value(c) === best);
      expect(winners, axis).toHaveLength(1);
      wins.get(winners[0]!.id)?.push(axis);
    }
    for (const [id, won] of wins) {
      expect(won, id).toHaveLength(1);
    }
  });

  it("keeps the starter chassis the cheap one, with half the plate of the heavy frame (#1130)", () => {
    const byId = new Map(chassisParts.map((chassis) => [chassis.id, chassis]));
    const vanguard = byId.get("chassis-vanguard");
    const bulwark = byId.get("chassis-bulwark");
    expect(vanguard).toBeDefined();
    expect(bulwark).toBeDefined();
    for (const chassis of chassisParts) {
      if (chassis.id !== "chassis-vanguard") {
        expect(chassis.cost, chassis.id).toBeGreaterThan(vanguard!.cost);
      }
    }
    expect(vanguard!.stats.armor * 4).toBe(bulwark!.stats.armor);
    expect(vanguard!.tier).toBe(1);
  });

  it("is plain data that survives a JSON round trip", () => {
    const copy = JSON.parse(JSON.stringify(STARTER_PARTS)) as unknown;
    expect(copy).toEqual(STARTER_PARTS);
  });
});
