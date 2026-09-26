import { describe, expect, it } from "vitest";

import type { SpeciesMix } from "../../bugs/model/species-mix";
import { manhattanDistance } from "../../core/service/grid-math";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { snapshotMap } from "../../mapgen/service/hatch-space";
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
  surgedSize,
  surgeRoom,
  waveInterval,
  waveSize,
} from "./spawn-service";
import { footprintTiles } from "./footprint-service";
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
  sightRange: 12,
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
/** A species on a 2×2 block (#1130). */
const BIG: SpawnSource = { ...BRUTE, id: "big", name: "Big", footprint: 2 };

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
            wave: 1,
          },
        },
      ]);
    }
    expect(hookIds.size).toBe(2);
    expect(mission.units).toEqual([]);
  });

  it("never rolls a species of weight 0, and brings nobody when every weight is 0 (#1179)", () => {
    // A species can ship at weight 0 — the spitter does, until the
    // campaign's bestiary mixes it in — and must then never arrive by
    // the default roll. Held back last in the list, where a roll that
    // lands exactly on the running total would otherwise fall through
    // to it.
    const held: SpawnSource = { ...SWARMER, id: "held", hatchWeight: 0 };
    const mission = missionWith(fieldWithEdges(), [], {
      phase: "bugs",
      turn: 9,
      difficulty: 5,
      edgeSpawn: { nextTurn: 9, wave: 3 },
    });
    for (let seed = 1; seed <= 12; seed++) {
      const result = edgeWave(mission, ctxFor(seed), {
        species: [SWARMER, BRUTE, held],
        tuning: T,
      });
      const ids = bugsOf(result.state).map((b) => b.sourceId);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).not.toContain("held");
    }
    // Nothing to roll: the wave is skipped rather than the roll failing.
    const none = edgeWave(mission, ctxFor(1), { species: [held], tuning: T });
    expect(bugsOf(none.state)).toEqual([]);
    expect(none.events).toEqual([]);
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

// ===========================================
// Footprints (#1130)
// ===========================================

describe("hatching a species on a 2×2 block (#1130)", () => {
  it("puts each block where all four tiles stand free, off the spawner and off each other, for every seed", () => {
    const mission = missionWith(openField().build(), [], {
      phase: "bugs",
      spawners: [spawnerAt("ripe", at(4, 4), 1)],
    });
    const bigOnly: SpawnDeps = { species: [BIG], tuning: T };
    let hatched = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const result = hatch(mission, ctxFor(seed), bigOnly);
      const bugs = bugsOf(result.state);
      // Two blocks do not always both fit around the drawn tiles; one
      // always does on an open field, and a block that does not fit is
      // simply not hatched.
      expect(bugs.length).toBeGreaterThanOrEqual(1);
      expect(bugs.length).toBeLessThanOrEqual(T.hatchCount);
      hatched += bugs.length;
      const held = new Set<string>();
      for (const bug of bugs) {
        expect(result.state.templates[bug.templateId]?.footprint).toBe(2);
        for (const tile of footprintTiles(bug.pos, 2)) {
          expect(tile.x).toBeLessThan(8);
          expect(tile.z).toBeLessThan(8);
          expect(tile).not.toEqual(at(4, 4));
          const key = `${String(tile.x)},${String(tile.z)}`;
          expect(held.has(key)).toBe(false);
          held.add(key);
        }
        // The drawn tile is one of the block's, so the block hatches
        // within the spawner's room.
        expect(
          footprintTiles(bug.pos, 2).some(
            (tile) => manhattanDistance(tile, at(4, 4)) <= 2,
          ),
        ).toBe(true);
      }
      expect(hatch(mission, ctxFor(seed), bigOnly)).toEqual(result);
    }
    expect(hatched).toBeGreaterThan(8);
  });

  it("hatches nothing on a block where no block fits, while a single tile still hatches", () => {
    // Walls on every east edge cut the field into one-wide corridors.
    const builder = openField();
    for (let x = 0; x < 7; x++) {
      for (let z = 0; z < 8; z++) {
        builder.wall(at(x, z), "e", "solid");
      }
    }
    const mission = missionWith(builder.build(), [], {
      phase: "bugs",
      spawners: [spawnerAt("ripe", at(4, 4), 1)],
    });
    const none = hatch(mission, ctxFor(2), { species: [BIG], tuning: T });
    expect(none.state.units).toEqual([]);
    expect(none.events).toEqual([]);
    expect(none.state.spawners[0]?.timer).toBe(T.hatchInterval);
    const small = hatch(mission, ctxFor(2), { species: [SWARMER], tuning: T });
    expect(bugsOf(small.state)).toHaveLength(T.hatchCount);
  });

  it("never lands a later hatchling inside an earlier block", () => {
    // One spawner, a block and then swarmers from the same roll of tiles:
    // a swarmer whose drawn tile the block took is skipped, not stacked.
    const mission = missionWith(openField().build(), [], {
      phase: "bugs",
      spawners: [spawnerAt("ripe", at(4, 4), 1, { hatchRadius: 3 })],
    });
    const mixed: SpawnDeps = {
      species: [BIG, { ...SWARMER, hatchWeight: 6 }],
      tuning: { ...T, hatchCount: 6 },
    };
    for (let seed = 1; seed <= 12; seed++) {
      const result = hatch(mission, ctxFor(seed), mixed);
      const held = new Set<string>();
      for (const bug of bugsOf(result.state)) {
        const size = result.state.templates[bug.templateId]?.footprint ?? 1;
        for (const tile of footprintTiles(bug.pos, size)) {
          const key = `${String(tile.x)},${String(tile.z)}`;
          expect([seed, key, held.has(key)]).toEqual([seed, key, false]);
          held.add(key);
        }
      }
    }
  });
});

