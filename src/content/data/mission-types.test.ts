import { describe, expect, it } from "vitest";

import { MISSION_DIFFICULTY_RANGE } from "../model/mission-type";
import { MISSION_TYPE_IDS } from "../model/mission-type-id";
import { INFESTATION_CLEARANCE, MISSION_TYPES } from "./mission-types";

describe("mission-types data", () => {
  it("defines every id exactly once, keyed by its own id", () => {
    const keys = Object.keys(MISSION_TYPES).sort();
    expect(keys).toEqual([...MISSION_TYPE_IDS].sort());
    for (const id of MISSION_TYPE_IDS) {
      expect(MISSION_TYPES[id].id).toBe(id);
    }
  });

  it("ships infestation clearance as the M1 baseline", () => {
    expect(MISSION_TYPE_IDS).toContain("infestation-clearance");
    expect(MISSION_TYPES["infestation-clearance"]).toBe(INFESTATION_CLEARANCE);
  });

  it("keeps every difficulty band inside the global range and ordered", () => {
    const { min, max } = MISSION_DIFFICULTY_RANGE;
    expect(Number.isInteger(min) && Number.isInteger(max)).toBe(true);
    expect(min).toBeLessThanOrEqual(max);
    for (const type of Object.values(MISSION_TYPES)) {
      const band = type.difficultyBand;
      expect(Number.isInteger(band.min)).toBe(true);
      expect(Number.isInteger(band.max)).toBe(true);
      expect(band.min).toBeGreaterThanOrEqual(min);
      expect(band.max).toBeLessThanOrEqual(max);
      expect(band.min).toBeLessThanOrEqual(band.max);
    }
  });

  it("uses positive rewards and expiry, and non-negative penalties", () => {
    for (const type of Object.values(MISSION_TYPES)) {
      expect(Number.isInteger(type.rewardPerDifficulty)).toBe(true);
      expect(type.rewardPerDifficulty).toBeGreaterThan(0);
      expect(Number.isInteger(type.expiryDays)).toBe(true);
      expect(type.expiryDays).toBeGreaterThan(0);
      expect(Number.isInteger(type.ignorePenalty)).toBe(true);
      expect(type.ignorePenalty).toBeGreaterThanOrEqual(0);
    }
  });

  it("has non-empty names and descriptions", () => {
    for (const type of Object.values(MISSION_TYPES)) {
      expect(type.name.trim().length).toBeGreaterThan(0);
      expect(type.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("requires a deploy zone and an extraction with sane counts", () => {
    for (const type of Object.values(MISSION_TYPES)) {
      const kinds = type.requiredHooks.map((hook) => hook.kind);
      expect(kinds).toContain("deploy");
      expect(kinds).toContain("extraction");
      for (const hook of type.requiredHooks) {
        expect(Number.isInteger(hook.count), hook.kind).toBe(true);
        expect(hook.count).toBeGreaterThanOrEqual(0);
        expect(hook.countPerDifficulty ?? 0).toBeGreaterThanOrEqual(0);
      }
      expect(["small", "medium", "large"]).toContain(type.mapSize);
    }
  });

  it("round-trips through JSON unchanged", () => {
    expect(JSON.parse(JSON.stringify(MISSION_TYPES))).toEqual(MISSION_TYPES);
  });
});
