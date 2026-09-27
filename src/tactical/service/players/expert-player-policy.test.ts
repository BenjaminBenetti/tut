import { describe, expect, it } from "vitest";

import { STOREY_LAYERS } from "../../../core/model/elevation";
import { PassMask } from "../../../mapgen/model/pass-mask";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../../mapgen/service/fixture-map-builder";
import { ATTACK } from "../../model/attack-command";
import { MOVE } from "../../model/move-command";
import { OVERWATCH } from "../../model/overwatch-command";
import { hasLineOfSight } from "../sight-service";
import { openField, unitAt } from "../tactical-fixtures.test-helper";
import { createExpertPlayerPolicy } from "./expert-player-policy.test-helper";
import type { UnitOrder } from "./objective-strategy.test-helper";
import {
  FIXTURE_PLAYER_RULES,
  lookingMission,
} from "./player-fixtures.test-helper";
import type { ForcePlan } from "./player-policy.test-helper";
import { observe } from "./player-view.test-helper";

const EXPERT = createExpertPlayerPolicy(FIXTURE_PLAYER_RULES);

/** One job for the whole force: the far corner. */
const PLAN: ForcePlan = {
  jobs: [{ order: { kind: "destroy", goals: [{ x: 7, y: 0, z: 7 }] } }],
  couriers: new Set(),
  settled: false,
};

