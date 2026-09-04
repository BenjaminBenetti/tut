import { describe, expect, it } from "vitest";

import { manhattanDistance } from "../../core/service/grid-math";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { SPAWN_TUNING } from "../data/spawn-tuning";
import { BUGS_SPAWNED } from "../model/bugs-spawned-event";
import { endTurn } from "../model/end-turn-command";
import type { SpawnSource } from "../model/spawn-source";
import type { TacticalContext } from "../model/tactical-handler";
import type { Spawner, TacticalState } from "../model/tactical-state";
import { TURN_STARTED } from "../model/turn-started-event";
import type { Unit } from "../model/unit";
import type { SpawnDeps } from "./spawn-service";
import {
  createEdgeWaveStep,
  createHatchStep,
  edgeWave,
  hatch,
  waveInterval,
  waveSize,
} from "./spawn-service";
import {
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";
import { createEndTurnHandler, DEFAULT_PHASE_STEPS } from "./turn-service";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number, y = 0): TileCoord => ({ x, y, z });
const T = SPAWN_TUNING;

const SWARMER: SpawnSource = {
  id: "swarmer",
  name: "Swarmer",
  hp: 6,
  armor: 0,
  move: 7,
  ap: 2,
  weapon: { range: 1, accuracy: 60, damage: 3, armorPen: 0 },
  modelId: "bug.swarmer",
  hatchWeight: 6,
};
const BRUTE: SpawnSource = {
  ...SWARMER,
  id: "brute",
  name: "Brute",
  hp: 30,
  armor: 3,
  move: 3,
  modelId: "bug.brute",
  hatchWeight: 1,
};
const DEPS: SpawnDeps = { species: [SWARMER, BRUTE], tuning: T };

/** A context over a seeded stream with fresh ids. */
function ctxFor(seed: number): TacticalContext {
  return { rng: new Mulberry32Rng(seed), ids: new SequentialIdGenerator() };
}

/** A live spawner with a radius of two. */
function spawnerAt(
  id: string,
  pos: TileCoord,
  timer: number,
  overrides: Partial<Spawner> = {},
): Spawner {
  return {
    id,
    pos,
    hatchRadius: 2,
    hp: T.spawnerHp,
    timer,
    destroyed: false,
    ...overrides,
  };
}

/** The bug-team units of a mission. */
function bugsOf(mission: TacticalState): Unit[] {
  return mission.units.filter((unit) => unit.team === "bugs");
}

/** The field with two edge-spawn hooks, one on the west edge and one on the east. */
function fieldWithEdges(): TacticalState["map"] {
  return openField()
    .edgeSpawn([at(0, 2), at(0, 3), at(0, 4), at(0, 5)])
    .edgeSpawn([at(7, 2), at(7, 3), at(7, 4), at(7, 5)])
    .build();
}

// ===========================================
// Egg spawners
// ===========================================

