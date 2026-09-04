import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { MissionCampaignState } from "../model/mission-campaign-state";
import type { MOVE } from "../model/move-command";
import { move } from "../model/move-command";
import { createMoveHandler } from "./move-handler";
import { liftTacticalHandler } from "./tactical-command-handlers";
import type { TacticalState } from "../model/tactical-state";
import { NO_VISION } from "../model/tactical-state";
import { UNIT_LOST } from "../model/unit-lost-event";
import { UNIT_SPOTTED } from "../model/unit-spotted-event";
import type { Spawner } from "../model/tactical-state";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import {
  canSee,
  computeVision,
  emptyVision,
  initialVision,
  perceivedSpawners,
  perceivedUnits,
  withVision,
} from "./vision-service";
import {
  missionWith,
  openField,
  ridgedField,
  unitAt,
  walledField,
} from "./tactical-fixtures.test-helper";

/** An intact egg spawner on a tile, for the vision fixtures. */
function spawnerAt(id: string, pos: TileCoord): Spawner {
  return { id, pos, hatchRadius: 2, hp: 20, timer: 3, destroyed: false };
}

// ===========================================
// Fixtures
// ===========================================

const OPEN = openField().build();
const WALLED = walledField();
const RIDGED = ridgedField();

/** Every fixture template sees 8 tiles. */
const SIGHT = 8;

function at(x: number, z: number): { x: number; y: number; z: number } {
  return { x, y: 0, z };
}

// ===========================================
// computeVision
// ===========================================

describe("computeVision", () => {
  it("sees the tiles within sight range and nothing beyond it", () => {
    const mission = missionWith(OPEN, [unitAt("u", "infantry", at(0, 0))]);
    const index = new TileIndex(OPEN);
    const { visible } = computeVision(mission, "tdf", index);
    const seen = new Set(visible);

    expect(seen.has(index.keyOf(at(0, 0)))).toBe(true);
    expect(seen.has(index.keyOf(at(0, SIGHT - 1)))).toBe(true);
    // The 8x8 fixture is smaller than the sight range in one direction,
    // so the far corner is out of range by manhattan distance, not by map.
    expect(seen.has(index.keyOf(at(7, 7)))).toBe(false);
  });

  it("does not see through a wall", () => {
    const mission = missionWith(WALLED, [unitAt("u", "infantry", at(0, 0))]);
    const index = new TileIndex(WALLED);
    const seen = new Set(computeVision(mission, "tdf", index).visible);
    expect(seen.has(index.keyOf(at(2, 0)))).toBe(true);
    // The wall sits between x = 3 and x = 4 and nothing sees through it.
    expect(seen.has(index.keyOf(at(4, 0)))).toBe(false);
  });

  it("spots an enemy standing in view and not one behind the wall", () => {
    const mission = missionWith(WALLED, [
      unitAt("u", "infantry", at(0, 0)),
      unitAt("near", "infantry", at(2, 0), { team: "bugs" }),
      unitAt("far", "infantry", at(5, 0), { team: "bugs" }),
    ]);
    expect(computeVision(mission, "tdf").spotted).toEqual(["near"]);
  });

  it("does not see across a hill, which has no tile to read (#593)", () => {
    const mission = missionWith(RIDGED, [unitAt("u", "infantry", at(0, 0))]);
    const index = new TileIndex(RIDGED);
    const seen = new Set(computeVision(mission, "tdf", index).visible);
    expect(seen.has(index.keyOf(at(3, 0)))).toBe(true);
    // The ridge stands on x = 4 and fog now hides what is behind it.
    expect(seen.has(index.keyOf(at(5, 0)))).toBe(false);
  });

  it("spots a bug in front of that hill and not one behind it", () => {
    const mission = missionWith(RIDGED, [
      unitAt("u", "infantry", at(0, 0)),
      unitAt("near", "infantry", at(3, 0), { team: "bugs" }),
      unitAt("far", "infantry", at(5, 0), { team: "bugs" }),
    ]);
    expect(computeVision(mission, "tdf").spotted).toEqual(["near"]);
  });

  it("spots both of them from the crest of that hill", () => {
    // Taking the high ground is what un-hides the far side, which is the
    // point of making terrain block at all.
    const mission = missionWith(RIDGED, [
      unitAt("u", "infantry", { x: 4, y: 2, z: 0 }),
      unitAt("near", "infantry", at(3, 0), { team: "bugs" }),
      unitAt("far", "infantry", at(5, 0), { team: "bugs" }),
    ]);
    expect(computeVision(mission, "tdf").spotted).toEqual(["near", "far"]);
  });

  it("sees nothing through a dead unit's eyes", () => {
    const mission = missionWith(OPEN, [
      unitAt("u", "infantry", at(0, 0), { hp: 0 }),
      unitAt("b", "infantry", at(1, 0), { team: "bugs" }),
    ]);
    const vision = computeVision(mission, "tdf");
    expect([vision.visible, vision.spotted]).toEqual([[], []]);
  });

  it("never spots a corpse", () => {
    const mission = missionWith(OPEN, [
      unitAt("u", "infantry", at(0, 0)),
      unitAt("b", "infantry", at(1, 0), { team: "bugs", hp: 0 }),
    ]);
    expect(computeVision(mission, "tdf").spotted).toEqual([]);
  });

  it("is deterministic: the same mission always sees the same thing", () => {
    const mission = missionWith(WALLED, [
      unitAt("u", "infantry", at(1, 1)),
      unitAt("b", "infantry", at(2, 2), { team: "bugs" }),
    ]);
    expect(computeVision(mission, "tdf")).toEqual(
      computeVision(mission, "tdf"),
    );
  });
});

