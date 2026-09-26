import { describe, expect, it } from "vitest";

import { SITREP_TUNING } from "../../data/sitrep-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import type { Spawner } from "../../model/tactical-state";
import {
  hardenClutches,
  hardenedClutchesSitrep,
} from "./hardened-clutches-sitrep";
import { fieldMission, NEST } from "./sitrep-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const TUNING = SITREP_TUNING.hardenedClutches;

/** A spawner at the nest, an egg spawner unless `overrides` say otherwise. */
function spawner(id: string, overrides: Partial<Spawner> = {}): Spawner {
  return {
    id,
    pos: NEST,
    hatchRadius: 3,
    hp: SPAWN_TUNING.spawnerHp,
    timer: 4,
    destroyed: false,
    ...overrides,
  };
}

// ===========================================
// Rule
// ===========================================

describe("hardenedClutchesSitrep", () => {
  it("has a setup and nothing else", () => {
    const rule = hardenedClutchesSitrep(TUNING);
    expect(rule.id).toBe("hardened-clutches");
    expect(rule.setup).toBeDefined();
    expect(rule.sight).toBeUndefined();
    expect(rule.phaseStep).toBeUndefined();
  });

  it("ships +50% hit points and one more bug a hatch", () => {
    expect(TUNING).toEqual({ hpScale: 1.5, extraHatchlings: 1 });
  });
});

describe("hardenClutches", () => {
  it("multiplies an egg spawner's hit points by 1.5, rounded up, and adds one bug to its hatch", () => {
    const mission = fieldMission(["hardened-clutches"], {
      spawners: [
        spawner("spawner-1"),
        spawner("spawner-2", { hp: 21, variant: "egg-spawner" }),
      ],
    });
    const hardened = hardenClutches(mission, TUNING);
    expect(hardened.spawners.map((s) => [s.hp, s.hatchBonus])).toEqual([
      [30, 1],
      [32, 1],
    ]);
    // Only the hit points and the bonus move.
    expect({ ...hardened.spawners[0], hp: 20, hatchBonus: undefined }).toEqual({
      ...mission.spawners[0],
      hatchBonus: undefined,
    });
  });

  it("leaves a spore pod and a destroyed spawner exactly as they were", () => {
    const pod = spawner("spawner-2", { variant: "spore-pod", hp: 40 });
    const dead = spawner("spawner-3", { hp: 0, destroyed: true });
    const mission = fieldMission(["hardened-clutches"], {
      spawners: [spawner("spawner-1"), pod, dead],
    });
    const hardened = hardenClutches(mission, TUNING);
    expect(hardened.spawners[1]).toBe(pod);
    expect(hardened.spawners[2]).toBe(dead);
  });

  it("adds its bonus to one a spawner already had", () => {
    const mission = fieldMission(["hardened-clutches"], {
      spawners: [spawner("spawner-1", { hatchBonus: 2 })],
    });
    expect(hardenClutches(mission, TUNING).spawners[0]?.hatchBonus).toBe(3);
  });

  it("returns a mission with nothing that hatches as it came (a defence, a crash site)", () => {
    const none = fieldMission(["hardened-clutches"]);
    expect(hardenClutches(none, TUNING)).toBe(none);
    const podOnly = fieldMission(["hardened-clutches"], {
      spawners: [spawner("spawner-1", { variant: "spore-pod", hp: 40 })],
    });
    expect(hardenClutches(podOnly, TUNING)).toBe(podOnly);
  });

  it("never mutates the mission", () => {
    const mission = fieldMission(["hardened-clutches"], {
      spawners: [spawner("spawner-1")],
    });
    const before = structuredClone(mission);
    hardenClutches(mission, TUNING);
    expect(mission).toEqual(before);
  });
});
