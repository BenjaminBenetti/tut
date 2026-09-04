import { describe, expect, it } from "vitest";

import { OBJECTIVE_UPDATED } from "../model/objective-updated-event";
import { SPAWNER_DAMAGED } from "../model/spawner-damaged-event";
import type { Objective, Spawner } from "../model/tactical-state";
import { damageSpawner } from "./spawner-damage-service";
import {
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** A live spawner at (4,0,4) with `hp` left. */
function spawner(hp = 20, destroyed = false): Spawner {
  return {
    id: "spawner-1",
    pos: { x: 4, y: 0, z: 4 },
    hatchRadius: 3,
    hp,
    timer: 2,
    destroyed,
  };
}

const objective: Objective = {
  id: "objective-1",
  kind: "destroy-spawner",
  targetId: "spawner-1",
  complete: false,
};

/** A mission holding one TDF unit, one spawner and the objective tracking it. */
function withSpawner(hp = 20, destroyed = false) {
  return missionWith(
    openField().build(),
    [unitAt("u", "infantry", { x: 0, y: 0, z: 0 })],
    { spawners: [spawner(hp, destroyed)], objectives: [objective] },
  );
}

// ===========================================
// Tests
// ===========================================

describe("damageSpawner", () => {
  it("takes the damage off and announces it, leaving the objective open", () => {
    const applied = damageSpawner(withSpawner(), "spawner-1", 8, "u");
    expect(applied.state.spawners[0]).toMatchObject({
      hp: 12,
      destroyed: false,
    });
    expect(applied.state.objectives[0]?.complete).toBe(false);
    expect(applied.events).toEqual([
      {
        type: SPAWNER_DAMAGED,
        payload: {
          spawnerId: "spawner-1",
          unitId: "u",
          damage: 8,
          hp: 12,
          destroyed: false,
        },
      },
    ]);
  });

  it("destroys it at zero and completes the objective tracking it", () => {
    const applied = damageSpawner(withSpawner(8), "spawner-1", 8, "u");
    expect(applied.state.spawners[0]).toMatchObject({
      hp: 0,
      destroyed: true,
    });
    expect(applied.state.objectives[0]?.complete).toBe(true);
    expect(applied.events.map((e) => e.type)).toEqual([
      SPAWNER_DAMAGED,
      OBJECTIVE_UPDATED,
    ]);
  });

  it("never drops below zero and reports only the hit points it actually removed", () => {
    const applied = damageSpawner(withSpawner(3), "spawner-1", 99, "u");
    expect(applied.state.spawners[0]?.hp).toBe(0);
    expect(applied.events[0]?.payload).toMatchObject({ damage: 3, hp: 0 });
  });

  it("leaves other spawners and other objectives alone", () => {
    const base = withSpawner(8);
    const two = {
      ...base,
      spawners: [...base.spawners, { ...spawner(20), id: "spawner-2" }],
      objectives: [
        ...base.objectives,
        { ...objective, id: "objective-2", targetId: "spawner-2" },
      ],
    };
    const applied = damageSpawner(two, "spawner-1", 8, "u");
    expect(applied.state.spawners.map((s) => s.destroyed)).toEqual([
      true,
      false,
    ]);
    expect(applied.state.objectives.map((o) => o.complete)).toEqual([
      true,
      false,
    ]);
  });

  it("is a no-op for an unknown spawner, one already destroyed, or a miss", () => {
    const mission = withSpawner();
    for (const applied of [
      damageSpawner(mission, "nobody", 8, "u"),
      damageSpawner(withSpawner(0, true), "spawner-1", 8, "u"),
      damageSpawner(mission, "spawner-1", 0, "u"),
    ]) {
      expect(applied.events).toEqual([]);
    }
    expect(damageSpawner(mission, "spawner-1", 0, "u").state).toBe(mission);
  });
});
