import { describe, expect, it } from "vitest";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { Objective, Spawner } from "../model/tactical-state";
import type { TacticalState } from "../model/tactical-state";
import { objectiveMarkers } from "./objective-marker-service";
import { DESTROY_SPAWNER_OBJECTIVE } from "./objectives/destroy-spawner-objective";
import { OBJECTIVE_RULES } from "./objectives/objective-rules";
import { missionWith, unitAt } from "./tactical-fixtures.test-helper";
import { perceivedSpawners, withVision } from "./vision-service";

const ORIGIN = { x: 1, y: 0, z: 1 };
/** Beside the squad: in view from the first turn. */
const NEAR = { x: 2, y: 0, z: 1 };
/** Across the field: well outside any squad's sight. */
const FAR = { x: 35, y: 0, z: 35 };

/** A standing nest at `pos`. */
function nest(id: string, pos: { x: number; y: number; z: number }): Spawner {
  return { id, pos, hp: 20, destroyed: false, timer: 3, hatchRadius: 3 };
}

/** The objective that tracks `targetId`. */
function objective(id: string, targetId: string, complete = false): Objective {
  return { id, kind: "destroy-spawner", targetId, complete };
}

/** One squad on an open field with the given nests, vision computed from where it stands. */
function missionWithNests(
  spawners: readonly Spawner[],
  objectives: readonly Objective[],
): TacticalState {
  const base = missionWith(
    new FixtureMapBuilder(40, 40, 1).fillGround().build(),
    [unitAt("squad", "infantry", ORIGIN)],
  );
  return withVision({ state: { ...base, spawners, objectives }, events: [] })
    .state;
}

describe("objectiveMarkers", () => {
  it("marks the open objective the squad cannot see and not the one beside it (#1173)", () => {
    const mission = missionWithNests(
      [nest("near", NEAR), nest("far", FAR)],
      [objective("o-near", "near"), objective("o-far", "far")],
    );
    const index = new TileIndex(mission.map);
    expect(mission.vision.tdf.visible).toContain(index.keyOf(NEAR));
    expect(mission.vision.tdf.visible).not.toContain(index.keyOf(FAR));
    expect(objectiveMarkers(mission, "tdf")).toEqual([
      { objectiveId: "o-far", pos: FAR },
    ]);
    // The marker points at ground the renderer withholds the model from.
    expect(perceivedSpawners(mission, "tdf").map((s) => s.id)).toEqual([
      "near",
    ]);
  });

  it("keeps the marker on explored ground that has gone dark again", () => {
    const seen = missionWithNests([nest("far", FAR)], [objective("o", "far")]);
    const index = new TileIndex(seen.map);
    const dark: TacticalState = {
      ...seen,
      vision: {
        ...seen.vision,
        tdf: {
          ...seen.vision.tdf,
          visible: [],
          explored: [...seen.vision.tdf.explored, index.keyOf(FAR)],
        },
      },
    };
    expect(objectiveMarkers(dark, "tdf")).toEqual([
      { objectiveId: "o", pos: FAR },
    ]);
  });

  it("drops the marker once the objective is complete, the nest destroyed or its record gone", () => {
    const standing = missionWithNests(
      [nest("far", FAR)],
      [objective("o", "far")],
    );
    expect(objectiveMarkers(standing, "tdf")).toHaveLength(1);
    expect(
      objectiveMarkers(
        { ...standing, objectives: [objective("o", "far", true)] },
        "tdf",
      ),
    ).toEqual([]);
    expect(
      objectiveMarkers(
        { ...standing, spawners: [{ ...nest("far", FAR), destroyed: true }] },
        "tdf",
      ),
    ).toEqual([]);
    expect(
      objectiveMarkers(
        { ...standing, spawners: [{ ...nest("far", FAR), hp: 0 }] },
        "tdf",
      ),
    ).toEqual([]);
    expect(objectiveMarkers({ ...standing, spawners: [] }, "tdf")).toEqual([]);
    expect(objectiveMarkers({ ...standing, objectives: [] }, "tdf")).toEqual(
      [],
    );
  });

  it("drops the marker once a deadline has failed the objective (ADR 0013 §2.3)", () => {
    const missed = missionWithNests(
      [nest("far", FAR)],
      [{ ...objective("o", "far"), failed: true }],
    );
    expect(objectiveMarkers(missed, "tdf")).toEqual([]);
  });

  it("asks the kind's rules where the marker goes", () => {
    const gone = missionWithNests([], [objective("o", "far")]);
    expect(objectiveMarkers(gone, "tdf")).toEqual([]);
    expect(
      objectiveMarkers(gone, "tdf", {
        ...OBJECTIVE_RULES,
        "destroy-spawner": { ...DESTROY_SPAWNER_OBJECTIVE, marker: () => FAR },
      }),
    ).toEqual([{ objectiveId: "o", pos: FAR }]);
  });

  it("reads vision without changing it", () => {
    const mission = missionWithNests(
      [nest("far", FAR)],
      [objective("o", "far")],
    );
    const before = JSON.stringify(mission.vision);
    objectiveMarkers(mission, "tdf");
    expect(JSON.stringify(mission.vision)).toBe(before);
    // The bug side has no objectives and sees no markers.
    expect(objectiveMarkers(mission, "bugs")).toEqual([]);
  });
});
