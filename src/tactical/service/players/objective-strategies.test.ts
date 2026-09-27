import { describe, expect, it } from "vitest";

import type {
  DefendGeneratorsObjective,
  Objective,
} from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { OBJECTIVE_RULES } from "../objectives/objective-rules";
import { unitAt, walledField } from "../tactical-fixtures.test-helper";
import {
  COVERED_OBJECTIVE_KINDS,
  DEFEND_GENERATORS_STRATEGY,
  killEverythingStub,
  STUBBED_OBJECTIVE_KINDS,
} from "./objective-strategies.test-helper";
import { lookingMission } from "./player-fixtures.test-helper";
import { observe } from "./player-view.test-helper";

/** An objective the stub stands in for; its kind is irrelevant to the stub. */
const OBJECTIVE: Objective = {
  id: "o1",
  kind: "destroy-spawner",
  targetId: "s1",
  complete: false,
};

describe("the objective strategies", () => {
  it("cover every objective kind the rules define", () => {
    expect([...COVERED_OBJECTIVE_KINDS].sort()).toEqual(
      Object.keys(OBJECTIVE_RULES).sort(),
    );
  });

  it("stub the kinds this build lacks rather than covering them", () => {
    for (const kind of STUBBED_OBJECTIVE_KINDS) {
      expect(COVERED_OBJECTIVE_KINDS).not.toContain(kind);
    }
  });
});

describe("the kill-everything stub", () => {
  const stub = killEverythingStub();

  it("hunts what it can see", () => {
    const view = observe(
      lookingMission([
        unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
        unitAt("bug", "infantry", { x: 4, y: 0, z: 4 }, { team: "bugs" }),
      ]),
    );
    expect(stub.settled(OBJECTIVE, view)).toBe(false);
    expect(stub.jobs(OBJECTIVE, view)).toEqual([
      { order: { kind: "hunt", goals: [{ x: 4, y: 0, z: 4 }] } },
    ]);
  });

  it("is settled once nothing is seen, remembered or left unexplored", () => {
    const view = observe(
      lookingMission([unitAt("alpha", "infantry", { x: 3, y: 0, z: 3 })]),
    );
    expect(stub.settled(OBJECTIVE, view)).toBe(true);
    expect(stub.jobs(OBJECTIVE, view)).toEqual([]);
  });
});

describe("the defence strategy", () => {
  const defence: DefendGeneratorsObjective = {
    id: "o1",
    kind: "defend-generators",
    installation: "sensor-array",
    targetIds: ["gen-w", "gen-e"],
    complete: false,
    failed: false,
  };

  /** A generator at `pos`. */
  function generator(id: string, x: number): Unit {
    return { ...unitAt(id, "infantry", { x, y: 0, z: 6 }), kind: "generator" };
  }

  it("guards the generator under attack before the quiet one", () => {
    const view = observe(
      lookingMission([
        unitAt("alpha", "infantry", { x: 4, y: 0, z: 1 }),
        generator("gen-w", 1),
        generator("gen-e", 6),
        unitAt("bug", "infantry", { x: 1, y: 0, z: 3 }, { team: "bugs" }),
      ]),
    );
    const [job, ...rest] = DEFEND_GENERATORS_STRATEGY.jobs(defence, view);
    expect(rest).toEqual([]);
    expect(job?.order).toMatchObject({
      kind: "guard",
      goals: [{ x: 1, y: 0, z: 6 }],
    });
  });

  it("goes looking for the stragglers once the last wave is in", () => {
    const view = observe(
      lookingMission(
        [
          unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
          generator("gen-w", 1),
          generator("gen-e", 2),
          unitAt("bug", "infantry", { x: 6, y: 0, z: 6 }, { team: "bugs" }),
        ],
        { edgeSpawn: { nextTurn: 9, wave: 3, totalWaves: 3 } },
        walledField(),
      ),
    );
    expect(view.enemies).toEqual([]);
    const jobs = DEFEND_GENERATORS_STRATEGY.jobs(defence, view);
    expect(jobs.map((job) => job.order.kind)).toEqual(["hunt"]);
  });

  it("searches the unexplored ground nearest the generators first", () => {
    // Everything east of the wall is unexplored. The squad stands in the
    // north-west corner, the generators in the south-west: the search
    // starts across the wall from the generators, not from the squad.
    const view = observe(
      lookingMission(
        [
          unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
          generator("gen-w", 1),
          generator("gen-e", 2),
          unitAt("bug", "infantry", { x: 6, y: 0, z: 6 }, { team: "bugs" }),
        ],
        { edgeSpawn: { nextTurn: 9, wave: 3, totalWaves: 3 } },
        walledField(),
      ),
    );
    const [job] = DEFEND_GENERATORS_STRATEGY.jobs(defence, view);
    expect(job?.order.goals[0]).toMatchObject({ x: 4, y: 0, z: 6 });
  });

  it("searches round a lead gone cold before the generators", () => {
    // The same field, but the bug was last seen at (2, 2), in sight now
    // and empty: the search starts across the door from that contact,
    // not across the wall from the generators.
    const mission = lookingMission(
      [
        unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
        generator("gen-w", 1),
        generator("gen-e", 2),
        unitAt("bug", "infantry", { x: 6, y: 0, z: 6 }, { team: "bugs" }),
      ],
      { edgeSpawn: { nextTurn: 9, wave: 3, totalWaves: 3 } },
      walledField(),
    );
    const view = observe({
      ...mission,
      vision: {
        ...mission.vision,
        tdf: { ...mission.vision.tdf, lastSeen: { bug: { x: 2, y: 0, z: 2 } } },
      },
    });
    expect(view.enemies).toEqual([]);
    const [job] = DEFEND_GENERATORS_STRATEGY.jobs(defence, view);
    expect(job?.order.kind).toBe("hunt");
    expect(job?.order.goals[0]).toMatchObject({ x: 4, y: 0, z: 2 });
  });

  it("hunts a straggler it can see that threatens no generator", () => {
    const view = observe(
      lookingMission(
        [
          unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
          generator("gen-w", 1),
          generator("gen-e", 2),
          unitAt("bug", "infantry", { x: 7, y: 0, z: 0 }, { team: "bugs" }),
        ],
        { edgeSpawn: { nextTurn: 9, wave: 3, totalWaves: 3 } },
      ),
    );
    expect(view.enemies.map((enemy) => enemy.id)).toEqual(["bug"]);
    expect(DEFEND_GENERATORS_STRATEGY.jobs(defence, view)).toEqual([
      { order: { kind: "hunt", goals: [{ x: 7, y: 0, z: 0 }] } },
    ]);
  });
});
