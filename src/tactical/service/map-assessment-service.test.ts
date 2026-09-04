import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { DEFAULT_MISSION_HOOKS } from "../../mapgen/data/hook-requirements";
import { PropKindIds } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { HookKinds } from "../../mapgen/model/hook";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { MapRecipe } from "../../mapgen/model/map-recipe";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import {
  assessMap,
  DEFAULT_ASSESSMENT_OPTIONS,
  objectiveApproach,
} from "./map-assessment-service";

const registries = createDefaultRegistries();

function recipe(seed: string, biome: string, settlement: string): MapRecipe {
  return {
    seed,
    params: {
      archetype: "settlement",
      biome,
      settlement,
      size: "medium",
      hooks: DEFAULT_MISSION_HOOKS,
    },
  } as MapRecipe;
}

describe("assessMap", () => {
  it("counts firing positions and cover on a fixture", () => {
    // A 9×9 field with the objective at (4,4) and sandbags on the tile
    // west of it: low cover that does not block sight, so every tile in
    // range can shoot and three of them shoot from behind the bags.
    const map = new FixtureMapBuilder(9, 9, 1)
      .fillGround()
      .prop(PropKindIds.SANDBAGS, { x: 3, y: 0, z: 4 })
      .deploy([{ x: 0, y: 0, z: 8 }])
      .objective(
        HookKinds.EGG_SPAWNER,
        [{ x: 4, y: 0, z: 4 }],
        PassMask.INFANTRY,
      )
      .edgeSpawn([{ x: 8, y: 0, z: 0 }])
      .build();
    const assessment = assessMap(map, {
      ...DEFAULT_ASSESSMENT_OPTIONS,
      range: 3,
    });
    // The 25 tiles within three manhattan steps, less the sandbags' own.
    expect(assessment.firingPositionsMin).toBe(24);
    expect(assessment.firingPositionsMean).toBe(24);
    // (2,4), (3,3) and (3,5) all take the objective's side across the
    // sandbags; (3,4) itself is not standable.
    expect(assessment.coveredFiringShare).toBeCloseTo(3 / 24);
    expect(assessment.approachSteps).toEqual({ nearest: 8, farthest: 8 });
    expect(assessment.edgeSpawnSteps).toEqual({ nearest: 16, farthest: 16 });
    // An open field hides nothing: everything in range is visible.
    expect(assessment.visibleShare).toBe(1);
    expect(assessment.deployVisibleShare).toBeGreaterThan(0);
    // Flat fixture: one level for both classes, nothing shoots down.
    expect(assessment.elevatedFiringShare).toBe(0);
    expect(assessment.infantryLevelSpan).toBe(1);
    expect(assessment.mechLevelSpan).toBe(1);
    expect(assessment.mechReachShare).toBe(1);
  });

  it("reports empty ranges on a map with no objectives or edge spawns", () => {
    const map = new FixtureMapBuilder(4, 4, 1)
      .fillGround()
      .deploy([{ x: 0, y: 0, z: 0 }])
      .build();
    const assessment = assessMap(map);
    expect(assessment.approachSteps).toEqual({ nearest: -1, farthest: -1 });
    expect(assessment.edgeSpawnSteps).toEqual({ nearest: -1, farthest: -1 });
    expect(assessment.firingPositionsMin).toBe(0);
    expect(assessment.coveredFiringShare).toBe(0);
  });

  it("reports a walkable, shootable map for every biome and settlement", () => {
    for (const biome of BIOME_IDS) {
      for (const settlement of SETTLEMENT_SCALES) {
        const label = `${biome}/${settlement}`;
        const map = generateTacticalMap(
          recipe(`assess-${biome}-${settlement}`, biome, settlement),
          { registries },
        );
        const assessment = assessMap(map);
        expect(assessment.approachSteps.nearest, label).toBeGreaterThan(0);
        expect(assessment.edgeSpawnSteps.nearest, label).toBeGreaterThan(0);
        // I7 puts every objective in reach, and a reachable objective with
        // hatch space around it always has somewhere to be shot from.
        expect(assessment.firingPositionsMin, label).toBeGreaterThan(0);
        expect(assessment.mechReachShare, label).toBeGreaterThan(0.5);
        expect(assessment.coveredFiringShare, label).toBeGreaterThanOrEqual(0);
        expect(assessment.coveredFiringShare, label).toBeLessThanOrEqual(1);
        // Infantry always has the building floors; mechs stay outside, so
        // a city map leaves them on one level (#444).
        expect(assessment.infantryLevelSpan, label).toBeGreaterThan(1);
        expect(assessment.mechLevelSpan, label).toBeGreaterThanOrEqual(1);
      }
    }
  }, 30_000);
});

// ===========================================
// Objective approach (#345)
// ===========================================

