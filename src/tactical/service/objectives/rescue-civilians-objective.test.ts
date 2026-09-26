import { describe, expect, it } from "vitest";

import { STOREY_LAYERS } from "../../../core/model/elevation";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { OBJECTIVE_TUNING } from "../../data/objective-tuning";
import { CIVILIANS_EXTRACTED } from "../../model/civilians-extracted-event";
import { CIVILIANS_FREED } from "../../model/civilians-freed-event";
import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type {
  DestroySpawnerObjective,
  RescueCiviliansObjective,
  TacticalState,
} from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import {
  ctxWith,
  missionWith,
  openField,
  riggedRng,
  unitAt,
  withCivilian,
} from "../tactical-fixtures.test-helper";
import {
  createRescueStep,
  freeCivilians,
  groupToFree,
  RESCUE_CIVILIANS_OBJECTIVE,
  rescueNeeded,
  rescueProgress,
} from "./rescue-civilians-objective";

// ===========================================
// Fixtures
// ===========================================

const MAP = openField().build();
const TUNING = OBJECTIVE_TUNING;
const CTX = ctxWith(riggedRng(true));

/** A ground-floor tile. */
function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

/** A rescue of the four groups `civ-1` … `civ-4`, open. */
const RESCUE: RescueCiviliansObjective = {
  id: "objective-rescue",
  kind: "rescue-civilians",
  groupIds: ["civ-1", "civ-2", "civ-3", "civ-4"],
  complete: false,
  failed: false,
};

/** The four groups' tiles, one per corner of the field. */
const GROUP_TILES: Readonly<Record<string, TileCoord>> = {
  "civ-1": at(4, 4),
  "civ-2": at(7, 0),
  "civ-3": at(0, 7),
  "civ-4": at(7, 7),
};

/** How a group stands in a fixture. */
type GroupState = "trapped" | "freed" | "dead" | "aboard";

/**
 * A mission with a squad at (3, 4), beside `civ-1`, and the four groups
 * of `RESCUE` in the states given (trapped unless told otherwise). A
 * dead group is still trapped, at zero hit points; a group aboard
 * stands in `extracted`, freed, as the Extract handler leaves it.
 */
function rescueMission(
  states: Partial<Record<string, GroupState>> = {},
  squad: TileCoord = at(3, 4),
): TacticalState {
  let mission = missionWith(MAP, [unitAt("u", "infantry", squad)], {
    objectives: [RESCUE],
  });
  for (const id of RESCUE.groupIds) {
    const state = states[id] ?? "trapped";
    mission = withCivilian(mission, id, GROUP_TILES[id]!, {
      // A group the bugs killed died where it waited.
      trapped: state === "trapped" || state === "dead",
      ...(state === "dead" ? { hp: 0 } : {}),
    });
  }
  const aboard = new Set(
    RESCUE.groupIds.filter((id) => states[id] === "aboard"),
  );
  return {
    ...mission,
    units: mission.units.filter((unit) => !aboard.has(unit.id)),
    extracted: mission.units.filter((unit) => aboard.has(unit.id)),
  };
}

/** The unit with `id`, which the fixture must hold. */
function unitOf(mission: TacticalState, id: string): Unit {
  const unit = mission.units.find((candidate) => candidate.id === id);
  if (unit === undefined) throw new Error(`no unit ${id}`);
  return unit;
}

// ===========================================
// Status
// ===========================================

describe("rescueNeeded", () => {
  it("asks for half the groups, rounded up, and never fewer than one", () => {
    expect([0, 1, 2, 3, 4, 5].map(rescueNeeded)).toEqual([1, 1, 1, 2, 2, 3]);
  });
});

describe("rescueProgress", () => {
  it("is open with every group trapped", () => {
    expect(rescueProgress(rescueMission(), RESCUE)).toEqual({
      rescued: 0,
      trapped: 4,
      freed: 0,
      lost: 0,
      total: 4,
      needed: 2,
      status: "open",
    });
  });

  it("is complete once half the groups are aboard", () => {
    const one = rescueMission({ "civ-1": "aboard", "civ-2": "freed" });
    expect(rescueProgress(one, RESCUE).status).toBe("open");
    const two = rescueMission({ "civ-1": "aboard", "civ-2": "aboard" });
    expect(rescueProgress(two, RESCUE)).toMatchObject({
      rescued: 2,
      trapped: 2,
      status: "complete",
    });
  });

  it("fails once too many are dead for half to get out", () => {
    const two = rescueMission({ "civ-1": "dead", "civ-2": "dead" });
    expect(rescueProgress(two, RESCUE)).toMatchObject({
      lost: 2,
      status: "open",
    });
    const three = rescueMission({
      "civ-1": "dead",
      "civ-2": "dead",
      "civ-3": "dead",
    });
    expect(rescueProgress(three, RESCUE)).toMatchObject({
      lost: 3,
      status: "failed",
    });
  });

  it("counts a group still on the map lost once the mission is over", () => {
    const left = rescueMission({ "civ-1": "aboard", "civ-2": "freed" });
    expect(rescueProgress(left, RESCUE).status).toBe("open");
    expect(rescueProgress({ ...left, outcome: "extracted" }, RESCUE)).toEqual({
      rescued: 1,
      trapped: 0,
      freed: 0,
      lost: 3,
      total: 4,
      needed: 2,
      status: "failed",
    });
    const half = rescueMission({ "civ-1": "aboard", "civ-2": "aboard" });
    expect(rescueProgress({ ...half, outcome: "won" }, RESCUE)).toMatchObject({
      rescued: 2,
      lost: 2,
      status: "complete",
    });
  });

  it("ignores a unit aboard that is not one of the groups", () => {
    const mission = rescueMission();
    const squad = unitOf(mission, "u");
    const out = { ...mission, extracted: [squad] };
    expect(rescueProgress(out, RESCUE).rescued).toBe(0);
  });
});

