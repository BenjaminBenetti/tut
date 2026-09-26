import { describe, expect, it } from "vitest";

import { SOVEREIGN_RETREATING } from "../../tactical/model/sovereign-retreating-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import {
  ctxWith,
  riggedRng,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { fieldMap } from "./broodmother.test-helper";
import {
  createSovereignRetreatStep,
  sovereignRetreat,
} from "./sovereign-retreat-step";
import { isSovereign, sovereignHp } from "./sovereign-service";
import { sovereignMission } from "./sovereign.test-helper";

/** The Sovereign at difficulty 1 (120 hp) on `hp`. */
function at(hp: number): TacticalState {
  return sovereignMission(
    fieldMap(20, 20).build(),
    [],
    { x: 5, y: 0, z: 5 },
    {
      hp,
    },
  ).mission;
}

describe("sovereignRetreat (#1179, campaign arc §9)", () => {
  it("marks her at 40 % of her hit points and announces it once", () => {
    // 40 % of 120 is 48: the fixture sits on the threshold.
    expect(sovereignHp(1) * 0.4).toBe(48);
    const mission = at(48);
    const her = mission.units.find(isSovereign)!;
    const applied = sovereignRetreat(mission);
    expect(applied.state.units.find(isSovereign)?.retreating).toBe(true);
    expect(applied.events).toEqual([
      {
        type: SOVEREIGN_RETREATING,
        payload: { unitId: her.id, hp: 48, maxHp: 120 },
      },
    ]);
    // Marked, she is not announced again, healed or not.
    const again = createSovereignRetreatStep()(
      {
        ...applied.state,
        units: applied.state.units.map((u) =>
          isSovereign(u) ? { ...u, hp: 120 } : u,
        ),
      },
      ctxWith(riggedRng(true)),
    );
    expect(again.events).toEqual([]);
    expect(again.state.units.find(isSovereign)?.retreating).toBe(true);
  });

  it("leaves her be a point above the threshold, and a dead Sovereign too", () => {
    const healthy = at(49);
    expect(sovereignRetreat(healthy).state).toBe(healthy);
    const dead = at(0);
    expect(sovereignRetreat(dead).events).toEqual([]);
  });
});
