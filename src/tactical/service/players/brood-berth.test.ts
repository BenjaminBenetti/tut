import { describe, expect, it } from "vitest";

import { STOREY_LAYERS } from "../../../core/model/elevation";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../../mapgen/service/fixture-map-builder";
import { ATTACK } from "../../model/attack-command";
import { MOVE } from "../../model/move-command";
import { unitAt } from "../tactical-fixtures.test-helper";
import {
  awakeView,
  sleeperGround,
  wakesSleepers,
} from "./brood-berth.test-helper";
import { createExpertPlayerPolicy } from "./expert-player-policy.test-helper";
import type { UnitOrder } from "./objective-strategy.test-helper";
import {
  FIXTURE_PLAYER_RULES,
  lookingMission,
} from "./player-fixtures.test-helper";
import { observe } from "./player-view.test-helper";

const EXPERT = createExpertPlayerPolicy(FIXTURE_PLAYER_RULES);

/** Flat distance on the ground plane. */
function flat(a: TileCoord, b: TileCoord): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** A dormant bug: a member of a sleeping brood. */
function sleeperAt(id: string, pos: TileCoord) {
  return unitAt(id, "infantry", pos, { team: "bugs", status: ["dormant"] });
}

describe("letting sleeping broods lie", () => {
  it("counts only the awake bugs as contact", () => {
    const mission = lookingMission([
      unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
      sleeperAt("sleeper", { x: 4, y: 0, z: 1 }),
      unitAt("runner", "infantry", { x: 1, y: 0, z: 4 }, { team: "bugs" }),
    ]);
    const view = observe(mission);
    expect(view.enemies.map((enemy) => enemy.id).sort()).toEqual([
      "runner",
      "sleeper",
    ]);
    expect(awakeView(view).enemies.map((enemy) => enemy.id)).toEqual([
      "runner",
    ]);
  });

  it("does not shoot a sleeper it could hit", () => {
    const mission = lookingMission([
      unitAt("alpha", "infantry", { x: 1, y: 0, z: 1 }),
      sleeperAt("sleeper", { x: 4, y: 0, z: 1 }),
    ]);
    const view = observe(mission);
    const order: UnitOrder = { kind: "guard", goals: [{ x: 1, y: 0, z: 1 }] };
    const command = EXPERT.next(view.own[0]!, order, view);
    expect(command?.type).not.toBe(ATTACK);
  });

  it("walks at full pace with only sleepers in sight", () => {
    // A sleeper is not contact: the unit spends both actions walking
    // (six tiles at the fixture's move of three), not one.
    const map = new FixtureMapBuilder(30, 16, 3 * STOREY_LAYERS)
      .fillGround()
      .build();
    const mission = lookingMission(
      [
        unitAt("alpha", "infantry", { x: 2, y: 0, z: 8 }),
        sleeperAt("sleeper", { x: 2, y: 0, z: 15 }),
      ],
      {},
      map,
    );
    const view = observe(mission);
    expect(view.enemies.map((enemy) => enemy.id)).toEqual(["sleeper"]);
    const order: UnitOrder = {
      kind: "destroy",
      goals: [{ x: 28, y: 0, z: 8 }],
    };
    const command = EXPERT.next(view.own[0]!, order, view);
    expect(command?.type).toBe(MOVE);
    const path = (command?.payload as { path: readonly TileCoord[] }).path;
    expect(path.length).toBeGreaterThan(3);
  });

  it("keeps a unit already inside a berth from stepping nearer", () => {
    const sleeper = { x: 4, y: 0, z: 4 };
    const unit = { x: 4, y: 0, z: 7 };
    const mission = lookingMission([
      unitAt("alpha", "infantry", unit),
      sleeperAt("sleeper", sleeper),
    ]);
    const view = observe(mission);
    const index = view.graph.index;
    const whole = sleeperGround(view);
    const mine = sleeperGround(view, [], unit);
    expect(whole.has(index.keyOf(unit))).toBe(true);
    expect(mine.has(index.keyOf(unit))).toBe(false);
    expect(mine.has(index.keyOf({ x: 4, y: 0, z: 5 }))).toBe(true);
    expect(mine.has(index.keyOf({ x: 0, y: 0, z: 0 }))).toBe(false);
  });

  it("walks round a sleeper on its way rather than past it", () => {
    // A long field with the goal at the far end and a sleeper on the
    // straight line to it. The unit sees the sleeper from 8 tiles and
    // walks off the line, never nearer the sleeper than it stands.
    const map = new FixtureMapBuilder(30, 16, 3 * STOREY_LAYERS)
      .fillGround()
      .build();
    const start = { x: 6, y: 0, z: 2 };
    const sleeper = { x: 14, y: 0, z: 2 };
    const mission = lookingMission(
      [unitAt("alpha", "infantry", start), sleeperAt("sleeper", sleeper)],
      {},
      map,
    );
    const view = observe(mission);
    expect(view.enemies.map((enemy) => enemy.id)).toEqual(["sleeper"]);
    const order: UnitOrder = {
      kind: "destroy",
      goals: [{ x: 28, y: 0, z: 2 }],
    };
    const command = EXPERT.next(view.own[0]!, order, view);
    expect(command?.type).toBe(MOVE);
    const path = (command?.payload as { path: readonly TileCoord[] }).path;
    for (const tile of path) {
      expect(flat(tile, sleeper)).toBeGreaterThanOrEqual(flat(start, sleeper));
    }
  });

  it("walks on past a sleeper that lies across the only way", () => {
    // A tunnel one tile wide: no way round the sleeper, so the brood is
    // the price of the goal and the unit keeps walking.
    const map = new FixtureMapBuilder(30, 1, 3 * STOREY_LAYERS)
      .fillGround()
      .build();
    const start = { x: 6, y: 0, z: 0 };
    const mission = lookingMission(
      [
        unitAt("alpha", "infantry", start),
        sleeperAt("sleeper", { x: 14, y: 0, z: 0 }),
      ],
      {},
      map,
    );
    const view = observe(mission);
    expect(view.enemies.map((enemy) => enemy.id)).toEqual(["sleeper"]);
    const order: UnitOrder = {
      kind: "destroy",
      goals: [{ x: 28, y: 0, z: 0 }],
    };
    const command = EXPERT.next(view.own[0]!, order, view);
    expect(command?.type).toBe(MOVE);
    const path = (command?.payload as { path: readonly TileCoord[] }).path;
    expect(path[path.length - 1]!.x).toBeGreaterThan(start.x);
  });

  it("holds fire that would land among sleepers or be heard by them", () => {
    const mission = lookingMission([
      unitAt("alpha", "infantry", { x: 0, y: 0, z: 0 }),
      sleeperAt("sleeper", { x: 5, y: 0, z: 3 }),
    ]);
    const view = observe(mission);
    expect(view.enemies.map((enemy) => enemy.id)).toEqual(["sleeper"]);
    const far = { x: 0, y: 0, z: 7 };
    const among = { x: 4, y: 0, z: 3 };
    expect(wakesSleepers(view, far, far, false)).toBe(false);
    expect(wakesSleepers(view, far, among, false)).toBe(true);
    expect(wakesSleepers(view, far, far, true)).toBe(true);
    expect(wakesSleepers(awakeView(view), far, among, true)).toBe(false);
  });
});
