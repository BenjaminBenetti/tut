import { describe, expect, it } from "vitest";

import type { TileCoord } from "../../../mapgen/model/tile-coord";
import type { ObjectiveKind } from "../../model/objective-rules";
import type {
  RescueCiviliansObjective,
  TacticalState,
} from "../../model/tactical-state";
import { manhattanDistance } from "../../../core/service/grid-math";
import { MOVE } from "../../model/move-command";
import { OVERWATCH } from "../../model/overwatch-command";
import { hasLineOfSight } from "../sight-service";
import {
  FIXTURE_TEMPLATES,
  unitAt,
  walledField,
  withCivilian,
} from "../tactical-fixtures.test-helper";
import {
  EXPERT_OBJECTIVE_STRATEGIES,
  EXPERT_RESCUE_CIVILIANS_STRATEGY,
  EXPERT_SEAL_TUNNELS_STRATEGY,
} from "./expert-objective-strategies.test-helper";
import {
  OBJECTIVE_STRATEGIES,
  RESCUE_CIVILIANS_STRATEGY,
  SEAL_TUNNELS_STRATEGY,
} from "./objective-strategies.test-helper";
import { createExpertPlayerPolicy } from "./expert-player-policy.test-helper";
import type { FixtureMouthState } from "./player-fixtures.test-helper";
import {
  FIXTURE_PLAYER_RULES,
  lookingMission,
  sealObjective,
  tunnelMission,
} from "./player-fixtures.test-helper";
import { planForce } from "./player-policy.test-helper";
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
  it("is the shared table with the expert's own rescue and tunnels laid over it", () => {
    const own: Partial<Record<ObjectiveKind, unknown>> = {
      "rescue-civilians": EXPERT_RESCUE_CIVILIANS_STRATEGY,
      "seal-tunnels": EXPERT_SEAL_TUNNELS_STRATEGY,
    };
    for (const kind of Object.keys(OBJECTIVE_STRATEGIES) as ObjectiveKind[]) {
      expect(EXPERT_OBJECTIVE_STRATEGIES[kind], kind).toBe(
        own[kind] ?? OBJECTIVE_STRATEGIES[kind],
      );
    }
  });
});