// ===========================================
// Counted waves (#1175)
// ===========================================

describe("edgeWave with a wave total (#1175)", () => {
  it("sends a wave on its turn whether or not the last one is dead, stamped with its number", () => {
    const mission = missionWith(
      fieldWithEdges(),
      [unitAt("survivor", "infantry", at(3, 6), { team: "bugs" })],
      {
        phase: "bugs",
        turn: 7,
        edgeSpawn: { nextTurn: 7, wave: 1, totalWaves: 3 },
      },
    );
    const result = edgeWave(mission, ctxFor(3), DEPS);
    expect(result.state.edgeSpawn).toEqual({
      nextTurn: 11,
      wave: 2,
      totalWaves: 3,
    });
    expect(bugsOf(result.state).length).toBeGreaterThan(1);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: BUGS_SPAWNED,
      payload: { source: "edge", wave: 2, totalWaves: 3 },
    });
  });

  it("falls quiet once every promised wave has landed, leaving the schedule alone", () => {
    const mission = missionWith(fieldWithEdges(), [], {
      phase: "bugs",
      turn: 15,
      edgeSpawn: { nextTurn: 15, wave: 3, totalWaves: 3 },
    });
    const result = edgeWave(mission, ctxFor(3), DEPS);
    expect(result.state).toBe(mission);
    expect(result.events).toEqual([]);
  });
});

// ===========================================
// The mission's species mix (ADR 0013 §2.6, #1179)
// ===========================================