// ===========================================
// withVision
// ===========================================

describe("withVision", () => {
  /** A mission with the bug just out of sight behind the wall. */
  function hidden(): TacticalState {
    return {
      ...missionWith(WALLED, [
        unitAt("u", "infantry", at(0, 0)),
        unitAt("b", "infantry", at(5, 0), { team: "bugs" }),
      ]),
      vision: emptyVision(),
    };
  }

  it("raises UnitSpotted the first time an enemy comes into view", () => {
    const start = withVision({ state: hidden(), events: [] });
    expect(canSee(start.state, "tdf", "b")).toBe(false);

    // Walk the bug around to the near side of the wall.
    const moved: TacticalState = {
      ...start.state,
      units: start.state.units.map((unit) =>
        unit.id === "b" ? { ...unit, pos: at(2, 0) } : unit,
      ),
    };
    const after = withVision({ state: moved, events: [] });

    expect(canSee(after.state, "tdf", "b")).toBe(true);
    expect(after.events).toContainEqual({
      type: UNIT_SPOTTED,
      payload: { team: "tdf", unitId: "b" },
    });
  });

  it("raises UnitLost when the enemy goes back out of view", () => {
    const seen = withVision({
      state: {
        ...missionWith(WALLED, [
          unitAt("u", "infantry", at(0, 0)),
          unitAt("b", "infantry", at(2, 0), { team: "bugs" }),
        ]),
        vision: emptyVision(),
      },
      events: [],
    });
    expect(canSee(seen.state, "tdf", "b")).toBe(true);

    const gone: TacticalState = {
      ...seen.state,
      units: seen.state.units.map((unit) =>
        unit.id === "b" ? { ...unit, pos: at(5, 0) } : unit,
      ),
    };
    const after = withVision({ state: gone, events: [] });
    expect(after.events).toContainEqual({
      type: UNIT_LOST,
      payload: { team: "tdf", unitId: "b" },
    });
    expect(canSee(after.state, "tdf", "b")).toBe(false);
  });

  it("says nothing when what each side can see has not changed", () => {
    const first = withVision({ state: hidden(), events: [] });
    const again = withVision({ state: first.state, events: [] });
    expect(again.events).toEqual([]);
  });

  it("keeps the events it was handed, and adds to them", () => {
    const applied = withVision({
      state: hidden(),
      events: [
        {
          type: "tactical:turn-started",
          payload: { turn: 2, phase: "player" },
        },
      ],
    });
    expect(applied.events[0]?.type).toBe("tactical:turn-started");
  });

  it("grows explored and never shrinks it", () => {
    const start = withVision({ state: hidden(), events: [] });
    const exploredFirst = start.state.vision.tdf.explored;
    expect(exploredFirst.length).toBeGreaterThan(0);

    // Walk the watcher away; what it saw stays explored.
    const walked: TacticalState = {
      ...start.state,
      units: start.state.units.map((unit) =>
        unit.id === "u" ? { ...unit, pos: at(0, 7) } : unit,
      ),
    };
    const after = withVision({ state: walked, events: [] });
    for (const key of exploredFirst) {
      expect(after.state.vision.tdf.explored).toContain(key);
    }
    expect(after.state.vision.tdf.explored.length).toBeGreaterThanOrEqual(
      exploredFirst.length,
    );
    // And what it can see now is a smaller thing than what it remembers.
    expect(after.state.vision.tdf.visible.length).toBeLessThanOrEqual(
      after.state.vision.tdf.explored.length,
    );
  });

  it("recomputes rather than trusting what it was handed (ADR 0006 §2.5)", () => {
    const lying: TacticalState = {
      ...hidden(),
      vision: {
        tdf: {
          visible: [1, 2, 3],
          explored: [1, 2, 3],
          spotted: ["b"],
          lastSeen: {},
        },
        bugs: NO_VISION,
      },
    };
    const after = withVision({ state: lying, events: [] });
    // The bug is behind the wall: a hand-edited save cannot reveal it.
    expect(after.state.vision.tdf.spotted).toEqual([]);
    expect(after.state.vision.tdf.visible).not.toEqual([1, 2, 3]);
    // Only explored is carried, because it cannot be recomputed.
    expect(after.state.vision.tdf.explored).toContain(1);
  });

  it("skips the recompute when nothing it reads has changed", () => {
    const seen = withVision({ state: hidden(), events: [] });
    // A shot that hurts without killing, and a spent action: neither
    // changes who can see what, so the previous vision is handed back.
    const hurt: TacticalState = {
      ...seen.state,
      units: seen.state.units.map((unit) =>
        unit.id === "b" ? { ...unit, hp: unit.hp - 1, ap: 0 } : unit,
      ),
    };
    const after = withVision({ state: hurt, events: [] }, seen.state);
    expect(after.state.vision).toBe(seen.state.vision);
    expect(after.events).toEqual([]);
  });

  it("still recomputes when a unit moves, dies or leaves", () => {
    const seen = withVision({ state: hidden(), events: [] });
    const moved: TacticalState = {
      ...seen.state,
      units: seen.state.units.map((unit) =>
        unit.id === "b" ? { ...unit, pos: at(2, 0) } : unit,
      ),
    };
    expect(
      canSee(
        withVision({ state: moved, events: [] }, seen.state).state,
        "tdf",
        "b",
      ),
    ).toBe(true);

    const died: TacticalState = {
      ...seen.state,
      units: seen.state.units.map((unit) =>
        unit.id === "u" ? { ...unit, hp: 0 } : unit,
      ),
    };
    expect(
      withVision({ state: died, events: [] }, seen.state).state.vision.tdf
        .visible,
    ).toEqual([]);

    const left: TacticalState = {
      ...seen.state,
      units: seen.state.units.filter((unit) => unit.id !== "u"),
    };
    expect(
      withVision({ state: left, events: [] }, seen.state).state.vision.tdf
        .visible,
    ).toEqual([]);
  });

  it("computes both sides, not just the player's", () => {
    const after = withVision({ state: hidden(), events: [] });
    expect(after.state.vision.bugs.visible.length).toBeGreaterThan(0);
  });
});

