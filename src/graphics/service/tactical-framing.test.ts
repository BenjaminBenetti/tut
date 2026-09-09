import { describe, expect, it } from "vitest";

import { DIRECTIONS, type Direction } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import {
  dropshipBoardingTiles,
  dropshipFootprint,
} from "../../mapgen/service/dropship-site-layout";
import { createCameraState, cameraPosition } from "./camera-math";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import type { TacticalState } from "../../tactical/model/tactical-state";
import {
  missionWith,
  unitAt,
} from "../../tactical/service/tactical-fixtures.test-helper";
import { tileTop } from "../view/tactical-map-view";
import { mapCentre, missionFocus, missionArrivalYaw } from "./tactical-framing";

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

/** A force on the real 4×4 boarding layout, with a remote enemy and dead ally. */
function landingMission(facing: Direction): TacticalState {
  const clearance = {
    x: 2,
    z: 2,
    w: facing === "n" || facing === "s" ? 7 : 13,
    d: facing === "n" || facing === "s" ? 13 : 7,
  };
  const tiles = dropshipBoardingTiles(clearance, facing, 0);
  const base = bigField([
    unitAt("u1", "infantry", tiles[0]!),
    unitAt("u2", "infantry", tiles[1]!),
    unitAt("enemy", "infantry", at(39, 39), { team: "bugs" }),
    unitAt("dead", "infantry", at(0, 0), { hp: 0 }),
  ]);
  return {
    ...base,
    map: {
      ...base.map,
      dropships: [
        {
          deployZoneId: "landing",
          clearance,
          footprint: dropshipFootprint(clearance, facing),
          level: 0,
          facing,
        },
      ],
      hooks: {
        ...base.map.hooks,
        deployZones: [
          { id: "landing", kind: "deploy", requiredPass: 3, tiles },
        ],
      },
    },
  };
}

describe("missionArrivalYaw", () => {
  it.each(DIRECTIONS)(
    "views a %s-facing aircraft from the external boarding side",
    (facing) => {
      const mission = landingMission(facing);
      const target = missionFocus(mission);
      const camera = cameraPosition(
        createCameraState({ target, yawIndex: missionArrivalYaw(mission) }),
        100,
      );
      const nose = stepGridPos({ x: 0, y: 0, z: 0 }, facing);
      // Geometry, not a duplicated yaw lookup: the viewer is behind the nose plane.
      expect(
        (camera.x - target.x) * nose.x + (camera.z - target.z) * nose.z,
      ).toBeLessThan(0);
    },
  );

  it("retains the normal view once part of the force has left boarding", () => {
    const mission = landingMission("s");
    expect(
      missionArrivalYaw({
        ...mission,
        units: mission.units.map((unit) =>
          unit.id === "u2" ? { ...unit, pos: at(30, 30) } : unit,
        ),
      }),
    ).toBe(0);
  });

  it("retains the normal view for an old map without a recorded aircraft", () => {
    const mission = landingMission("s");
    const { dropships: _sites, ...oldMap } = mission.map;
    expect(missionArrivalYaw({ ...mission, map: oldMap })).toBe(0);
  });

  it("does not aim at an aircraft when no living force remains", () => {
    const mission = landingMission("s");
    expect(
      missionArrivalYaw({
        ...mission,
        units: mission.units.map((unit) => ({ ...unit, hp: 0 })),
      }),
    ).toBe(0);
  });
});