// ===========================================
// Interaction
// ===========================================

describe("freeCivilians", () => {
  it("frees the group beside the rescuer with its full actions, and says who freed it", () => {
    const mission = rescueMission();
    const freed = freeCivilians(mission, RESCUE, unitOf(mission, "u"), TUNING);
    if (!freed.ok) throw new Error(`refused: ${freed.error.kind}`);

    const group = unitOf(freed.value.state, "civ-1");
    expect(group.trapped).toBeUndefined();
    expect(group.ap).toBe(group.maxAp);
    expect(unitOf(freed.value.state, "civ-2").trapped).toBe(true);
    expect(freed.value.events).toEqual([
      {
        type: CIVILIANS_FREED,
        payload: {
          unitId: "civ-1",
          rescuerId: "u",
          objectiveId: RESCUE.id,
        },
      },
    ]);
    // Freeing gets nobody out: the flags stay where they were.
    expect(freed.value.state.objectives).toEqual([RESCUE]);
  });

  it("refuses a rescuer two tiles away, and says how far", () => {
    const mission = rescueMission({}, at(2, 4));
    expect(
      freeCivilians(mission, RESCUE, unitOf(mission, "u"), TUNING),
    ).toEqual({
      ok: false,
      error: {
        kind: "objective-out-of-reach",
        objectiveId: RESCUE.id,
        distance: 2,
        range: TUNING.interactRange,
      },
    });
  });

  it("refuses a rescuer on the floor above the group, beside it on the ground plane", () => {
    const mission = rescueMission({}, { x: 3, y: STOREY_LAYERS, z: 4 });
    const refused = freeCivilians(mission, RESCUE, unitOf(mission, "u"), {
      ...TUNING,
    });
    expect(refused.ok ? "ok" : refused.error.kind).toBe(
      "objective-out-of-reach",
    );
    // Half a storey up is still the same floor, as a ramp's step is.
    const ramp = rescueMission({}, { x: 3, y: STOREY_LAYERS - 1, z: 4 });
    expect(freeCivilians(ramp, RESCUE, unitOf(ramp, "u"), TUNING).ok).toBe(
      true,
    );
  });

  it("refuses when no group is left trapped, or the only one beside is dead", () => {
    const empty = rescueMission({
      "civ-1": "freed",
      "civ-2": "aboard",
      "civ-3": "dead",
      "civ-4": "freed",
    });
    expect(
      freeCivilians(empty, RESCUE, unitOf(empty, "u"), TUNING),
    ).toMatchObject({ ok: false, error: { kind: "no-objective-in-reach" } });
    const dead = rescueMission({ "civ-1": "dead" });
    expect(
      freeCivilians(dead, RESCUE, unitOf(dead, "u"), TUNING),
    ).toMatchObject({
      ok: false,
      error: { kind: "objective-out-of-reach" },
    });
  });

  it("refuses an objective that is not a rescue", () => {
    const spawner: DestroySpawnerObjective = {
      id: "objective-spawner",
      kind: "destroy-spawner",
      targetId: "spawner-1",
      complete: false,
    };
    const mission = rescueMission();
    expect(
      freeCivilians(mission, spawner, unitOf(mission, "u"), TUNING),
    ).toMatchObject({
      ok: false,
      error: { kind: "objective-not-interactive" },
    });
  });

  it("frees the nearest group on the rescuer's storey, objective order on a tie", () => {
    const mission = rescueMission({}, at(7, 1));
    expect(groupToFree(mission, RESCUE, { pos: at(7, 1) })?.id).toBe("civ-2");
    // (5, 5) is two from civ-1 and four from civ-4.
    expect(groupToFree(mission, RESCUE, { pos: at(5, 5) })?.id).toBe("civ-1");
    // (7, 4) is three from both civ-1 and civ-4; civ-1 comes first.
    expect(groupToFree(mission, RESCUE, { pos: at(7, 4) })?.id).toBe("civ-1");
  });
});

