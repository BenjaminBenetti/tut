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
      // Wreck Recovery pays parts only (arc D6), and the Spore Platform
      // nothing (its win ends the campaign); every other type pays credits.
      if (type.id === "wreck-recovery" || type.id === "spore-platform") {
        expect(type.rewardPerDifficulty).toBe(0);
      } else {
        expect(type.rewardPerDifficulty).toBeGreaterThan(0);
      }
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

  it("makes Wreck Recovery a parts-only, three-day, penalty-free offer (arc §6.6)", () => {
    const wreck = MISSION_TYPES["wreck-recovery"];
    expect(wreck.rewardPerDifficulty).toBe(0);
    expect(wreck.techRewardBase).toBe(0);
    expect(wreck.techRewardPerDifficulty).toBe(0);
    expect(wreck.expiryDays).toBe(3);
    expect(wreck.ignorePenalty).toBe(0);
  });

  it("gives Alpha Hunt fewer egg spawners than a clearance at every difficulty (arc §6.8)", () => {
    const eggs = (id: "alpha-hunt" | "infestation-clearance", d: number) => {
      const hook = MISSION_TYPES[id].requiredHooks.find(
        (candidate) => candidate.kind === "egg-spawner",
      );
      if (hook === undefined) throw new Error(`${id} has no egg spawners`);
      return hook.count + Math.floor((hook.countPerDifficulty ?? 0) * (d - 1));
    };
    for (let d = 1; d <= 10; d++) {
      expect(eggs("alpha-hunt", d), `d${String(d)}`).toBeGreaterThanOrEqual(1);
      expect(eggs("alpha-hunt", d), `d${String(d)}`).toBeLessThan(
        eggs("infestation-clearance", d),
      );
    }
    const hunt = MISSION_TYPES["alpha-hunt"];
    expect(hunt.rewardPerDifficulty).toBe(300);
    expect(hunt.ignorePenalty).toBe(15);
  });

  it("round-trips through JSON unchanged", () => {
    expect(JSON.parse(JSON.stringify(MISSION_TYPES))).toEqual(MISSION_TYPES);
  });

  it("makes the Spore Platform a fixed d10 of two linked stages that pays nothing (arc §6.9)", () => {
    const platform = MISSION_TYPES["spore-platform"];
    expect(platform.difficultyBand).toEqual({ min: 10, max: 10 });
    expect(platform.stages?.map((stage) => stage.id)).toEqual(["hull", "core"]);
    expect(platform.rewardPerDifficulty).toBe(0);
    expect(platform.techRewardBase).toBe(0);
    expect(platform.techRewardPerDifficulty).toBe(0);
    expect(platform.ignorePenalty).toBe(0);
  });

  it("gives no other type stages: every earlier type is one map", () => {
    for (const type of Object.values(MISSION_TYPES)) {
      if (type.id !== "spore-platform") {
        expect(type.stages, type.id).toBeUndefined();
      }
    }
  });
});
