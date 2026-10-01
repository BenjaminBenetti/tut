import { describe, expect, it } from "vitest";

import { STOREY_LAYERS } from "../../../core/model/elevation";
import { PassMask } from "../../../mapgen/model/pass-mask";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../../mapgen/service/fixture-map-builder";
import { ATTACK } from "../../model/attack-command";
import { INTERACT } from "../../model/interact-command";
import { MOVE } from "../../model/move-command";
import { OVERWATCH } from "../../model/overwatch-command";
import { USE_EQUIPMENT } from "../../model/use-equipment-command";
import { GRENADE } from "../../data/equipment";
import { hasLineOfSight } from "../sight-service";
import {
  FIXTURE_TEMPLATES,
  openField,
  unitAt,
  walledField,
} from "../tactical-fixtures.test-helper";
import { createExpertPlayerPolicy } from "./expert-player-policy.test-helper";
import type { UnitOrder } from "./objective-strategy.test-helper";
import {
  FIXTURE_PLAYER_RULES,
  lookingMission,
  tunnelMission,
} from "./player-fixtures.test-helper";
import type { ForcePlan } from "./player-policy.test-helper";
import { observe } from "./player-view.test-helper";

const EXPERT = createExpertPlayerPolicy(FIXTURE_PLAYER_RULES);

