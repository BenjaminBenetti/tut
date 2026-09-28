import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { ObjectiveKind } from "../../model/objective-rules";
import type {
  RescueCiviliansObjective,
  TacticalState,
} from "../../model/tactical-state";
import { unitAt, withCivilian } from "../tactical-fixtures.test-helper";
import {
  EXPERT_OBJECTIVE_STRATEGIES,
  EXPERT_RESCUE_CIVILIANS_STRATEGY,
} from "./expert-objective-strategies.test-helper";
import {
  OBJECTIVE_STRATEGIES,
  RESCUE_CIVILIANS_STRATEGY,
} from "./objective-strategies.test-helper";
import { lookingMission } from "./player-fixtures.test-helper";
import type { PlayerView } from "./player-view.test-helper";
import { observe } from "./player-view.test-helper";

/** Three groups: two must get out. */
const RESCUE: RescueCiviliansObjective = {
  id: "o1",
  kind: "rescue-civilians",
  groupIds: ["g1", "g2", "g3"],
  complete: false,
  failed: false,
};

/** Where a group is, and how it stands. */
interface GroupAt {
  readonly id: string;
  readonly pos: TileCoord;
  readonly state: "trapped" | "freed" | "aboard";
}

/**
 * The open field with one squad at `squad`, the drop ship in the
 * south-west corner, and the rescue's groups as told: trapped in their
 * building, freed and walking, or already aboard.
 */
function town(squad: TileCoord, groups: readonly GroupAt[]): PlayerView {
  let mission: TacticalState = {
    ...lookingMission([unitAt("alpha", "infantry", squad)]),
    objectives: [RESCUE],
  };
  for (const group of groups) {
    mission = withCivilian(mission, group.id, group.pos, {
      trapped: group.state === "trapped",
    });
  }
  const aboard = new Set(
    groups.filter((group) => group.state === "aboard").map((group) => group.id),
  );
  return observe({
    ...mission,
    units: mission.units.filter((unit) => !aboard.has(unit.id)),
    extracted: mission.units.filter((unit) => aboard.has(unit.id)),
  });
}

describe("the expert's strategy table", () => {
  it("is the shared table with the expert's own rescue laid over it", () => {
    for (const kind of Object.keys(OBJECTIVE_STRATEGIES) as ObjectiveKind[]) {
      expect(EXPERT_OBJECTIVE_STRATEGIES[kind], kind).toBe(
        kind === "rescue-civilians"
          ? EXPERT_RESCUE_CIVILIANS_STRATEGY
          : OBJECTIVE_STRATEGIES[kind],
      );
    }
  });
});

describe("the expert's rescue", () => {
  it("frees every trapped group at once: the force on the cheapest round trip, a team on each other, in a hurry", () => {
    // The squad stands on the east edge. g1 is the group nearest it, but
    // its walk home is the longest; g2 and g3 cost the same round trip.
    const view = town({ x: 7, y: 0, z: 4 }, [
      { id: "g1", pos: { x: 7, y: 0, z: 7 }, state: "trapped" },
      { id: "g2", pos: { x: 1, y: 0, z: 1 }, state: "trapped" },
      { id: "g3", pos: { x: 2, y: 0, z: 2 }, state: "trapped" },
    ]);
    const work = (x: number, z: number) => ({
      kind: "work",
      goals: [{ x, y: 0, z }],
      interact: "o1",
      urgent: true,
    });
    // Cheapest first, ties in the objective's order; the first job is the
    // main one (no crew), every other is a team of two. At full pace: the
    // bugs are hunting the groups too.
    expect(EXPERT_RESCUE_CIVILIANS_STRATEGY.jobs(RESCUE, view)).toEqual([
      { order: work(1, 1) },
      { order: work(2, 2), crew: 2 },
      { order: work(7, 7), crew: 2 },
    ]);
    // The shared strategy, which the new player reads, offers the same
    // three groups as one force's jobs, at its own pace.
    const shared = RESCUE_CIVILIANS_STRATEGY.jobs(RESCUE, view);
    expect(shared).toHaveLength(3);
    for (const job of shared) {
      expect(job.crew).toBeUndefined();
      expect(job.order.urgent).toBeUndefined();
    }
  });

  it("leaves a freed group to walk home on its own, with nobody in its doorway", () => {
    const view = town({ x: 4, y: 0, z: 4 }, [
      { id: "g1", pos: { x: 3, y: 0, z: 3 }, state: "freed" },
      { id: "g2", pos: { x: 1, y: 0, z: 1 }, state: "trapped" },
      { id: "g3", pos: { x: 6, y: 0, z: 6 }, state: "trapped" },
    ]);
    const jobs = EXPERT_RESCUE_CIVILIANS_STRATEGY.jobs(RESCUE, view);
    expect(jobs.map((job) => job.order.kind)).toEqual(["work", "work"]);
    expect(jobs.map((job) => job.order.goals)).toEqual([
      [{ x: 1, y: 0, z: 1 }],
      [{ x: 6, y: 0, z: 6 }],
    ]);
    // The shared strategy would stand one unit beside g1.
    expect(
      RESCUE_CIVILIANS_STRATEGY.jobs(RESCUE, view).map(
        (job) => job.order.protect,
      ),
    ).toContainEqual(["g1"]);
  });

  it("has no job once every group left on the map is out of its building", () => {
    const view = town({ x: 5, y: 0, z: 5 }, [
      { id: "g1", pos: { x: 0, y: 0, z: 1 }, state: "aboard" },
      { id: "g2", pos: { x: 4, y: 0, z: 4 }, state: "freed" },
      { id: "g3", pos: { x: 6, y: 0, z: 6 }, state: "freed" },
    ]);
    expect(EXPERT_RESCUE_CIVILIANS_STRATEGY.settled(RESCUE, view)).toBe(false);
    expect(EXPERT_RESCUE_CIVILIANS_STRATEGY.jobs(RESCUE, view)).toEqual([]);
  });

  it("is settled when the tracker says the rescue is done, as for the new player", () => {
    const view = town({ x: 5, y: 0, z: 5 }, [
      { id: "g1", pos: { x: 0, y: 0, z: 1 }, state: "aboard" },
      { id: "g2", pos: { x: 1, y: 0, z: 0 }, state: "aboard" },
      { id: "g3", pos: { x: 6, y: 0, z: 6 }, state: "trapped" },
    ]);
    expect(EXPERT_RESCUE_CIVILIANS_STRATEGY.settled(RESCUE, view)).toBe(true);
    expect(RESCUE_CIVILIANS_STRATEGY.settled(RESCUE, view)).toBe(true);
  });
});
