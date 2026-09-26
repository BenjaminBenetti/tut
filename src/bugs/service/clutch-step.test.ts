import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { SPAWN_TUNING } from "../../tactical/data/spawn-tuning";
import { CLUTCH_LAID } from "../../tactical/model/clutch-laid-event";
import type { TacticalContext } from "../../tactical/model/tactical-handler";
import type {
  Spawner,
  TacticalState,
} from "../../tactical/model/tactical-state";
import { DEFAULT_HATCH_RADIUS } from "../../tactical/model/tactical-state";
import { footprintContains } from "../../tactical/service/footprint-service";
import { hatchInterval } from "../../tactical/service/spawn-service";
import { unitAt } from "../../tactical/service/tactical-fixtures.test-helper";
import { BROODMOTHER_TUNING } from "../data/broodmother-tuning";
import { createClutchStep, layClutches } from "./clutch-step";
import { fieldMap, motherMission } from "./broodmother.test-helper";

// ===========================================
// Fixtures
// ===========================================

const DEPS = { spawn: SPAWN_TUNING };
const ANCHOR = { x: 4, y: 0, z: 4 };

/** A context with fresh ids and a fixed stream. */
function ctx(): TacticalContext & { ids: SequentialIdGenerator } {
  return { rng: new Mulberry32Rng(1), ids: new SequentialIdGenerator() };
}

/** A 12×12 field with a squad in the far corner and the Broodmother at `ANCHOR`. */
function mother(
  options: Parameters<typeof motherMission>[3] = {},
): ReturnType<typeof motherMission> {
  return motherMission(
    fieldMap(12, 12).build(),
    [unitAt("squad", "infantry", { x: 11, y: 0, z: 11 })],
    ANCHOR,
    { turn: 3, ...options },
  );
}

/** The spawners `after` has that `before` did not. */
function laid(before: TacticalState, after: TacticalState): Spawner[] {
  return after.spawners.slice(before.spawners.length);
}

// ===========================================
// Tests
// ===========================================