describe("the expert's tunnels (arc §6.7, Ben's rule of 2026-09-28)", () => {
  /** The breaching charge's blast (#1132): the HUD's danger is one wider. */
  const BLAST = 3;

  /** Ground tile (x, z). */
  const at = (x: number, z: number): TileCoord => ({ x, y: 0, z });

  /** A bug that walks one tile an action and bites at one tile. */
  const BITER = "bug:biter";

  /** `mission` with the `BITER` template: the fixture bug, slowed and with its gun traded for a bite. */
  function withBiters(mission: TacticalState): TacticalState {
    const gun = mission.templates[FIXTURE_TEMPLATES.bug];
    if (gun === undefined) throw new Error("no fixture bug template");
    return {
      ...mission,
      templates: {
        ...mission.templates,
        [BITER]: {
          ...gun,
          id: BITER,
          move: 1,
          weapons: gun.weapons.map((weapon) => ({
            ...weapon,
            profile: { ...weapon.profile, range: 1 },
          })),
        },
      },
    };
  }

  /**
   * The walled field (a solid wall east of x = 3, a door at z = 2), a
   * squad at (0, 7), tunnel-1 west of the wall at (1, 5) and tunnel-2
   * east of it at (6, 6), each as told.
   */
  function tunnels(west: FixtureMouthState, east: FixtureMouthState) {
    const mission = tunnelMission(
      [unitAt("alpha", "infantry", at(0, 7))],
      [
        { id: "tunnel-1", pos: at(1, 5), ...west },
        { id: "tunnel-2", pos: at(6, 6), ...east },
      ],
      walledField(),
    );
    const objective = sealObjective(mission.tunnelMouths ?? []);
    return { view: observe(mission), objective };
  }

  /** Every goal of `goals` on the ring round the charge at `charge`, in its sight. */
  function expectRing(
    view: PlayerView,
    goals: readonly TileCoord[],
    charge: TileCoord,
  ): void {
    expect(goals.length).toBeGreaterThan(0);
    for (const goal of goals) {
      // Past the danger the HUD draws, near enough to shoot.
      const flat = manhattanDistance(goal, charge);
      expect(flat).toBeGreaterThanOrEqual(BLAST + 2);
      expect(flat).toBeLessThanOrEqual(BLAST + 3);
      expect(
        hasLineOfSight(view.mission.map, goal, charge, view.graph.index),
      ).toBe(true);
    }
  }

  it("keeps a crew on each burning charge and the rest of the force on the one that blows soonest, from ground just outside its blast with a sight line to it", () => {
    const { view, objective } = tunnels(
      { state: "burning", goesOffOn: 6 },
      { state: "burning", goesOffOn: 5 },
    );
    const jobs = EXPERT_SEAL_TUNNELS_STRATEGY.jobs(objective, view);
    expect(jobs.map((job) => [job.order.kind, job.crew])).toEqual([
      ["guard", undefined],
      ["guard", 2],
    ]);
    const [soonest, later] = jobs;
    expect(soonest?.order).toMatchObject({ kind: "guard", holdRadius: 0 });
    expectRing(view, soonest?.order.goals ?? [], at(6, 6));
    // East of the wall: nothing west of it sees the mouth. (3, 4) is
    // ring ground by distance, but behind the wall.
    for (const goal of soonest?.order.goals ?? []) {
      expect(goal.x).toBeGreaterThanOrEqual(4);
    }
    expect(manhattanDistance(at(3, 4), at(6, 6))).toBe(BLAST + 2);
    expect(soonest?.order.goals).not.toContainEqual(at(3, 4));
    expectRing(view, later?.order.goals ?? [], at(1, 5));
  });

  it("sends a crew to set the nearer open mouth and the rest of the force to the one furthest from it", () => {
    // tunnel-1 is three steps from the squad; tunnel-2 is behind the
    // wall, round by the door at z = 2.
    const { view, objective } = tunnels({ state: "open" }, { state: "open" });
    expect(EXPERT_SEAL_TUNNELS_STRATEGY.jobs(objective, view)).toEqual([
      {
        order: { kind: "work", goals: [at(1, 5)], interact: "seal" },
        crew: 2,
      },
      { order: { kind: "work", goals: [at(6, 6)], interact: "seal" } },
    ]);
  });

  it("keeps a crew on a burning charge while the rest of the force goes to set the open mouth", () => {
    const { view, objective } = tunnels(
      { state: "burning", goesOffOn: 6 },
      { state: "open" },
    );
    const jobs = EXPERT_SEAL_TUNNELS_STRATEGY.jobs(objective, view);
    expect(jobs.map((job) => [job.order.kind, job.crew])).toEqual([
      ["guard", 2],
      ["work", undefined],
    ]);
    expectRing(view, jobs[0]?.order.goals ?? [], at(1, 5));
    expect(jobs[1]?.order).toEqual({
      kind: "work",
      goals: [at(6, 6)],
      interact: "seal",
    });
  });

  it("puts the bugs in sight that could bite the charge in the coming phase first, nearest first", () => {
    // Biters walk one tile an action and bite at one: a charge is in
    // reach of a biter up to 1 × 2 + 1 + a storey's slack = 4 tiles off.
    const squad = unitAt("alpha", "infantry", at(4, 4));
    const bug = (id: string, pos: TileCoord, templateId: string) => ({
      ...unitAt(id, "infantry", pos, { team: "bugs" }),
      templateId,
    });
    const units = [
      squad,
      bug("mid", at(4, 1), BITER),
      bug("near", at(1, 3), BITER),
      bug("far", at(6, 6), BITER),
      bug("gun", at(2, 1), FIXTURE_TEMPLATES.bug),
    ];
    /** The job's shoot-first list with the mouth at (1, 1) as told. */
    const firstOf = (mouth: FixtureMouthState) => {
      const mission = withBiters(
        tunnelMission(units, [{ id: "tunnel-1", pos: at(1, 1), ...mouth }]),
      );
      const view = observe(mission);
      expect(view.enemies.map((enemy) => enemy.id).sort()).toEqual([
        "far",
        "gun",
        "mid",
        "near",
      ]);
      const objective = sealObjective(mission.tunnelMouths ?? []);
      return EXPERT_SEAL_TUNNELS_STRATEGY.jobs(objective, view)[0]?.order
        .priority;
    };
    // The far biter is out of reach and the gun bug cannot bite.
    expect(firstOf({ state: "burning", goesOffOn: 5 })).toEqual([
      "near",
      "mid",
    ]);
    expect(firstOf({ state: "open" })).toEqual(["near", "mid"]);
  });

  it("moves the whole force on to the other burning charge once the first has blown", () => {
    const { view, objective } = tunnels(
      { state: "burning", goesOffOn: 6 },
      { state: "sealed" },
    );
    const jobs = EXPERT_SEAL_TUNNELS_STRATEGY.jobs(objective, view);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.crew).toBeUndefined();
    const goals = jobs[0]?.order.goals ?? [];
    expect(goals.length).toBeGreaterThan(0);
    for (const goal of goals) {
      expect(goal.x).toBeLessThanOrEqual(3);
      expect(manhattanDistance(goal, at(1, 5))).toBeGreaterThanOrEqual(
        BLAST + 2,
      );
    }
  });

  it("is a guard the expert policy carries out: out of the blast to the ring, then watching the mouth", () => {
    const expert = createExpertPlayerPolicy(FIXTURE_PLAYER_RULES);
    /** The expert's command for the squad standing at `squad`. */
    const commandAt = (squad: TileCoord) => {
      const mission = tunnelMission(
        [unitAt("alpha", "infantry", squad)],
        [{ id: "tunnel-1", pos: at(1, 1), state: "burning", goesOffOn: 5 }],
      );
      const view = observe(mission);
      const plan = planForce(view, EXPERT_OBJECTIVE_STRATEGIES);
      const order = expert.assign(view, plan).get("alpha");
      expect(order?.kind).toBe("guard");
      const unit = view.own[0];
      return unit && order && expert.next(unit, order, view);
    };
    // Beside the mouth it just charged: it walks out to the ring.
    const walk = commandAt(at(2, 1));
    expect(walk?.type).toBe(MOVE);
    const end = walk?.type === MOVE ? walk.payload.path.at(-1) : undefined;
    expect(end && manhattanDistance(end, at(1, 1))).toBeGreaterThanOrEqual(
      BLAST + 2,
    );
    // On the ring, it watches the mouth.
    expect(commandAt(at(6, 1))?.type).toBe(OVERWATCH);
  });

  it("with no charge burning, works the open mouths as the new player does, a pulled one among them", () => {
    const { view, objective } = tunnels(
      { state: "pulled" },
      { state: "sealed" },
    );
    const jobs = EXPERT_SEAL_TUNNELS_STRATEGY.jobs(objective, view);
    expect(jobs).toEqual(SEAL_TUNNELS_STRATEGY.jobs(objective, view));
    expect(jobs).toEqual([
      { order: { kind: "work", goals: [at(1, 5)], interact: "seal" } },
    ]);
    expect(EXPERT_SEAL_TUNNELS_STRATEGY.settled(objective, view)).toBe(false);
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