// ===========================================
// Views
// ===========================================

describe("perceivedUnits", () => {
  it("keeps a side's own units and the enemies it can see", () => {
    const mission = withVision({
      state: {
        ...missionWith(WALLED, [
          unitAt("u", "infantry", at(0, 0)),
          unitAt("near", "infantry", at(2, 0), { team: "bugs" }),
          unitAt("far", "infantry", at(5, 0), { team: "bugs" }),
        ]),
        vision: emptyVision(),
      },
      events: [],
    }).state;

    expect(perceivedUnits(mission, "tdf").map((u) => u.id)).toEqual([
      "u",
      "near",
    ]);
  });
});

// ===========================================
// initialVision
// ===========================================

describe("initialVision", () => {
  it("gives a mission its first look before anything moves", () => {
    const base = missionWith(OPEN, [
      unitAt("u", "infantry", at(0, 0)),
      unitAt("b", "infantry", at(1, 0), { team: "bugs" }),
    ]);
    const { vision: _drop, ...withoutVision } = base;
    const vision = initialVision(withoutVision);
    expect(vision.tdf.spotted).toEqual(["b"]);
    expect(vision.tdf.explored.length).toBeGreaterThan(0);
    expect(vision.bugs.spotted).toEqual(["u"]);
  });
});

// ===========================================
// Wiring
// ===========================================