describe("rolling species by the mission's bug mix (#1179)", () => {
  const LURKER: SpawnSource = { ...SWARMER, id: "lurker", hatchWeight: 3 };
  /** One-tile brute, so a roll is never lost to a block that does not fit. */
  const SMALL_BRUTE: SpawnSource = { ...SWARMER, id: "brute", hatchWeight: 1 };
  /** Weight 0 like the shipped spitter, and last in the list. */
  const SPITTER: SpawnSource = { ...SWARMER, id: "spitter", hatchWeight: 0 };
  const FOUR: SpawnDeps = {
    species: [SWARMER, LURKER, SMALL_BRUTE, SPITTER],
    tuning: { ...T, hatchCount: 6 },
  };

  /** A spawner about to hatch, with room for ten on an open field. */
  function ripe(bugMix?: SpeciesMix): TacticalState {
    const mission = missionWith(openField().build(), [], {
      phase: "bugs",
      spawners: [spawnerAt("ripe", at(4, 4), 1, { hatchRadius: 3 })],
    });
    return bugMix === undefined ? mission : { ...mission, bugMix };
  }

  /** An edge wave due now on the two-hook field. */
  function due(bugMix?: SpeciesMix): TacticalState {
    const mission = missionWith(fieldWithEdges(), [], {
      phase: "bugs",
      turn: 9,
      difficulty: 5,
      edgeSpawn: { nextTurn: 9, wave: 3 },
    });
    return bugMix === undefined ? mission : { ...mission, bugMix };
  }

  /** Each bug as `species@x,z`, in the order they were placed. */
  function signature(mission: TacticalState): string {
    return bugsOf(mission)
      .map((b) => `${b.sourceId}@${String(b.pos.x)},${String(b.pos.z)}`)
      .join(" ");
  }

  it("rolls exactly the pre-bestiary sequence when the mission has no mix", () => {
    // Recorded from spawn-service before the bestiary landed: one
    // hatch-weight roll per bug, the weight-0 species never drawn.
    const before: Record<string, string> = {
      "hatch 1":
        "lurker@5,2 swarmer@3,6 swarmer@3,3 lurker@6,3 swarmer@3,4 lurker@2,5",
      "edge 1": "swarmer@0,5 swarmer@0,2 swarmer@0,3 swarmer@0,4",
      "hatch 2":
        "swarmer@5,6 swarmer@4,7 lurker@4,5 lurker@7,4 brute@3,3 swarmer@6,5",
      "edge 2": "lurker@0,2 swarmer@0,5 brute@0,4 lurker@0,3",
      "hatch 3":
        "swarmer@5,4 swarmer@6,3 swarmer@5,3 brute@6,5 brute@2,3 lurker@3,6",
      "edge 3": "swarmer@0,2 swarmer@0,3 swarmer@0,4 swarmer@0,5",
      "hatch 4":
        "swarmer@4,3 swarmer@3,3 lurker@4,6 swarmer@4,7 brute@4,5 lurker@2,3",
      "edge 4": "swarmer@7,5 swarmer@7,2 swarmer@7,4 lurker@7,3",
      "hatch 5":
        "lurker@5,2 swarmer@6,5 swarmer@3,3 swarmer@4,2 swarmer@3,6 brute@6,3",
      "edge 5": "lurker@0,5 swarmer@0,4 swarmer@0,3 swarmer@0,2",
      "hatch 6":
        "swarmer@2,4 swarmer@2,5 swarmer@7,4 swarmer@4,5 swarmer@1,4 lurker@4,1",
      "edge 6": "swarmer@0,5 swarmer@0,4 swarmer@0,2 brute@0,3",
    };
    for (let seed = 1; seed <= 6; seed++) {
      const hatched = hatch(ripe(), ctxFor(seed), FOUR).state;
      expect(signature(hatched)).toBe(before[`hatch ${String(seed)}`]);
      const landed = edgeWave(due(), ctxFor(seed), FOUR).state;
      expect(signature(landed)).toBe(before[`edge ${String(seed)}`]);
    }
  });

  it("follows the mix's weights over 500 seeded rolls, a hatch-weight-0 species included", () => {
    // Far from the hatch weights (6:3:1:0), so a roll that ignored the
    // mix could not land inside the tolerance. One roll on each of 500
    // seeds, so every roll comes from its own stream.
    const mix: SpeciesMix = {
      swarmer: 0.2,
      lurker: 0.1,
      brute: 0.3,
      spitter: 0.4,
    };
    const deps: SpawnDeps = { ...FOUR, tuning: { ...T, hatchCount: 1 } };
    const counts = new Map<string, number>();
    let rolled = 0;
    for (let seed = 1; seed <= 500; seed++) {
      for (const bug of bugsOf(hatch(ripe(mix), ctxFor(seed), deps).state)) {
        counts.set(bug.sourceId, (counts.get(bug.sourceId) ?? 0) + 1);
        rolled += 1;
      }
    }
    expect(rolled).toBe(500);
    for (const [id, share] of Object.entries(mix)) {
      const seen = (counts.get(id) ?? 0) / rolled;
      // Three standard errors of a share over 500 independent rolls:
      // 0.04 for the lurker's 0.1, 0.066 for the spitter's 0.4.
      const tolerance = 3 * Math.sqrt((share * (1 - share)) / rolled);
      expect(Math.abs(seen - share), id).toBeLessThanOrEqual(tolerance);
    }
  });

  it("brings an edge wave from the mix too", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const ids = bugsOf(
        edgeWave(due({ spitter: 1 }), ctxFor(seed), FOUR).state,
      ).map((b) => b.sourceId);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids)).toEqual(new Set(["spitter"]));
    }
  });

  it("never rolls a species the mix leaves out or weighs at 0, whatever its hatch weight", () => {
    // The swarmer has the largest hatch weight; the spitter, weighed at
    // 0 and last in the list, is where a roll on the running total
    // would fall through to.
    for (let seed = 1; seed <= 12; seed++) {
      const ids = bugsOf(
        hatch(ripe({ brute: 2, lurker: 1, spitter: 0 }), ctxFor(seed), FOUR)
          .state,
      ).map((b) => b.sourceId);
      expect(ids).toHaveLength(6);
      expect(ids.filter((id) => id !== "brute" && id !== "lurker")).toEqual([]);
    }
  });

  it("skips a species the mix names that spawning cannot build, and falls back to hatch weight when that leaves nothing", () => {
    const noSpitter: SpawnDeps = {
      ...FOUR,
      species: [SWARMER, LURKER, SMALL_BRUTE],
    };
    for (let seed = 1; seed <= 6; seed++) {
      const ids = bugsOf(
        hatch(ripe({ spitter: 0.9, lurker: 0.1 }), ctxFor(seed), noSpitter)
          .state,
      ).map((b) => b.sourceId);
      expect(ids).toEqual(Array.from({ length: 6 }, () => "lurker"));
      // A mix of nothing it can build, or of nothing but zeros, rolls
      // as an old mission would rather than failing the roll.
      const old = signature(hatch(ripe(), ctxFor(seed), noSpitter).state);
      const lost = hatch(ripe({ spitter: 1 }), ctxFor(seed), noSpitter);
      expect(signature(lost.state)).toBe(old);
      const zeros = hatch(
        ripe({ swarmer: 0, lurker: 0 }),
        ctxFor(seed),
        noSpitter,
      );
      expect(signature(zeros.state)).toBe(old);
    }
  });

  it("replays the same bugs for a seed with the same mix", () => {
    const mix: SpeciesMix = { swarmer: 0.5, spitter: 0.5 };
    for (let seed = 1; seed <= 4; seed++) {
      const once = hatch(ripe(mix), ctxFor(seed), FOUR);
      expect(hatch(ripe(mix), ctxFor(seed), FOUR)).toEqual(once);
      expect(once.state.bugMix).toBe(mix);
    }
  });
});