describe("objectiveApproach", () => {
  /**
   * A 12×12 field, deploy in one corner, one objective at (6,0,6) whose
   * own tile admits infantry only — the shape of a real egg spawner,
   * which sits inside a building a mech cannot enter.
   */
  function fixture() {
    return (
      new FixtureMapBuilder(12, 12, 1)
        .fillGround()
        // The objective's own tile admits infantry only, the way a spawner
        // inside a building does.
        .tile({ x: 6, y: 0, z: 6 }, SurfaceIds.FLOOR, {
          pass: PassMask.INFANTRY,
        })
        .deploy([{ x: 0, y: 0, z: 0 }])
        .objective(
          HookKinds.EGG_SPAWNER,
          [{ x: 6, y: 0, z: 6 }],
          PassMask.INFANTRY,
        )
        .edgeSpawn([{ x: 11, y: 0, z: 11 }])
        .build()
    );
  }

  it("separates standing on an objective from being able to shoot it", () => {
    const [approach] = objectiveApproach(fixture());
    expect(approach).toBeDefined();
    if (!approach) return;
    // Infantry walks onto the tile — that is the charge route.
    expect(approach.infantrySteps).toBeGreaterThanOrEqual(0);
    // The mech has no route onto an infantry-only tile, and that is fine…
    expect(approach.mechSteps).toBe(-1);
    // …because it does not need one: it shoots from open ground nearby.
    expect(approach.mechFiringSteps).toBeGreaterThanOrEqual(0);
    expect(approach.infantryFiringSteps).toBeGreaterThanOrEqual(0);
  });

  it("reports the walk to a firing position as shorter than the walk to the tile", () => {
    const [approach] = objectiveApproach(fixture());
    if (!approach) return;
    // Stopping as soon as the shot is on beats closing all the way in.
    expect(approach.infantryFiringSteps).toBeLessThan(approach.infantrySteps);
  });

  it("indexes the approaches in hook order and answers for every objective", () => {
    const map = new FixtureMapBuilder(12, 12, 1)
      .fillGround()
      .deploy([{ x: 0, y: 0, z: 0 }])
      .objective(HookKinds.EGG_SPAWNER, [{ x: 3, y: 0, z: 3 }], PassMask.ALL)
      .objective(HookKinds.EGG_SPAWNER, [{ x: 9, y: 0, z: 9 }], PassMask.ALL)
      .edgeSpawn([{ x: 11, y: 0, z: 11 }])
      .build();
    const approaches = objectiveApproach(map);
    expect(approaches.map((a) => a.objective)).toEqual([0, 1]);
    // Both tiles admit a mech here, so both have a route.
    expect(approaches.every((a) => a.mechSteps >= 0)).toBe(true);
    expect(approaches[0]!.infantrySteps).toBeLessThan(
      approaches[1]!.infantrySteps,
    );
  });

  it("counts a mech's firing position through a window and not through a wall", () => {
    // Why `windowDensity` is a gameplay knob and not only an art one
    // (#492): a mech cannot enter a building, so the only line it has
    // into one is through a window. The same room with a solid wall on
    // that side gives it nothing.
    const room = (kind: "window" | "solid"): TacticalMap => {
      const builder = new FixtureMapBuilder(12, 12, 1)
        .fillGround()
        .deploy([{ x: 0, y: 0, z: 11 }])
        .objective(
          HookKinds.EGG_SPAWNER,
          [{ x: 6, y: 0, z: 6 }],
          PassMask.INFANTRY,
        )
        .edgeSpawn([{ x: 11, y: 0, z: 0 }]);
      for (const side of ["n", "e", "s"] as const) {
        builder.wall({ x: 6, y: 0, z: 6 }, side, "solid");
      }
      builder.wall({ x: 6, y: 0, z: 6 }, "w", kind);
      return builder.build();
    };

    const [through] = objectiveApproach(room("window"));
    const [blocked] = objectiveApproach(room("solid"));
    expect(through?.mechFiringSteps).toBeGreaterThanOrEqual(0);
    expect(blocked?.mechFiringSteps).toBe(-1);
    // Neither lets a mech stand on the objective; the difference is sight.
    expect(through?.mechSteps).toBe(-1);
    expect(blocked?.mechSteps).toBe(-1);
  });

  it("reports -1 for an objective nothing can see or reach", () => {
    // The objective is sealed behind solid walls on all four sides.
    const builder = new FixtureMapBuilder(12, 12, 1)
      .fillGround()
      .deploy([{ x: 0, y: 0, z: 0 }])
      .objective(HookKinds.EGG_SPAWNER, [{ x: 6, y: 0, z: 6 }], PassMask.ALL)
      .edgeSpawn([{ x: 11, y: 0, z: 11 }]);
    for (const side of ["n", "e", "s", "w"] as const) {
      builder.wall({ x: 6, y: 0, z: 6 }, side, "solid");
    }
    const [approach] = objectiveApproach(builder.build());
    if (!approach) return;
    expect(approach.infantrySteps).toBe(-1);
    expect(approach.mechSteps).toBe(-1);
    expect(approach.infantryFiringSteps).toBe(-1);
    expect(approach.mechFiringSteps).toBe(-1);
  });
});
