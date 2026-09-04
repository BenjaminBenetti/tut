import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { DEFAULT_MISSION_HOOKS } from "../../mapgen/data/hook-requirements";
import { PropKindIds } from "../../mapgen/data/props";
import { HookKinds } from "../../mapgen/model/hook";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { MapRecipe } from "../../mapgen/model/map-recipe";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import { assessMap } from "./map-assessment-service";

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
    const assessment = assessMap(map, { range: 3 });
    // The 25 tiles within three manhattan steps, less the sandbags' own.
    expect(assessment.firingPositionsMin).toBe(24);
    expect(assessment.firingPositionsMean).toBe(24);
    // (2,4), (3,3) and (3,5) all take the objective's side across the
    // sandbags; (3,4) itself is not standable.
    expect(assessment.coveredFiringShare).toBeCloseTo(3 / 24);
    expect(assessment.approachSteps).toEqual({ nearest: 8, farthest: 8 });
    expect(assessment.edgeSpawnSteps).toEqual({ nearest: 16, farthest: 16 });
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