// ===========================================
// Rules
// ===========================================

describe("RESCUE_CIVILIANS_OBJECTIVE", () => {
  const rules = RESCUE_CIVILIANS_OBJECTIVE;

  it("is worked until no group is left trapped, whatever the flags say", () => {
    expect(rules.workedUntilEmpty).toBe(true);
  });

  it("reaches the group the asking unit would free, or the first one when nobody asks", () => {
    const mission = rescueMission({ "civ-1": "freed" }, at(7, 1));
    const squad = unitOf(mission, "u");
    expect(rules.reachable?.(RESCUE, mission, squad)).toEqual({
      id: "civ-2",
      pos: GROUP_TILES["civ-2"],
    });
    expect(rules.reachable?.(RESCUE, mission)).toEqual({
      id: "civ-2",
      pos: GROUP_TILES["civ-2"],
    });
    const none = rescueMission({
      "civ-1": "freed",
      "civ-2": "freed",
      "civ-3": "freed",
      "civ-4": "freed",
    });
    expect(rules.reachable?.(RESCUE, none, squad)).toBeUndefined();
  });

  it("puts a marker on every trapped group and none on a freed or dead one", () => {
    const mission = rescueMission({ "civ-1": "freed", "civ-4": "dead" });
    expect(rules.markers?.(RESCUE, mission)).toEqual([
      GROUP_TILES["civ-2"],
      GROUP_TILES["civ-3"],
    ]);
  });

  it("heads a controller for the first trapped group, naming every group still on the map", () => {
    const mission = rescueMission({
      "civ-1": "freed",
      "civ-2": "aboard",
      "civ-4": "dead",
    });
    expect(rules.destination?.(RESCUE, mission)).toEqual({
      position: GROUP_TILES["civ-3"],
      targetIds: ["civ-1", "civ-3"],
    });
  });

  it("tallies and reports the groups aboard of the groups", () => {
    const mission = rescueMission({ "civ-1": "aboard", "civ-3": "dead" });
    expect(rules.tally?.(RESCUE, mission)).toEqual({ done: 1, total: 4 });
    expect(rules.resultFields?.(RESCUE, mission)).toEqual({
      civiliansRescued: 1,
      civiliansTotal: 4,
    });
  });

  it("counts a group aboard, and marks the rescue complete with the one that makes the half", () => {
    const first = rescueMission({ "civ-1": "aboard" });
    const one = rules.onExtracted?.(RESCUE, first, first.extracted[0]!);
    expect(one?.events).toEqual([
      {
        type: CIVILIANS_EXTRACTED,
        payload: {
          unitId: "civ-1",
          objectiveId: RESCUE.id,
          rescued: 1,
          total: 4,
        },
      },
    ]);
    expect(one?.state).toBe(first);

    const second = rescueMission({ "civ-1": "aboard", "civ-2": "aboard" });
    const two = rules.onExtracted?.(RESCUE, second, second.extracted[1]!);
    expect(two?.events.map((event) => event.type)).toEqual([
      CIVILIANS_EXTRACTED,
      OBJECTIVE_UPDATED,
    ]);
    expect(two?.events[1]?.payload).toEqual({
      objectiveId: RESCUE.id,
      complete: true,
      failed: false,
    });
    expect(two?.state.objectives).toEqual([{ ...RESCUE, complete: true }]);
  });

  it("does not hear a squad boarding", () => {
    const mission = rescueMission();
    const squad = unitOf(mission, "u");
    const heard = rules.onExtracted?.(RESCUE, mission, squad);
    expect(heard).toEqual({ state: mission, events: [] });
  });
});

describe("createRescueStep", () => {
  const step = createRescueStep();

  it("records the failure once the bugs have killed too many", () => {
    const mission = rescueMission({
      "civ-1": "dead",
      "civ-2": "dead",
      "civ-3": "dead",
    });
    const applied = step(mission, CTX);
    expect(applied.state.objectives).toEqual([{ ...RESCUE, failed: true }]);
    expect(applied.events).toEqual([
      {
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: RESCUE.id, complete: false, failed: true },
      },
    ]);
    // Said once: the next phase has nothing new to say.
    expect(step(applied.state, CTX).events).toEqual([]);
  });

  it("says nothing while the rescue is open", () => {
    const mission = rescueMission({ "civ-1": "dead" });
    expect(step(mission, CTX)).toEqual({ state: mission, events: [] });
  });

  it("never takes a complete rescue back", () => {
    const done: RescueCiviliansObjective = { ...RESCUE, complete: true };
    const mission = {
      ...rescueMission({ "civ-1": "aboard" }),
      objectives: [done],
    };
    expect(step(mission, CTX).state.objectives).toEqual([done]);
  });
});