describe("the expert player", () => {
  it("focus-fires on the bug it can kill rather than the nearest", () => {
    const mission = lookingMission([
      unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
      unitAt("near", "infantry", { x: 3, y: 0, z: 1 }, { team: "bugs" }),
      unitAt("weak", "infantry", { x: 5, y: 0, z: 1 }, { team: "bugs", hp: 2 }),
    ]);
    const view = observe(mission);
    const order: UnitOrder = { kind: "hunt", goals: [{ x: 3, y: 0, z: 1 }] };
    const command = EXPERT.next(view.own[0]!, order, view);
    expect(command?.type).toBe(ATTACK);
    expect(command?.payload).toMatchObject({
      attackerId: "alpha",
      targetId: "weak",
    });
  });

  it("fires on a focused target before the bugs it cannot kill", () => {
    // The hive core under waves that never stop: a bug in range the
    // squad cannot finish does not draw its fire from the core.
    const mission = lookingMission(
      [
        unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
        unitAt("runner", "infantry", { x: 1, y: 0, z: 4 }, { team: "bugs" }),
      ],
      {
        spawners: [
          {
            id: "core",
            pos: { x: 5, y: 0, z: 1 },
            hatchRadius: 1,
            hp: 60,
            timer: 3,
            destroyed: false,
          },
        ],
      },
    );
    const view = observe(mission);
    const order: UnitOrder = {
      kind: "destroy",
      goals: [{ x: 5, y: 0, z: 1 }],
      targetId: "core",
    };
    expect(EXPERT.next(view.own[0]!, order, view)?.payload).toMatchObject({
      targetId: "runner",
    });
    const focused = EXPERT.next(view.own[0]!, { ...order, focus: true }, view);
    expect(focused?.type).toBe(ATTACK);
    expect(focused?.payload).toMatchObject({ targetId: "core" });
  });

  it("goes on overwatch when it holds its ground with nothing in sight", () => {
    const mission = lookingMission([
      unitAt("alpha", "infantry", { x: 3, y: 0, z: 3 }),
    ]);
    const view = observe(mission);
    const order: UnitOrder = {
      kind: "guard",
      goals: [{ x: 3, y: 0, z: 3 }],
      holdRadius: 3,
    };
    const command = EXPERT.next(view.own[0]!, order, view);
    expect(command?.type).toBe(OVERWATCH);
  });

  it("sends a badly hurt unit home while two healthy ones fight on", () => {
    const mission = lookingMission([
      unitAt("alpha", "infantry", { x: 2, y: 0, z: 2 }),
      unitAt("bravo", "infantry", { x: 2, y: 0, z: 3 }),
      unitAt("hurt", "infantry", { x: 3, y: 0, z: 2 }, { hp: 3 }),
    ]);
    const orders = EXPERT.assign(observe(mission), PLAN);
    expect(orders.get("hurt")?.kind).toBe("extract");
    expect(orders.get("alpha")?.kind).toBe("destroy");
    expect(orders.get("bravo")?.kind).toBe("destroy");
  });

  it("walks the healthy home behind the courier once the job is done", () => {
    // The drop ship is at (0, 0): the courier's way home runs south-west,
    // so its escorts keep to the ground north-east of it, never in its way.
    const courier = { x: 5, y: 0, z: 5 };
    const mission = lookingMission([
      unitAt("courier", "infantry", courier),
      unitAt("alpha", "infantry", { x: 2, y: 0, z: 2 }),
      unitAt("iron", "mech", { x: 3, y: 0, z: 3 }),
      unitAt("hurt", "infantry", { x: 2, y: 0, z: 3 }, { hp: 3 }),
    ]);
    const done: ForcePlan = {
      jobs: [],
      couriers: new Set(["courier"]),
      settled: true,
    };
    const orders = EXPERT.assign(observe(mission), done);
    expect(orders.get("courier")?.kind).toBe("extract");
    expect(orders.get("hurt")?.kind).toBe("extract");
    const stepsHome = (tile: TileCoord): number => tile.x + tile.z;
    for (const id of ["alpha", "iron"]) {
      const order = orders.get(id);
      expect(order).toMatchObject({
        kind: "escort",
        holdRadius: 1,
        protect: ["courier"],
        urgent: true,
      });
      const goals = order?.goals ?? [];
      expect(goals.length).toBeGreaterThan(0);
      for (const goal of goals) {
        expect(
          Math.abs(goal.x - courier.x) + Math.abs(goal.z - courier.z),
        ).toBeLessThanOrEqual(2);
        expect(stepsHome(goal)).toBeGreaterThan(stepsHome(courier));
      }
    }
    const home = EXPERT.assign(observe(mission), {
      ...done,
      couriers: new Set(),
    });
    expect(home.get("alpha")?.kind).toBe("extract");
  });

  it("sends an escort in the courier's way home ahead of it", () => {
    // A corridor one tile wide from the drop ship at (0, 0): the escort
    // at x = 3 is between the courier and home, and cannot get behind it
    // but through it. It leads the way home; the one behind escorts.
    const corridor = new FixtureMapBuilder(8, 1, 3 * STOREY_LAYERS)
      .fillGround()
      .build();
    const mission = lookingMission(
      [
        unitAt("courier", "infantry", { x: 4, y: 0, z: 0 }),
        unitAt("ahead", "infantry", { x: 3, y: 0, z: 0 }),
        unitAt("behind", "infantry", { x: 6, y: 0, z: 0 }),
      ],
      {},
      corridor,
    );
    const done: ForcePlan = {
      jobs: [],
      couriers: new Set(["courier"]),
      settled: true,
    };
    const orders = EXPERT.assign(observe(mission), done);
    expect(orders.get("courier")?.kind).toBe("extract");
    expect(orders.get("ahead")?.kind).toBe("extract");
    expect(orders.get("behind")).toMatchObject({
      kind: "escort",
      protect: ["courier"],
    });
  });

  it("holds a courier that has pulled ahead until an escort catches up", () => {
    // The courier is 2 steps from the drop ship at (0, 0) and its escort
    // 12: the courier waits where it stands. Once the escort is 4 steps
    // out, within the lead it may keep, the courier goes home.
    const done: ForcePlan = {
      jobs: [],
      couriers: new Set(["courier"]),
      settled: true,
    };
    const courier = { x: 1, y: 0, z: 1 };
    const behind = lookingMission([
      unitAt("courier", "infantry", courier),
      unitAt("alpha", "infantry", { x: 6, y: 0, z: 6 }),
    ]);
    expect(EXPERT.assign(observe(behind), done).get("courier")).toMatchObject({
      kind: "guard",
      goals: [courier],
      holdRadius: 0,
    });
    const close = lookingMission([
      unitAt("courier", "infantry", courier),
      unitAt("alpha", "infantry", { x: 2, y: 0, z: 2 }),
    ]);
    expect(EXPERT.assign(observe(close), done).get("courier")?.kind).toBe(
      "extract",
    );
  });

  it("pulls everyone out when a quarter of the force is left", () => {
    const mission = lookingMission([
      unitAt("alpha", "infantry", { x: 2, y: 0, z: 2 }),
      unitAt("bravo", "infantry", { x: 2, y: 0, z: 3 }, { hp: 0 }),
      unitAt("charlie", "infantry", { x: 3, y: 0, z: 2 }, { hp: 0 }),
      unitAt("delta", "infantry", { x: 3, y: 0, z: 3 }, { hp: 0 }),
    ]);
    const orders = EXPERT.assign(observe(mission), PLAN);
    expect(orders.get("alpha")?.kind).toBe("extract");
  });

  it("walks round to see a bug holding the doorway it hides behind", () => {
    // A wall between x = 3 and x = 4 with doors at z = 2 and z = 6. The
    // bug stands in the z = 2 doorway, so walking at it gets no closer
    // and the door blocks the view: the other door is the way to see it.
    const builder = openField();
    for (let z = 0; z < 8; z++) {
      builder.wall(
        { x: 3, y: 0, z },
        "e",
        z === 2 || z === 6 ? "door" : "solid",
      );
    }
    const map = builder.build();
    const bug = { x: 4, y: 0, z: 2 };
    const mission = lookingMission(
      [
        unitAt("alpha", "infantry", { x: 3, y: 0, z: 2 }),
        unitAt("spitter", "infantry", bug, { team: "bugs" }),
      ],
      {},
      map,
    );
    const view = observe(mission);
    expect(view.enemies).toHaveLength(0);
    const order: UnitOrder = { kind: "hunt", goals: [bug] };
    const command = EXPERT.next(view.own[0]!, order, view);
    expect(command?.type).toBe(MOVE);
    const path = (command?.payload as { path: readonly TileCoord[] }).path;
    const end = path[path.length - 1]!;
    expect(end.x).toBeGreaterThanOrEqual(4);
    expect(hasLineOfSight(map, end, bug)).toBe(true);
  });

  it("keeps a mech's firing line rather than stepping behind the target's walls", () => {
    // The bug holds the back of a two-tile room a mech cannot enter,
    // walled but for a window at the front. Every tile one step from the
    // room is closer to the goal and blind; the mech, whose shot ends its
    // turn, sees the bug through the window from where it stands.
    //
    //   z=4   . . . . █b█ . .     b the bug, █ solid wall
    //   z=5   . . . . █·█ . .     · the room's front tile
    //   z=6   . . . . .M. . .     M the mech, looking in through the window
    const bug = { x: 5, y: 0, z: 4 };
    const front = { x: 5, y: 0, z: 5 };
    const map = openField()
      .patchTile(bug, { pass: PassMask.INFANTRY })
      .patchTile(front, { pass: PassMask.INFANTRY })
      .wall(bug, "w", "solid")
      .wall(bug, "n", "solid")
      .wall(bug, "e", "solid")
      .wall(front, "w", "solid")
      .wall(front, "e", "solid")
      .wall(front, "s", "window")
      .build();
    const mission = lookingMission(
      [
        unitAt("iron", "mech", { x: 5, y: 0, z: 6 }),
        unitAt("spitter", "infantry", bug, { team: "bugs" }),
      ],
      {},
      map,
    );
    const view = observe(mission);
    expect(view.enemies.map((enemy) => enemy.id)).toEqual(["spitter"]);
    for (const step of [
      { x: 4, y: 0, z: 4 },
      { x: 6, y: 0, z: 4 },
    ]) {
      expect(hasLineOfSight(map, step, bug)).toBe(false);
    }
    const order: UnitOrder = { kind: "hunt", goals: [bug] };
    const command = EXPERT.next(view.own[0]!, order, view);
    expect(command?.type).toBe(ATTACK);
    expect(command?.payload).toMatchObject({ targetId: "spitter" });
  });

  it("moves its mechs before its squads", () => {
    const mission = lookingMission([
      unitAt("alpha", "infantry", { x: 2, y: 0, z: 2 }),
      unitAt("iron", "mech", { x: 4, y: 0, z: 4 }),
    ]);
    expect(EXPERT.actingOrder(observe(mission))).toEqual(["iron", "alpha"]);
  });
});
