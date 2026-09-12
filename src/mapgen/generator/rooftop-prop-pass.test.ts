import { describe, expect, it } from "vitest";
import { DIRECTIONS } from "../../core/model/direction";
import { stepGridPos, manhattanDistance } from "../../core/service/grid-math";
import { hashSeed } from "../../core/service/seed-hash";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import { PassMask } from "../model/pass-mask";
import { CoverLevel } from "../model/cover";
import { createDefaultRegistries } from "../service/default-registries";
import { freezeDraft } from "../service/draft-freezer";
import { generateTacticalMap } from "../service/generate-tactical-map";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { createSettlementPasses } from "../service/settlement-pipeline";
import { TileIndex } from "../service/tile-index";
import { validateTacticalMap } from "../service/map-validator";
import type { MapRecipe } from "../model/map-recipe";

describe("rooftop service groups", () => {
  it.each(["temperate", "snowy", "desert", "coastal"] as const)(
    "gives %s roofs real equipment while retaining clear perimeter, landings and hatch space",
    (biome) => {
      const map = generateTacticalMap({
        seed: `roof-services-${biome}`,
        params: {
          archetype: "settlement",
          biome,
          settlement: "city",
          size: "medium",
          hooks: DEFAULT_MISSION_HOOKS,
          slopeShare: 1,
        },
      });
      const index = new TileIndex(map);
      const equipment = map.props.filter((prop) =>
        prop.kind.startsWith("rooftop-"),
      );
      expect(equipment.length).toBeGreaterThan(0);
      const perBuilding = new Map<string, number>();
      for (const prop of equipment) {
        const tile = index.getAt(prop.tile)!;
        expect(tile).toMatchObject({
          surface: "roof",
          pass: PassMask.NONE,
          coverProvided: CoverLevel.HIGH,
          blocksLos: true,
        });
        perBuilding.set(
          tile.buildingId!,
          (perBuilding.get(tile.buildingId!) ?? 0) + 1,
        );
        for (const side of DIRECTIONS) {
          const next = index.getAt(stepGridPos(tile, side));
          expect(next?.surface).toBe("roof");
          expect(next?.buildingId).toBe(tile.buildingId);
          expect(next?.propId).toBeUndefined();
        }
        for (const connector of map.connectors)
          for (const end of [connector.from, connector.to])
            if (end.y === tile.y)
              expect(manhattanDistance(end, tile)).toBeGreaterThan(1);
        for (const hook of [
          ...map.hooks.deployZones,
          ...map.hooks.objectives,
          ...map.hooks.edgeSpawns,
          map.hooks.extraction,
        ])
          for (const point of hook.tiles)
            if (point.y === tile.y)
              expect(manhattanDistance(point, tile)).toBeGreaterThan(
                typeof hook.meta?.hatchRadius === "number"
                  ? hook.meta.hatchRadius
                  : 1,
              );
      }
      expect([...perBuilding.values()].every((count) => count <= 3)).toBe(true);
      expect(validateTacticalMap(map, createDefaultRegistries())).toEqual([]);
    },
  );

  it("keeps existing roads, buildings, hooks and ground placement geometry independent of the rooftop pass", () => {
    const recipe: MapRecipe = {
      seed: "roof-independence",
      params: {
        archetype: "settlement",
        biome: "temperate",
        settlement: "city",
        size: "medium",
        hooks: DEFAULT_MISSION_HOOKS,
        slopeShare: 1,
      },
    };
    const registries = createDefaultRegistries();
    const before = new PipelineMapGenerator(
      createSettlementPasses().filter((pass) => pass.id !== "rooftop-props"),
      registries,
    ).run(recipe.params, new Mulberry32Rng(hashSeed(recipe.seed)));
    const after = generateTacticalMap(recipe);
    const map = freezeDraft(before.draft, recipe, registries);
    expect(after.buildings).toEqual(map.buildings);
    expect(after.connectors).toEqual(map.connectors);
    expect(after.hooks).toEqual(map.hooks);
    const geometry = (props: typeof map.props) =>
      props
        .filter((prop) => !prop.kind.startsWith("rooftop-"))
        .map(({ id: _id, ...prop }) => prop);
    expect(geometry(after.props)).toEqual(geometry(map.props));
    expect(generateTacticalMap(recipe)).toEqual(after);
  });
});