describe("hatch", () => {
  it("counts live spawners down and hatches into the ripe one's space, leaving the destroyed alone", () => {
    const mission = missionWith(openField().build(), [], {
      phase: "bugs",
      spawners: [
        spawnerAt("ripe", at(4, 4), 1),
        spawnerAt("later", at(1, 1), 3),
        spawnerAt("dead", at(7, 7), 1, { hp: 0, destroyed: true }),
      ],
    });
    const result = hatch(mission, ctxFor(1), DEPS);
    const bugs = bugsOf(result.state);
    expect(bugs).toHaveLength(T.hatchCount);
    for (const bug of bugs) {
      expect(manhattanDistance(bug.pos, at(4, 4))).toBeLessThanOrEqual(2);
      expect(bug.pos).not.toEqual(at(4, 4));
      expect(bug.ap).toBe(0);
      expect(bug.hp).toBe(bug.maxHp);
      expect(["swarmer", "brute"]).toContain(bug.sourceId);
      expect(result.state.templates[bug.templateId]?.id).toBe(bug.templateId);
    }
    expect(new Set(bugs.map((b) => `${b.pos.x},${b.pos.z}`)).size).toBe(
      bugs.length,
    );
    expect(result.state.spawners.map((s) => s.timer)).toEqual([
      T.hatchInterval,
      2,
      1,
    ]);
    expect(result.state.spawners[2]).toBe(mission.spawners[2]);
    expect(result.events).toEqual([
      {
        type: BUGS_SPAWNED,
        payload: {
          unitIds: bugs.map((b) => b.id),
          source: "spawner",
          sourceId: "ripe",
        },
      },
    ]);
    expect(mission.units).toEqual([]);
    expect(mission.spawners[0]?.timer).toBe(1);
  });

  it("does nothing outside the bug phase", () => {
    const mission = missionWith(openField().build(), [], {
      spawners: [spawnerAt("ripe", at(4, 4), 1)],
    });
    const result = hatch(mission, ctxFor(1), DEPS);
    expect(result.state).toBe(mission);
    expect(result.events).toEqual([]);
  });

  it("replays for a seed, stays valid for every seed, and varies between seeds", () => {
    const mission = missionWith(openField().build(), [], {
      phase: "bugs",
      spawners: [spawnerAt("ripe", at(4, 4), 1)],
    });
    const signatures = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
      const once = hatch(mission, ctxFor(seed), DEPS);
      const again = hatch(mission, ctxFor(seed), DEPS);
      expect(again).toEqual(once);
      const bugs = bugsOf(once.state);
      expect(bugs).toHaveLength(T.hatchCount);
      for (const bug of bugs) {
        expect(manhattanDistance(bug.pos, at(4, 4))).toBeLessThanOrEqual(2);
      }
      signatures.add(
        bugs.map((b) => `${b.sourceId}@${b.pos.x},${b.pos.z}`).join(" "),
      );
    }
    expect(signatures.size).toBeGreaterThan(1);
  });

  it("rolls species by hatch weight and hatches nothing without a species to roll", () => {
    const mission = missionWith(openField().build(), [], {
      phase: "bugs",
      spawners: [spawnerAt("ripe", at(4, 4), 1)],
    });
    const brutesOnly: SpawnDeps = {
      species: [{ ...SWARMER, hatchWeight: 0 }, BRUTE],
      tuning: T,
    };
    for (let seed = 1; seed <= 4; seed++) {
      const result = hatch(mission, ctxFor(seed), brutesOnly);
      expect(bugsOf(result.state).map((b) => b.sourceId)).toEqual([
        "brute",
        "brute",
      ]);
    }
    const nothing = hatch(mission, ctxFor(1), { species: [], tuning: T });
    expect(nothing.state.units).toEqual([]);
    expect(nothing.events).toEqual([]);
    expect(nothing.state.spawners[0]?.timer).toBe(T.hatchInterval);
  });

  it("skips tiles other units hold and hatches nothing when boxed in", () => {
    const crowded = missionWith(
      openField().build(),
      [
        unitAt("a", "infantry", at(3, 4)),
        unitAt("b", "infantry", at(5, 4)),
        unitAt("c", "infantry", at(4, 3)),
      ],
      {
        phase: "bugs",
        spawners: [spawnerAt("ripe", at(4, 4), 1, { hatchRadius: 1 })],
      },
    );
    const result = hatch(crowded, ctxFor(3), DEPS);
    expect(bugsOf(result.state).map((b) => b.pos)).toEqual([at(4, 5)]);
    const boxed = missionWith(
      openField()
        .wall(at(4, 4), "n", "solid")
        .wall(at(4, 4), "e", "solid")
        .wall(at(4, 4), "s", "solid")
        .wall(at(4, 4), "w", "solid")
        .build(),
      [],
      { phase: "bugs", spawners: [spawnerAt("ripe", at(4, 4), 1)] },
    );
    const none = hatch(boxed, ctxFor(3), DEPS);
    expect(none.state.units).toEqual([]);
    expect(none.events).toEqual([]);
    expect(none.state.spawners[0]?.timer).toBe(T.hatchInterval);
  });
});

// ===========================================
// Escalation
// ===========================================

describe("waveInterval and waveSize", () => {
  it("shorten the interval and grow the wave with difficulty, threat and waves so far, within the bounds", () => {
    expect(waveInterval(1, 0, T)).toBe(4);
    expect(waveInterval(3, 0, T)).toBe(3);
    expect(waveInterval(1, 100, T)).toBe(3);
    expect(waveInterval(3, 100, T)).toBe(2);
    expect(waveInterval(9, 100, T)).toBe(T.minWaveInterval);
    expect(waveInterval(0, -5, T)).toBe(4);
    expect(waveSize(0, 1, 0, T)).toBe(2);
    expect(waveSize(1, 1, 0, T)).toBe(3);
    expect(waveSize(0, 3, 0, T)).toBe(4);
    expect(waveSize(0, 1, 100, T)).toBe(4);
    expect(waveSize(0, 1, 50, T)).toBe(3);
    expect(waveSize(10, 5, 100, T)).toBe(T.maxWaveSize);
  });
});

// ===========================================
// Edge waves
// ===========================================