describe("the lifting adapter recomputes vision", () => {
  /** A campaign holding one fixture mission with the bug behind the wall. */
  function campaign(): MissionCampaignState & { activeMission: TacticalState } {
    const mission = withVision({
      state: {
        ...missionWith(WALLED, [
          unitAt("u", "infantry", at(0, 0)),
          unitAt("b", "infantry", at(5, 0), { team: "bugs" }),
        ]),
        vision: emptyVision(),
      },
      events: [],
    }).state;
    return {
      meta: {
        rng: { algorithm: "mulberry32", seed: 1, state: 1 },
        ids: { counters: {} },
      },
      overworld: {} as MissionCampaignState["overworld"],
      roster: {} as MissionCampaignState["roster"],
      economy: {} as MissionCampaignState["economy"],
      activeMission: mission,
    };
  }

  it("updates what a side sees when a move changes where it stands (ADR 0006 §2.2)", () => {
    const state = campaign();
    // The bug is on the far side of the wall, which nothing sees through.
    expect(canSee(state.activeMission, "tdf", "b")).toBe(false);

    const lifted = liftTacticalHandler<typeof state, typeof MOVE>(
      createMoveHandler(),
    );
    const outcome = lifted(
      state,
      // Six steps through the door at z = 2, exactly the fixture's budget.
      move("u", [at(0, 1), at(0, 2), at(1, 2), at(2, 2), at(3, 2), at(4, 2)]),
      { rng: new Mulberry32Rng(1), ids: new SequentialIdGenerator() },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const after = outcome.value.state.activeMission;
    expect(after).toBeDefined();
    if (!after) return;
    // Vision followed the unit, without the move handler knowing about it.
    expect(canSee(after, "tdf", "b")).toBe(true);
    expect(outcome.value.events).toContainEqual({
      type: UNIT_SPOTTED,
      payload: { team: "tdf", unitId: "b" },
    });
    // And the spotting event is in the mission log with everything else.
    expect(after.log.some((event) => event.type === UNIT_SPOTTED)).toBe(true);
  });
});

describe("perceivedSpawners", () => {
  it("shows only the spawners standing on tiles the side has explored (#551)", () => {
    const base = missionWith(
      openField().build(),
      [unitAt("u1", "infantry", { x: 1, y: 0, z: 1 })],
      {
        spawners: [
          spawnerAt("near", { x: 2, y: 0, z: 2 }),
          spawnerAt("far", { x: 7, y: 0, z: 7 }),
        ],
      },
    );
    const index = new TileIndex(base.map);
    const mission: TacticalState = {
      ...base,
      vision: {
        ...base.vision,
        tdf: {
          visible: [],
          explored: [index.keyOf({ x: 2, y: 0, z: 2 })],
          spotted: [],
          lastSeen: {},
        },
      },
    };
    expect(perceivedSpawners(mission, "tdf").map((s) => s.id)).toEqual([
      "near",
    ]);
  });

  it("keeps a spawner once explored, even with nothing looking at it", () => {
    // A spawner is a fixed feature: unlike a unit it does not vanish
    // when it leaves view, only before it is ever found.
    const base = missionWith(
      openField().build(),
      [unitAt("u1", "infantry", { x: 1, y: 0, z: 1 })],
      { spawners: [spawnerAt("seen", { x: 4, y: 0, z: 4 })] },
    );
    const index = new TileIndex(base.map);
    const mission: TacticalState = {
      ...base,
      vision: {
        ...base.vision,
        tdf: {
          visible: [],
          explored: [index.keyOf({ x: 4, y: 0, z: 4 })],
          spotted: [],
          lastSeen: {},
        },
      },
    };
    expect(perceivedSpawners(mission, "tdf")).toHaveLength(1);
  });

  it("shows none before anything is explored", () => {
    const mission = missionWith(
      openField().build(),
      [unitAt("u1", "infantry", { x: 1, y: 0, z: 1 })],
      { spawners: [spawnerAt("hidden", { x: 5, y: 0, z: 5 })] },
    );
    expect(
      perceivedSpawners(
        { ...mission, vision: { tdf: NO_VISION, bugs: NO_VISION } },
        "tdf",
      ),
    ).toEqual([]);
  });
});
// ===========================================
// Replay and save (#531)
// ===========================================

describe("vision across a seeded replay", () => {
  /** A campaign holding one fixture mission, both sides having looked once. */
  function campaignFor(): MissionCampaignState & {
    activeMission: TacticalState;
  } {
    const mission = withVision({
      state: {
        ...missionWith(WALLED, [
          unitAt("u", "infantry", at(0, 0)),
          unitAt("b", "infantry", at(5, 0), { team: "bugs" }),
        ]),
        vision: emptyVision(),
      },
      events: [],
    }).state;
    return {
      meta: {
        rng: { algorithm: "mulberry32", seed: 1, state: 1 },
        ids: { counters: {} },
      },
      overworld: {} as MissionCampaignState["overworld"],
      roster: {} as MissionCampaignState["roster"],
      economy: {} as MissionCampaignState["economy"],
      activeMission: mission,
    };
  }

  /** The same walk through the door, dispatched the same way, every time. */
  function replay(): TacticalState {
    let state = campaignFor();
    const lifted = liftTacticalHandler<typeof state, typeof MOVE>(
      createMoveHandler(),
    );
    const steps = [
      [at(0, 1), at(0, 2), at(1, 2)],
      [at(2, 2), at(3, 2), at(4, 2)],
    ];
    for (const [i, path] of steps.entries()) {
      const outcome = lifted(state, move("u", path), {
        rng: new Mulberry32Rng(7).fork(`step:${String(i)}`),
        ids: new SequentialIdGenerator(),
      });
      if (!outcome.ok) throw new Error(`step ${String(i)} refused`);
      state = outcome.value.state;
    }
    const mission = state.activeMission;
    if (!mission) throw new Error("mission vanished");
    return mission;
  }

  it("produces the same vision twice from the same seed", () => {
    const first = replay();
    const second = replay();
    // Not just the vision: the whole mission, so an ordering difference
    // anywhere in the fog would show up here rather than in a save diff.
    expect(first).toEqual(second);
    expect(first.vision.tdf.explored.length).toBeGreaterThan(0);
  });

  it("round-trips the vision through JSON unchanged, which is what a save is", () => {
    const mission = replay();
    const reloaded = JSON.parse(JSON.stringify(mission)) as TacticalState;
    expect(reloaded.vision).toEqual(mission.vision);
    // And a reload recomputes what it must not trust: feeding the saved
    // mission back through withVision leaves the same answer.
    expect(withVision({ state: reloaded, events: [] }).state.vision).toEqual(
      mission.vision,
    );
  });
});

// ===========================================
// Remembered sightings
// ===========================================

describe("lastSeen (#716)", () => {
  it("records where an enemy was standing when it was seen", () => {
    const mission = missionWith(OPEN, [
      unitAt("u", "infantry", at(0, 0)),
      unitAt("b", "infantry", at(2, 0), { team: "bugs" }),
    ]);
    const { state } = withVision({ state: mission, events: [] });
    expect(state.vision.tdf.spotted).toContain("b");
    expect(state.vision.tdf.lastSeen.b).toEqual(at(2, 0));
  });

  it("keeps the record after losing sight, which is the point of it", () => {
    // Seen once at (2,0), then gone behind the wall. `spotted` empties
    // and the memory must not: a bug that forgets has nowhere to go.
    const seen = withVision({
      state: missionWith(WALLED, [
        unitAt("u", "infantry", at(0, 0)),
        unitAt("b", "infantry", at(2, 0), { team: "bugs" }),
      ]),
      events: [],
    }).state;
    expect(seen.vision.tdf.lastSeen.b).toEqual(at(2, 0));

    const moved = withVision({
      state: {
        ...seen,
        units: seen.units.map((u) =>
          u.id === "b" ? { ...u, pos: at(6, 0) } : u,
        ),
      },
      events: [],
    }).state;
    expect(moved.vision.tdf.spotted).not.toContain("b");
    expect(moved.vision.tdf.lastSeen.b).toEqual(at(2, 0));
  });

  it("records only what was seen, with another enemy in view at the time", () => {
    // Both bugs exist and one is plainly visible, so the remembering
    // code is running — it must still refuse the one behind the wall.
    //
    // Asserting this with *nothing* spotted does not test it: the fold
    // returns early on an empty list, so a version that recorded every
    // living enemy would pass. It has to be caught with the code live.
    const mission = missionWith(WALLED, [
      unitAt("u", "infantry", at(0, 0)),
      unitAt("near", "infantry", at(2, 0), { team: "bugs" }),
      unitAt("hidden", "infantry", at(6, 0), { team: "bugs" }),
    ]);
    const { state } = withVision({ state: mission, events: [] });
    expect(state.vision.tdf.spotted).toEqual(["near"]);
    expect(state.vision.tdf.lastSeen.near).toEqual(at(2, 0));
    expect(state.vision.tdf.lastSeen.hidden).toBeUndefined();
  });
});
