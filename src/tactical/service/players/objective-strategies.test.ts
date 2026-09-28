import { describe, expect, it } from "vitest";

import { STOREY_LAYERS } from "../../../core/model/elevation";
import { HookKinds } from "../../../mapgen/model/hook";
import { PassMask } from "../../../mapgen/model/pass-mask";
import { FixtureMapBuilder } from "../../../mapgen/service/fixture-map-builder";
import type { DefendGeneratorsObjective } from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { OBJECTIVE_RULES } from "../objectives/objective-rules";
import { unitAt, walledField } from "../tactical-fixtures.test-helper";
import {
  COVERED_OBJECTIVE_KINDS,
  DEFEND_GENERATORS_STRATEGY,
  DESTROY_HIVE_CORE_STRATEGY,
} from "./objective-strategies.test-helper";
import { lookingMission } from "./player-fixtures.test-helper";
import { backOfMap } from "./player-goals.test-helper";
import { distanceField } from "./player-navigation.test-helper";
import type { PlayerView } from "./player-view.test-helper";
import { observe } from "./player-view.test-helper";

describe("the objective strategies", () => {
  it("cover every objective kind the rules define", () => {
    expect([...COVERED_OBJECTIVE_KINDS].sort()).toEqual(
      Object.keys(OBJECTIVE_RULES).sort(),
    );
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

  it("stays on the generators while the hold counts down, stragglers or not (#1179)", () => {
    const holding = { ...defence, holdUntilTurn: 9 };
    const mission = (turn: number) =>
      lookingMission(
        [
          unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
          generator("gen-w", 1),
          generator("gen-e", 2),
          unitAt("bug", "infantry", { x: 7, y: 0, z: 0 }, { team: "bugs" }),
        ],
        {
          turn,
          objectives: [holding],
          edgeSpawn: { nextTurn: 9, wave: 3, totalWaves: 3 },
        },
      );
    const during = observe(mission(6));
    expect(during.enemies.map((enemy) => enemy.id)).toEqual(["bug"]);
    expect(
      DEFEND_GENERATORS_STRATEGY.jobs(holding, during).map(
        (job) => job.order.kind,
      ),
    ).toEqual(["guard"]);
    // The same field with no hold running: the search is on.
    expect(
      DEFEND_GENERATORS_STRATEGY.jobs(defence, observe(mission(6))).map(
        (job) => job.order.kind,
      ),
    ).toEqual(["hunt"]);
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

describe("the hive-core strategy while the core is unseen (#1179 C3a)", () => {
  const core = {
    id: "o1",
    kind: "destroy-hive-core",
    targetId: "core",
    complete: false,
  } as const;

  /** A 30×16 floor, the drop ship at the origin, the squad beside it, no core in sight. */
  function field(explored?: (view: PlayerView) => Set<number>): PlayerView {
    const map = new FixtureMapBuilder(30, 16, 3 * STOREY_LAYERS)
      .fillGround()
      .build();
    const view = observe(
      lookingMission(
        [unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 })],
        {
          objectives: [core],
        },
        map,
      ),
    );
    return {
      ...view,
      places: new Map(),
      ...(explored === undefined ? {} : { explored: explored(view) }),
    };
  }

  /** The explore order's goals of the strategy's one job, else none. */
  function goals(view: PlayerView) {
    const jobs = DESTROY_HIVE_CORE_STRATEGY.jobs(core, view);
    expect(jobs.length).toBeLessThanOrEqual(1);
    return jobs[0]?.order.goals ?? [];
  }

  it("takes the back of the cavern as the tiles farthest from the drop ship, farthest first", () => {
    const view = field();
    const steps = distanceField(
      view.graph,
      view.mission.extraction,
      PassMask.INFANTRY,
    );
    const far = (tile: { x: number; y: number; z: number }): number =>
      steps.get(view.graph.index.keyOf(tile)) ?? -1;
    const back = backOfMap(view);
    const inBack = new Set(back.map((tile) => view.graph.index.keyOf(tile)));
    const nearestInBack = Math.min(...back.map(far));
    const farthestLeftOut = Math.max(
      ...view.mission.map.tiles
        .filter((tile) => !inBack.has(view.graph.index.keyOf(tile)))
        .map(far),
    );
    expect(back).toHaveLength(16);
    expect(nearestInBack).toBeGreaterThanOrEqual(farthestLeftOut);
    expect(back.map(far)).toEqual([...back.map(far)].sort((a, b) => b - a));
  });

  it("measures the back from the landing zone, not from a forward extraction point (#1179 C3a round 3)", () => {
    const plain = field();
    const map = plain.mission.map;
    // A second place to board near the far end, as a Great Hive marks one.
    const forwardTiles = map.tiles
      .filter(
        (tile) => tile.y === 0 && tile.x >= 26 && tile.z >= 6 && tile.z <= 9,
      )
      .map(({ x, y, z }) => ({ x, y, z }));
    const forward = {
      id: "hook-forward",
      kind: HookKinds.FORWARD_EXTRACTION,
      tiles: forwardTiles,
      requiredPass: PassMask.ALL,
    };
    const withPoint: PlayerView = {
      ...plain,
      mission: {
        ...plain.mission,
        map: {
          ...map,
          hooks: {
            ...map.hooks,
            objectives: [...map.hooks.objectives, forward],
          },
        },
        extraction: [...plain.mission.extraction, ...forwardTiles],
      },
    };
    expect(forwardTiles).toHaveLength(16);
    expect(backOfMap(withPoint)).toEqual(backOfMap(plain));
  });

  it("heads for the back it has not seen, urgently", () => {
    const view = field();
    const jobs = DESTROY_HIVE_CORE_STRATEGY.jobs(core, view);
    expect(jobs).toEqual([
      { order: { kind: "explore", goals: backOfMap(view), urgent: true } },
    ]);
  });

  it("with the back seen and no core in it, searches the frontier nearest the back", () => {
    const view = field((plain) => {
      const seen = new Set(plain.explored);
      for (const tile of backOfMap(plain)) {
        seen.add(plain.graph.index.keyOf(tile));
      }
      return seen;
    });
    const search = goals(view);
    const back = backOfMap(view);
    expect(search.length).toBeGreaterThan(0);
    for (const tile of search) {
      expect(view.explored.has(view.graph.index.keyOf(tile))).toBe(false);
    }
    // Nearest the back first: the first goal borders the back's ground.
    const first = search[0];
    expect(
      first !== undefined &&
        back.some(
          (tile) =>
            Math.max(Math.abs(tile.x - first.x), Math.abs(tile.z - first.z)) <=
            1,
        ),
    ).toBe(true);
  });

  it("gives no job with nothing left to explore", () => {
    const view = field(
      (plain) =>
        new Set(
          plain.mission.map.tiles.map((tile) => plain.graph.index.keyOf(tile)),
        ),
    );
    expect(DESTROY_HIVE_CORE_STRATEGY.jobs(core, view)).toEqual([]);
  });

  it("walks a long way home, so getting nearer the drop ship is progress", () => {
    expect(DESTROY_HIVE_CORE_STRATEGY.longWalkHome).toBe(true);
  });
});
