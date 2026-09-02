import { describe, expect, it } from "vitest";

import {
  isChassisPart,
  PART_SLOTS,
  PART_STAT_KEYS,
  type ChassisPart,
  type ComponentPart,
  type MechPart,
  type PartStats,
} from "./mech-part";

const ZERO_STATS: PartStats = {
  armor: 0,
  mobility: 0,
  heat: 0,
  power: 0,
  accuracy: 0,
  firepower: 0,
  weight: 0,
};

const chassis: ChassisPart = {
  id: "chassis-test",
  name: "Test Chassis",
  slot: "chassis",
  tier: 1,
  cost: 1,
  stats: ZERO_STATS,
  capacity: { maxWeight: 10, powerOutput: 10, utilitySlots: 1 },
  description: "",
};

const legs: ComponentPart = {
  id: "legs-test",
  name: "Test Legs",
  slot: "legs",
  tier: 1,
  cost: 1,
  stats: ZERO_STATS,
  description: "",
};

describe("isChassisPart", () => {
  it("narrows a chassis so its capacity is reachable", () => {
    const part: MechPart = chassis;
    expect(isChassisPart(part)).toBe(true);
    if (isChassisPart(part)) {
      expect(part.capacity.utilitySlots).toBe(1);
    }
  });

  it("rejects fitted parts", () => {
    expect(isChassisPart(legs)).toBe(false);
  });
});

describe("PART_SLOTS and PART_STAT_KEYS", () => {
  it("lists each slot once with chassis first", () => {
    expect(new Set(PART_SLOTS).size).toBe(PART_SLOTS.length);
    expect(PART_SLOTS[0]).toBe("chassis");
  });

  it("names every field of PartStats exactly once", () => {
    expect([...PART_STAT_KEYS].sort()).toEqual(Object.keys(ZERO_STATS).sort());
  });
});
