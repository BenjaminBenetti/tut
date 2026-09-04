import { describe, expect, it } from "vitest";

import { SurfaceIds } from "../../mapgen/data/surfaces";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import type { TacticalState } from "../../tactical/model/tactical-state";
import {
  missionWith,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { tileTop } from "../view/tactical-map-view";
import { mapCentre, missionFocus } from "./tactical-framing";

// ===========================================
// Fixtures
// ===========================================

const at = (x: number, z: number, y = 0) => ({ x, y, z });

/** A 40×40 field: big enough that the map centre is nowhere near a corner. */
function bigField(units: Parameters<typeof missionWith>[1]): TacticalState {
  return missionWith(
    new FixtureMapBuilder(40, 40, 2).fillGround(0, SurfaceIds.DIRT).build(),
    units,
  );
}

// ===========================================
// Tests
// ===========================================

describe("missionFocus", () => {
  it("frames the deployed force, not the middle of the map (#538)", () => {
    // The squad deploys in a corner, which is where QA found the camera
    // was not looking: twenty tiles from the map centre.
    const mission = bigField([
      unitAt("u1", "infantry", at(2, 2)),
      unitAt("u2", "infantry", at(3, 2)),
      unitAt("u3", "infantry", at(2, 3)),
    ]);
    expect(missionFocus(mission)).toEqual({
      x: 3,
      y: tileTop(0),
      z: 3,
    });
    expect(missionFocus(mission)).not.toEqual(mapCentre(mission));
  });

  it("centres a lone unit on its own tile", () => {
    const mission = bigField([unitAt("u1", "infantry", at(7, 9))]);
    expect(missionFocus(mission)).toEqual({ x: 7.5, y: tileTop(0), z: 9.5 });
  });

  it("takes in a unit posted away from the rest rather than averaging it out", () => {
    const near = bigField([
      unitAt("u1", "infantry", at(2, 2)),
      unitAt("u2", "infantry", at(3, 2)),
    ]);
    const spread = bigField([
      unitAt("u1", "infantry", at(2, 2)),
      unitAt("u2", "infantry", at(3, 2)),
      unitAt("u3", "infantry", at(20, 2)),
    ]);
    // The mean would sit at x ≈ 8.8; the bounding centre reaches 11.5,
    // halfway to the far unit so it shares the view with the others.
    expect(spread.units).toHaveLength(3);
    expect(missionFocus(spread).x).toBe(11.5);
    expect(missionFocus(near).x).toBe(3);
  });

  it("ignores bugs and the dead, which are not what the player deployed", () => {
    const mission = bigField([
      unitAt("u1", "infantry", at(2, 2)),
      unitAt("corpse", "infantry", at(30, 30), { hp: 0 }),
      unitAt("b1", "infantry", at(35, 35), { team: "bugs" }),
    ]);
    expect(missionFocus(mission)).toEqual({ x: 2.5, y: tileTop(0), z: 2.5 });
  });

  it("looks at the level the force is standing on, not the ground", () => {
    const mission = bigField([unitAt("u1", "infantry", at(4, 4, 1))]);
    expect(missionFocus(mission).y).toBe(tileTop(1));
  });

  it("falls back to the map centre with nothing deployed", () => {
    const mission = bigField([]);
    expect(missionFocus(mission)).toEqual(mapCentre(mission));
    expect(mapCentre(mission)).toEqual({ x: 20, y: 0, z: 20 });
  });
});