// ===========================================
// Sitrep hooks (campaign arc §11)
// ===========================================

describe("a spawner's hatch bonus (Hardened Clutches)", () => {
  it("releases hatchCount plus the bonus, and exactly hatchCount without one", () => {
    const withBonus = missionWith(openField().build(), [], {
      phase: "bugs",
      spawners: [spawnerAt("ripe", at(4, 4), 1, { hatchBonus: 1 })],
    });
    const plain = missionWith(openField().build(), [], {
      phase: "bugs",
      spawners: [spawnerAt("ripe", at(4, 4), 1)],
    });
    for (let seed = 1; seed <= 5; seed++) {
      expect(bugsOf(hatch(withBonus, ctxFor(seed), DEPS).state)).toHaveLength(
        T.hatchCount + 1,
      );
      expect(bugsOf(hatch(plain, ctxFor(seed), DEPS).state)).toHaveLength(
        T.hatchCount,
      );
    }
  });
});

describe("surgedSize / surgeRoom (Swarm Tide)", () => {
  it("scales a wave by the surge, rounding up, and leaves it alone without one", () => {
    const surge = { sizeScale: 1.5, spillRadius: 2 };
    expect(surgedSize(2, surge)).toBe(3);
    expect(surgedSize(5, surge)).toBe(8);
    expect(surgedSize(8, surge)).toBe(12);
    expect(surgedSize(0, surge)).toBe(0);
    expect(surgedSize(5)).toBe(5);
  });

  it("lists the zone first, then the ground within the radius of it, each tile once", () => {
    const map = openField().build();
    const snapshot = snapshotMap(map);
    const zone = [at(0, 2), at(0, 3)].map((c) => snapshot.index.getAt(c)!);
    const room = surgeRoom(snapshot, zone, 1);
    expect(room.slice(0, 2)).toEqual(zone);
    const keys = room.map((t) => `${String(t.x)},${String(t.z)}`);
    expect(new Set(keys).size).toBe(keys.length);
    // (0,1) (1,2) (1,3) (0,4) beside the two zone tiles.
    expect([...keys].sort()).toEqual(
      ["0,1", "0,2", "0,3", "0,4", "1,2", "1,3"].sort(),
    );
    expect(surgeRoom(snapshot, zone, 0)).toEqual(zone);
  });
});

