import { describe, expect, it } from "vitest";

import {
  ENGINEER_SQUAD,
  MEDIC_SQUAD,
  RIFLE_SQUAD,
  ROCKET_SQUAD,
  SNIPER_SQUAD,
  SQUAD_TYPES,
} from "./squad-types";

const REQUIRED_IDS = ["rifle", "rocket", "sniper", "engineer", "medic"];

describe("squad-types data", () => {
  it("contains the five M1 types with unique ids", () => {
    const ids = SQUAD_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of REQUIRED_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("exports each named constant as a member of the list", () => {
    for (const type of [
      RIFLE_SQUAD,
      ROCKET_SQUAD,
      SNIPER_SQUAD,
      ENGINEER_SQUAD,
      MEDIC_SQUAD,
    ]) {
      expect(SQUAD_TYPES).toContain(type);
    }
  });

  it("has positive integer costs and a positive rating on every type", () => {
    for (const type of SQUAD_TYPES) {
      expect(Number.isInteger(type.hireCost)).toBe(true);
      expect(type.hireCost).toBeGreaterThan(0);
      expect(Number.isInteger(type.reinforceCostPerSoldier)).toBe(true);
      expect(type.reinforceCostPerSoldier).toBeGreaterThan(0);
      expect(type.combatRating).toBeGreaterThan(0);
    }
  });

  it("prices reinforcement below re-hiring", () => {
    for (const type of SQUAD_TYPES) {
      expect(type.reinforceCostPerSoldier).toBeLessThan(type.hireCost);
    }
  });

  it("has non-empty names and descriptions", () => {
    for (const type of SQUAD_TYPES) {
      expect(type.name.trim().length).toBeGreaterThan(0);
      expect(type.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("round-trips through JSON unchanged", () => {
    const text = JSON.stringify(SQUAD_TYPES);
    expect(JSON.parse(text)).toEqual(SQUAD_TYPES);
  });
});