describe("layClutches (#1179, campaign arc §6.8)", () => {
  it("lays one ordinary egg spawner beside her as the bug phase of a third turn opens", () => {
    const { mission, mother: her } = mother({ difficulty: 5 });
    const applied = layClutches(mission, ctx(), DEPS);
    const [clutch] = laid(mission, applied.state);
    expect(laid(mission, applied.state)).toHaveLength(1);
    // Exactly what a mission's nests are built as: the spawn tuning's
    // hit points and clock, the default radius, no variant.
    expect(clutch).toEqual({
      id: "spawner-1",
      pos: clutch?.pos,
      hatchRadius: DEFAULT_HATCH_RADIUS,
      hp: SPAWN_TUNING.spawnerHp,
      timer: hatchInterval(5, SPAWN_TUNING),
      destroyed: false,
    });
    expect(applied.events).toEqual([
      {
        type: CLUTCH_LAID,
        payload: { unitId: her.id, spawnerId: "spawner-1", pos: clutch?.pos },
      },
    ]);
    // Beside her block, not under it.
    const pos = clutch!.pos;
    expect(footprintContains(her.pos, 3, pos)).toBe(false);
    expect(pos.x).toBeGreaterThanOrEqual(ANCHOR.x - 1);
    expect(pos.x).toBeLessThanOrEqual(ANCHOR.x + 3);
    expect(pos.z).toBeGreaterThanOrEqual(ANCHOR.z - 1);
    expect(pos.z).toBeLessThanOrEqual(ANCHOR.z + 3);
  });

  it("lays only on turns divisible by the interval, and only as the bugs' phase opens", () => {
    for (const [turn, phase, expected] of [
      [1, "bugs", 0],
      [2, "bugs", 0],
      [3, "bugs", 1],
      [3, "player", 0],
      [4, "bugs", 0],
      [5, "bugs", 0],
      [6, "bugs", 1],
      [9, "bugs", 1],
    ] as const) {
      const { mission } = mother({ turn, phase });
      const applied = layClutches(mission, ctx(), DEPS);
      expect([turn, phase, laid(mission, applied.state).length]).toEqual([
        turn,
        phase,
        expected,
      ]);
    }
  });

  it("follows the tuning's interval", () => {
    const tuning = { ...BROODMOTHER_TUNING, clutchInterval: 2 };
    const { mission } = mother({ turn: 4 });
    expect(
      laid(mission, layClutches(mission, ctx(), { ...DEPS, tuning }).state),
    ).toHaveLength(1);
    const odd = mother({ turn: 3 }).mission;
    expect(
      laid(odd, layClutches(odd, ctx(), { ...DEPS, tuning }).state),
    ).toHaveLength(0);
  });

  it("lays behind her: the ovipositor end, against her facing", () => {
    for (const [facing, check] of [
      ["n", (x: number, z: number) => z === ANCHOR.z + 3 && x >= 0],
      ["s", (x: number, z: number) => z === ANCHOR.z - 1 && x >= 0],
      ["e", (x: number, z: number) => x === ANCHOR.x - 1 && z >= 0],
      ["w", (x: number, z: number) => x === ANCHOR.x + 3 && z >= 0],
    ] as const) {
      const { mission } = mother({ facing });
      const [clutch] = laid(mission, layClutches(mission, ctx(), DEPS).state);
      expect([facing, check(clutch!.pos.x, clutch!.pos.z)]).toEqual([
        facing,
        true,
      ]);
    }
  });

  it("never lays on a tile a unit holds or a live nest stands on", () => {
    const { mission } = mother({ facing: "n" });
    // The row behind her, all three tiles: a squad on one, live nests on
    // the others. A wrecked nest does not count.
    const row = [4, 5, 6].map((x) => ({ x, y: 0, z: 7 }));
    const nest = (id: string, x: number, destroyed: boolean): Spawner => ({
      id,
      pos: { x, y: 0, z: 7 },
      hatchRadius: 3,
      hp: destroyed ? 0 : 20,
      timer: 3,
      destroyed,
    });
    const crowded: TacticalState = {
      ...mission,
      units: [...mission.units, unitAt("blocker", "infantry", row[0]!)],
      spawners: [nest("old-a", 5, false), nest("old-b", 6, false)],
    };
    const [clutch] = laid(crowded, layClutches(crowded, ctx(), DEPS).state);
    expect(clutch).toBeDefined();
    expect(clutch!.pos.z).not.toBe(7);
    // Wreck one of the nests and its tile is free again.
    const wrecked = {
      ...crowded,
      spawners: [nest("old-a", 5, true), nest("old-b", 6, false)],
    };
    const [again] = laid(wrecked, layClutches(wrecked, ctx(), DEPS).state);
    expect(again?.pos).toEqual({ x: 5, y: 0, z: 7 });
  });

  it("lays nothing, and draws no id, when she is boxed in", () => {
    // A 3×3 field is exactly her block: there is no tile beside her.
    const { mission } = motherMission(
      fieldMap(3, 3).build(),
      [],
      { x: 0, y: 0, z: 0 },
      { turn: 3 },
    );
    const ids = ctx();
    const applied = layClutches(mission, ids, DEPS);
    expect(applied.state.spawners).toEqual([]);
    expect(applied.events).toEqual([]);
    expect(ids.ids.getState()).toEqual({ counters: {} });
  });

  it("changes nothing and draws nothing on a mission without a living Broodmother", () => {
    const { mission, mother: her } = mother();
    const without: TacticalState = {
      ...mission,
      units: mission.units.filter((u) => u.id !== her.id),
    };
    const dead: TacticalState = {
      ...mission,
      units: mission.units.map((u) => (u.id === her.id ? { ...u, hp: 0 } : u)),
    };
    for (const state of [without, dead]) {
      const ids = ctx();
      const applied = createClutchStep(DEPS)(state, ids);
      expect(applied.state).toBe(state);
      expect(applied.events).toEqual([]);
      expect(ids.ids.getState()).toEqual({ counters: {} });
    }
  });
});