describe("edgeWave under a surge (Swarm Tide)", () => {
  it("lands the surged size, spilling past a zone too small for it", () => {
    const surge = { sizeScale: 1.5, spillRadius: 2 };
    const oneTile = openField()
      .edgeSpawn([at(0, 2)])
      .build();
    const plain = missionWith(oneTile, [], {
      phase: "bugs",
      turn: 3,
      edgeSpawn: { nextTurn: 3, wave: 0 },
    });
    const surging = {
      ...plain,
      edgeSpawn: { ...plain.edgeSpawn, surge },
    };
    for (let seed = 1; seed <= 6; seed++) {
      // A one-tile zone holds one of the plain wave's two.
      expect(bugsOf(edgeWave(plain, ctxFor(seed), DEPS).state)).toHaveLength(1);
      const result = edgeWave(surging, ctxFor(seed), DEPS);
      const bugs = bugsOf(result.state);
      expect(bugs).toHaveLength(surgedSize(waveSize(0, 1, 0, T), surge));
      for (const bug of bugs) {
        expect(manhattanDistance(bug.pos, at(0, 2))).toBeLessThanOrEqual(2);
      }
      // The surge stays on the schedule for every later wave.
      expect(result.state.edgeSpawn).toEqual({ nextTurn: 7, wave: 1, surge });
    }
  });

  it("draws exactly as before when the schedule has no surge", () => {
    const mission = missionWith(fieldWithEdges(), [], {
      phase: "bugs",
      turn: 3,
      edgeSpawn: { nextTurn: 3, wave: 0 },
    });
    const surged = {
      ...mission,
      edgeSpawn: {
        ...mission.edgeSpawn,
        surge: { sizeScale: 1, spillRadius: 0 },
      },
    };
    for (let seed = 1; seed <= 6; seed++) {
      const a = edgeWave(mission, ctxFor(seed), DEPS);
      const b = edgeWave(surged, ctxFor(seed), DEPS);
      expect(bugsOf(b.state)).toEqual(bugsOf(a.state));
    }
  });
});