/** One job for the whole force: the far corner. */
const PLAN: ForcePlan = {
  jobs: [{ order: { kind: "destroy", goals: [{ x: 7, y: 0, z: 7 }] } }],
  couriers: new Set(),
  walkers: new Set(),
  spared: new Set(),
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

  it("fires on a focused bug before the bugs it cannot kill", () => {
    // The Broodmother: named by the order, shot wherever she stands in
    // sight, though a nearer bug offers the better shot.
    const mission = lookingMission([
      unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
      unitAt("runner", "infantry", { x: 1, y: 0, z: 3 }, { team: "bugs" }),
      unitAt("mother", "infantry", { x: 5, y: 0, z: 2 }, { team: "bugs" }),
    ]);
    const view = observe(mission);
    const order: UnitOrder = {
      kind: "hunt",
      goals: [{ x: 5, y: 0, z: 2 }],
      targetId: "mother",
    };
    expect(EXPERT.next(view.own[0]!, order, view)?.payload).toMatchObject({
      targetId: "runner",
    });
    const focused = EXPERT.next(view.own[0]!, { ...order, focus: true }, view);
    expect(focused?.type).toBe(ATTACK);
    expect(focused?.payload).toMatchObject({ targetId: "mother" });
  });

  it("fires on the first bug the order puts first before a likelier kill", () => {
    // A tunnel job's charge threats: the bug that could bite the charge
    // goes first, though another offers the kill.
    const mission = lookingMission([
      unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
      unitAt("near", "infantry", { x: 3, y: 0, z: 1 }, { team: "bugs" }),
      unitAt("weak", "infantry", { x: 5, y: 0, z: 1 }, { team: "bugs", hp: 2 }),
    ]);
    const view = observe(mission);
    const order: UnitOrder = {
      kind: "guard",
      goals: [{ x: 1, y: 0, z: 1 }],
      holdRadius: 0,
    };
    expect(EXPERT.next(view.own[0]!, order, view)?.payload).toMatchObject({
      targetId: "weak",
    });
    const first = EXPERT.next(
      view.own[0]!,
      { ...order, priority: ["gone", "near", "weak"] },
      view,
    );
    expect(first?.type).toBe(ATTACK);
    expect(first?.payload).toMatchObject({ targetId: "near" });
  });

  it("shoots a bug that could bite the mouth before setting its charge, and sets it with none in its sights", () => {
    const mission = tunnelMission(
      [
        unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
        unitAt("near", "infantry", { x: 4, y: 0, z: 1 }, { team: "bugs" }),
      ],
      [{ id: "tunnel-1", pos: { x: 1, y: 0, z: 2 }, state: "open" }],
    );
    const view = observe(mission);
    const order: UnitOrder = {
      kind: "work",
      goals: [{ x: 1, y: 0, z: 2 }],
      interact: "seal",
    };
    expect(EXPERT.next(view.own[0]!, order, view)?.type).toBe(INTERACT);
    const clearing = EXPERT.next(
      view.own[0]!,
      { ...order, priority: ["near"] },
      view,
    );
    expect(clearing?.type).toBe(ATTACK);
    expect(clearing?.payload).toMatchObject({ targetId: "near" });
  });

  describe("hunting a specimen", () => {
    /** Hold the ground it stands on, wanting a lurker alive. */
    const HOLD: UnitOrder = {
      kind: "guard",
      goals: [{ x: 0, y: 0, z: 3 }],
      holdRadius: 3,
      capture: "lurker",
    };

    it("neither shoots nor watches the worn-down specimen in sight it could finish", () => {
      // Three tiles off, in the rifle's reach; the fixture rifle hits for
      // up to 4, so a shot or a reaction could kill it at 4 hit points.
      const worn = observe(
        lookingMission([
          unitAt("alpha", "infantry", { x: 0, y: 0, z: 3 }),
          unitAt(
            "lurker",
            "infantry",
            { x: 3, y: 0, z: 3 },
            {
              team: "bugs",
              hp: 4,
            },
          ),
        ]),
      );
      expect(worn.enemies.map((enemy) => enemy.id)).toEqual(["lurker"]);
      expect(EXPERT.next(worn.own[0]!, HOLD, worn)).toBeUndefined();
      const { capture: _free, ...unwanted } = HOLD;
      expect(EXPERT.next(worn.own[0]!, unwanted, worn)?.type).toBe(ATTACK);
    });

    it("holds a shot that could kill a bug its order spares, whatever the job", () => {
      // No capture order: an escort on its way, the lurker spared by the
      // plan. At 4 hit points the fixture rifle could kill it.
      const worn = observe(
        lookingMission([
          unitAt("alpha", "infantry", { x: 0, y: 0, z: 3 }),
          unitAt(
            "lurker",
            "infantry",
            { x: 3, y: 0, z: 3 },
            {
              team: "bugs",
              hp: 4,
            },
          ),
        ]),
      );
      const escort: UnitOrder = {
        kind: "escort",
        goals: [{ x: 0, y: 0, z: 3 }],
        holdRadius: 3,
      };
      expect(EXPERT.next(worn.own[0]!, escort, worn)?.type).toBe(ATTACK);
      const spared = EXPERT.next(
        worn.own[0]!,
        { ...escort, spare: ["lurker"] },
        worn,
      );
      expect(spared?.type).not.toBe(ATTACK);
      expect(spared?.type).not.toBe(OVERWATCH);
    });

    it("throws no grenade whose blast would catch a bug its order spares", () => {
      // Two bugs side by side, one of them the spared lurker: the blast
      // that would take both is held.
      const mission = lookingMission([
        unitAt("alpha", "infantry", { x: 0, y: 0, z: 3 }),
        unitAt("lurker", "infantry", { x: 3, y: 0, z: 3 }, { team: "bugs" }),
        unitAt("runner", "infantry", { x: 3, y: 0, z: 4 }, { team: "bugs" }),
      ]);
      const squad = mission.templates[FIXTURE_TEMPLATES.infantry];
      if (squad === undefined) throw new Error("fixture squad template");
      const armed = observe({
        ...mission,
        templates: {
          ...mission.templates,
          [FIXTURE_TEMPLATES.infantry]: { ...squad, equipment: [GRENADE.id] },
        },
      });
      const escort: UnitOrder = {
        kind: "escort",
        goals: [{ x: 0, y: 0, z: 3 }],
        holdRadius: 3,
      };
      expect(EXPERT.next(armed.own[0]!, escort, armed)?.type).toBe(
        USE_EQUIPMENT,
      );
      const spared = EXPERT.next(
        armed.own[0]!,
        { ...escort, spare: ["lurker"] },
        armed,
      );
      expect(spared?.type).not.toBe(USE_EQUIPMENT);
    });

    it("keeps off overwatch with none in sight when its reaction could kill a fresh one", () => {
      // Behind the wall, out of sight: judged at the species' full hit points.
      const hunter = unitAt("alpha", "infantry", { x: 0, y: 0, z: 3 });
      const hidden = unitAt(
        "lurker",
        "infantry",
        { x: 7, y: 0, z: 7 },
        {
          team: "bugs",
        },
      );
      const hardy = observe(
        lookingMission([hunter, hidden], {}, walledField()),
      );
      expect(hardy.enemies).toEqual([]);
      expect(EXPERT.next(hardy.own[0]!, HOLD, hardy)?.type).toBe(OVERWATCH);
      const frail = observe(
        lookingMission(
          [hunter, { ...hidden, hp: 4, maxHp: 4 }],
          {},
          walledField(),
        ),
      );
      expect(EXPERT.next(frail.own[0]!, HOLD, frail)).toBeUndefined();
      const { capture: _unused, ...unwanted } = HOLD;
      expect(EXPERT.next(frail.own[0]!, unwanted, frail)?.type).toBe(OVERWATCH);
    });
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
      walkers: new Set(),
      spared: new Set(),
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
      walkers: new Set(),
      spared: new Set(),
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
      walkers: new Set(),
      spared: new Set(),
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
      walkers: new Set(),
      spared: new Set(),
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