describe("edgeWave", () => {
  it("waits for its turn and does nothing outside the bug phase", () => {
    const early = missionWith(fieldWithEdges(), [], {
      phase: "bugs",
      turn: 2,
      edgeSpawn: { nextTurn: 3, wave: 0 },
    });
    expect(edgeWave(early, ctxFor(1), DEPS).state).toBe(early);
    const player = missionWith(fieldWithEdges(), [], {
      turn: 3,
      edgeSpawn: { nextTurn: 3, wave: 0 },
    });
    expect(edgeWave(player, ctxFor(1), DEPS).state).toBe(player);
  });

  it("brings a wave onto one edge hook facing inward and schedules the next", () => {
    const map = fieldWithEdges();
    const mission = missionWith(map, [], {
      phase: "bugs",
      turn: 3,
      edgeSpawn: { nextTurn: 3, wave: 0 },
    });
    const hookIds = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) {
      const result = edgeWave(mission, ctxFor(seed), DEPS);
      expect(result).toEqual(edgeWave(mission, ctxFor(seed), DEPS));
      const bugs = bugsOf(result.state);
      expect(bugs).toHaveLength(2);
      const hook = map.hooks.edgeSpawns.find((h) =>
        bugs.every((b) =>
          h.tiles.some((t) => t.x === b.pos.x && t.z === b.pos.z),
        ),
      );
      expect(hook).toBeDefined();
      if (!hook) return;
      hookIds.add(hook.id);
      const inward = hook.tiles[0]?.x === 0 ? "e" : "w";
      expect(bugs.map((b) => b.facing)).toEqual([inward, inward]);
      expect(bugs.map((b) => b.ap)).toEqual([0, 0]);
      expect(result.state.edgeSpawn).toEqual({ nextTurn: 7, wave: 1 });
      expect(result.events).toEqual([
        {
          type: BUGS_SPAWNED,
          payload: {
            unitIds: bugs.map((b) => b.id),
            source: "edge",
            sourceId: hook.id,
          },
        },
      ]);
    }
    expect(hookIds.size).toBe(2);
    expect(mission.units).toEqual([]);
  });

  it("escalates with the waves so far, difficulty and threat, capped by the hook's free tiles", () => {
    const mission = missionWith(
      fieldWithEdges(),
      [unitAt("u", "infantry", at(0, 2)), unitAt("v", "infantry", at(7, 2))],
      {
        phase: "bugs",
        turn: 9,
        difficulty: 3,
        threat: 100,
        edgeSpawn: { nextTurn: 9, wave: 2 },
      },
    );
    const result = edgeWave(mission, ctxFor(2), DEPS);
    const bugs = bugsOf(result.state);
    expect(waveSize(2, 3, 100, T)).toBe(8);
    expect(bugs).toHaveLength(3);
    expect(bugs.some((b) => b.pos.z === 2)).toBe(false);
    expect(result.state.edgeSpawn).toEqual({ nextTurn: 11, wave: 3 });
  });

  it("moves the schedule on even with no hook or no room, without an event", () => {
    const noHooks = missionWith(openField().build(), [], {
      phase: "bugs",
      turn: 3,
      edgeSpawn: { nextTurn: 3, wave: 0 },
    });
    const skipped = edgeWave(noHooks, ctxFor(1), DEPS);
    expect(skipped.state.units).toEqual([]);
    expect(skipped.events).toEqual([]);
    expect(skipped.state.edgeSpawn).toEqual({ nextTurn: 7, wave: 1 });
    const full = missionWith(
      openField()
        .edgeSpawn([at(0, 2)])
        .build(),
      [unitAt("u", "infantry", at(0, 2))],
      { phase: "bugs", turn: 3, edgeSpawn: { nextTurn: 3, wave: 0 } },
    );
    const blocked = edgeWave(full, ctxFor(1), DEPS);
    expect(bugsOf(blocked.state)).toEqual([]);
    expect(blocked.events).toEqual([]);
    expect(blocked.state.edgeSpawn).toEqual({ nextTurn: 7, wave: 1 });
  });
});

// ===========================================
// On the turn boundary
// ===========================================

describe("as phase steps on EndTurn", () => {
  it("hatches and lands the wave after the refresh, so old bugs act now and new ones next phase", () => {
    const handler = createEndTurnHandler([
      ...DEFAULT_PHASE_STEPS,
      createHatchStep(DEPS),
      createEdgeWaveStep(DEPS),
    ]);
    const mission = missionWith(
      fieldWithEdges(),
      [
        unitAt("u", "infantry", at(7, 7)),
        unitAt("old", "infantry", at(4, 0), { team: "bugs", ap: 0 }),
      ],
      {
        turn: 3,
        spawners: [spawnerAt("ripe", at(4, 4), 1)],
        edgeSpawn: { nextTurn: 3, wave: 0 },
      },
    );
    const outcome = handler(mission, endTurn(), ctxFor(5));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const next = outcome.value.state;
    expect(next.phase).toBe("bugs");
    expect(outcome.value.events.map((e) => e.type)).toEqual([
      TURN_STARTED,
      BUGS_SPAWNED,
      BUGS_SPAWNED,
    ]);
    expect(
      outcome.value.events.map((e) =>
        e.type === BUGS_SPAWNED ? e.payload.source : e.type,
      ),
    ).toEqual([TURN_STARTED, "spawner", "edge"]);
    expect(next.units.find((u) => u.id === "old")?.ap).toBe(2);
    expect(
      bugsOf(next)
        .filter((u) => u.id !== "old")
        .map((u) => u.ap),
    ).toEqual([0, 0, 0, 0]);
    expect(next.spawners[0]?.timer).toBe(T.hatchInterval);
    expect(next.edgeSpawn).toEqual({ nextTurn: 7, wave: 1 });
  });
});
