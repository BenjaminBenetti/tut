import { describe, expect, it } from "vitest";

import { ATTACK } from "../../model/attack-command";
import { MOVE } from "../../model/move-command";
import { unitAt } from "../tactical-fixtures.test-helper";
import { createNewPlayerPolicy } from "./new-player-policy.test-helper";
import type { UnitOrder } from "./objective-strategy.test-helper";
import {
  FIXTURE_PLAYER_RULES,
  lookingMission,
} from "./player-fixtures.test-helper";
import type { ForcePlan } from "./player-policy.test-helper";
import { observe } from "./player-view.test-helper";

const NEW = createNewPlayerPolicy(FIXTURE_PLAYER_RULES);

/** One job for the whole force: the far corner. */
const PLAN: ForcePlan = {
  jobs: [{ order: { kind: "destroy", goals: [{ x: 7, y: 0, z: 7 }] } }],
  couriers: new Set(),
  walkers: new Set(),
  spared: new Set(),
  settled: false,
};

describe("the new player", () => {
  it("shoots the nearest bug even when a farther one would die", () => {
    const mission = lookingMission([
      unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
      unitAt("near", "infantry", { x: 3, y: 0, z: 1 }, { team: "bugs" }),
      unitAt("weak", "infantry", { x: 5, y: 0, z: 1 }, { team: "bugs", hp: 2 }),
    ]);
    const view = observe(mission);
    const order: UnitOrder = { kind: "hunt", goals: [{ x: 3, y: 0, z: 1 }] };
    const command = NEW.next(view.own[0]!, order, view);
    expect(command?.type).toBe(ATTACK);
    expect(command?.payload).toMatchObject({
      attackerId: "alpha",
      targetId: "near",
    });
  });

  it("holds a shot that could kill a bug the order spares, and takes one that can only wound", () => {
    // A lurker to net, two tiles off: at 2 hit points the fixture rifle
    // could kill it, at 10 it cannot.
    const order: UnitOrder = {
      kind: "capture",
      goals: [{ x: 3, y: 0, z: 1 }],
      spare: ["lurker"],
    };
    const worn = observe(
      lookingMission([
        unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
        unitAt(
          "lurker",
          "infantry",
          { x: 3, y: 0, z: 1 },
          {
            team: "bugs",
            hp: 2,
          },
        ),
      ]),
    );
    expect(NEW.next(worn.own[0]!, order, worn)?.type).not.toBe(ATTACK);
    const { spare: _all, ...unspared } = order;
    expect(NEW.next(worn.own[0]!, unspared, worn)?.type).toBe(ATTACK);
    const fresh = observe(
      lookingMission([
        unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
        unitAt("lurker", "infantry", { x: 3, y: 0, z: 1 }, { team: "bugs" }),
      ]),
    );
    expect(NEW.next(fresh.own[0]!, order, fresh)?.payload).toMatchObject({
      targetId: "lurker",
    });
  });

  it("walks a courier home before it trades shots", () => {
    // Carrying a specimen home, a bug in its sights: the courier steps
    // toward the drop ship; the same unit on an ordinary way home fires.
    const view = observe(
      lookingMission([
        unitAt("alpha", "infantry", { x: 4, y: 0, z: 4 }),
        unitAt("bug", "infantry", { x: 6, y: 0, z: 4 }, { team: "bugs" }),
      ]),
    );
    const home: UnitOrder = { kind: "extract", goals: [{ x: 0, y: 0, z: 0 }] };
    expect(NEW.next(view.own[0]!, home, view)?.type).toBe(ATTACK);
    const carry = NEW.next(view.own[0]!, { ...home, courier: true }, view);
    expect(carry?.type).toBe(MOVE);
  });

  it("never goes on overwatch: holding its ground, it does nothing", () => {
    const mission = lookingMission([
      unitAt("alpha", "infantry", { x: 3, y: 0, z: 3 }),
    ]);
    const view = observe(mission);
    const order: UnitOrder = {
      kind: "guard",
      goals: [{ x: 3, y: 0, z: 3 }],
      holdRadius: 3,
    };
    expect(NEW.next(view.own[0]!, order, view)).toBeUndefined();
  });

  it("walks one action toward its goal when nothing is in sight", () => {
    const mission = lookingMission([
      unitAt("alpha", "infantry", { x: 0, y: 0, z: 0 }),
    ]);
    const view = observe(mission);
    const order: UnitOrder = { kind: "destroy", goals: [{ x: 7, y: 0, z: 7 }] };
    const command = NEW.next(view.own[0]!, order, view);
    expect(command?.type).toBe(MOVE);
    const path = (
      command?.payload as { path: readonly { x: number; z: number }[] }
    ).path;
    const last = path[path.length - 1]!;
    expect(last.x + last.z).toBe(3);
  });

  it("keeps a badly hurt unit on the job", () => {
    const mission = lookingMission([
      unitAt("alpha", "infantry", { x: 2, y: 0, z: 2 }),
      unitAt("bravo", "infantry", { x: 2, y: 0, z: 3 }),
      unitAt("hurt", "infantry", { x: 3, y: 0, z: 2 }, { hp: 3 }),
    ]);
    const orders = NEW.assign(observe(mission), PLAN);
    expect(orders.get("hurt")?.kind).toBe("destroy");
  });

  it("acts in roster order", () => {
    const mission = lookingMission([
      unitAt("alpha", "infantry", { x: 2, y: 0, z: 2 }),
      unitAt("iron", "mech", { x: 4, y: 0, z: 4 }),
    ]);
    expect(NEW.actingOrder(observe(mission))).toEqual(["alpha", "iron"]);
  });
});
