import { describe, expect, it } from "vitest";

import type { Objective } from "../../model/tactical-state";
import { unitAt } from "../tactical-fixtures.test-helper";
import {
  homeProgress,
  NO_HOME_PROGRESS,
  walksFarHome,
} from "./home-progress.test-helper";
import { OBJECTIVE_STRATEGIES } from "./objective-strategies.test-helper";
import { lookingMission } from "./player-fixtures.test-helper";
import { observe } from "./player-view.test-helper";

/** A hive core already down: settled, with only the walk home left. */
const CORE_DOWN: Objective = {
  id: "objective-1",
  kind: "destroy-hive-core",
  targetId: "core",
  complete: true,
};

/** A nest already down: settled, on a short walk home. */
const NEST_DOWN: Objective = {
  id: "objective-1",
  kind: "destroy-spawner",
  targetId: "nest",
  complete: true,
};

/** One squad at (`x`, `z`) on the open field, the drop ship at the origin. */
function squadAt(x: number, z: number, objective: Objective = CORE_DOWN) {
  return observe(
    lookingMission([unitAt("alpha", "infantry", { x, y: 0, z })], {
      objectives: [objective],
    }),
  );
}

describe("the walk home's progress", () => {
  it("is watched for the hive core, whose walk home is long, and not for a nest", () => {
    expect(walksFarHome(squadAt(5, 5), OBJECTIVE_STRATEGIES)).toBe(true);
    expect(walksFarHome(squadAt(5, 5, NEST_DOWN), OBJECTIVE_STRATEGIES)).toBe(
      false,
    );
  });

  it("only sets a first best the turn the force settles", () => {
    const first = homeProgress(squadAt(5, 5), NO_HOME_PROGRESS.bests);
    expect(first.nearer).toBe(false);
    expect(first.bests.get("alpha")).toBe(10);
  });

  it("counts a unit nearer the drop ship than its best", () => {
    const first = homeProgress(squadAt(5, 5), NO_HOME_PROGRESS.bests);
    const second = homeProgress(squadAt(4, 5), first.bests);
    expect(second.nearer).toBe(true);
    expect(second.bests.get("alpha")).toBe(9);
  });

  it("does not count a unit pacing back and forth short of its best", () => {
    const first = homeProgress(squadAt(4, 5), NO_HOME_PROGRESS.bests);
    const away = homeProgress(squadAt(5, 5), first.bests);
    const back = homeProgress(squadAt(4, 5), away.bests);
    expect(away.nearer).toBe(false);
    expect(back.nearer).toBe(false);
    expect(back.bests.get("alpha")).toBe(9);
  });
});
