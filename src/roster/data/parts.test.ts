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
        expect(part.stats.firepower, part.id).toBeGreaterThan(0);
        expect(part.stats.power, part.id).toBeLessThan(0);
      } else {
        expect(part.stats.firepower, part.id).toBe(0);
      }
    }
    for (const chassis of chassisParts) {
      expect(chassis.stats.firepower, chassis.id).toBe(0);
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

  it("is plain data that survives a JSON round trip", () => {
    const copy = JSON.parse(JSON.stringify(STARTER_PARTS)) as unknown;
    expect(copy).toEqual(STARTER_PARTS);
  });
});
