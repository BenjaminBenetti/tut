import { describe, expect, it } from "vitest";
import { DIRECTIONS } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import { MISSION_SITES } from "../../mapgen/data/mission-sites";
import { DEFAULT_MISSION_HOOKS } from "../../mapgen/data/hook-requirements";
import { PassMask } from "../../mapgen/model/pass-mask";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import { TileIndex } from "../../mapgen/service/tile-index";
import { ReachabilityService } from "../../mapgen/service/reachability-service";
import { DEMOLITION_TUNING } from "../data/demolition-tuning";
import { demolish } from "./demolition-service";
import { registryStructureCatalogue } from "./structure-catalogue";

const registries = createDefaultRegistries();
const structures = registryStructureCatalogue(registries);

describe("installation buildings use ordinary tactical structure rules", () => {
  it.each(Object.keys(MISSION_SITES))(
    "opens a usable breach in a %s wall while retaining adjacent parts",
    (site) => {
      const map = generateTacticalMap({
        seed: `installation-breach-${site}`,
        params: {
          archetype: "settlement",
          biome: "temperate",
          settlement: "town",
          size: "small",
          site,
          hooks: DEFAULT_MISSION_HOOKS,
        },
      });
      const building = map.buildings.find((b) => b.kind === site)!;
      const index = new TileIndex(map);
      const edge = map.tiles
        .filter(
          (tile) =>
            tile.buildingId === building.id &&
            tile.y === building.groundLevel &&
            tile.pass === PassMask.INFANTRY,
        )
        .flatMap((tile) =>
          DIRECTIONS.map((side) => ({
            tile,
            side,
            outside: stepGridPos(tile, side),
          })),
        )
        .find(
          ({ tile, side, outside }) =>
            tile.walls[side] === "solid" &&
            index.getAt(outside)?.buildingId === undefined &&
            (index.getAt(outside)!.pass & PassMask.INFANTRY) !== 0,
        )!;
      expect(edge).toBeDefined();
      const beforeReach = new ReachabilityService(index, map.connectors);
      expect(
        beforeReach.neighbours(index.getAt(edge.outside)!, PassMask.INFANTRY),
      ).not.toContainEqual(edge.tile);
      const result = demolish(
        map,
        [edge.tile],
        3,
        structures,
        DEMOLITION_TUNING,
      );
      const after = new TileIndex(result.map);
      expect(after.getAt(edge.tile)?.walls[edge.side]).toBeUndefined();
      expect(index.getAt(edge.tile)?.walls[edge.side]).toBe("solid");
      expect(result.map.buildings).toEqual(map.buildings);
      expect(
        result.map.tiles.filter((tile) => tile.buildingId === building.id),
      ).toHaveLength(
        map.tiles.filter((tile) => tile.buildingId === building.id).length,
      );
      expect(result.walls.length).toBeGreaterThan(0);
      const reach = new ReachabilityService(after, result.map.connectors);
      expect(
        reach
          .neighbours(after.getAt(edge.outside)!, PassMask.INFANTRY)
          .some(
            (tile) =>
              tile.x === edge.tile.x &&
              tile.y === edge.tile.y &&
              tile.z === edge.tile.z,
          ),
      ).toBe(true);
      const untouched = map.tiles.find(
        (tile) =>
          tile.buildingId === building.id &&
          Math.abs(tile.x - edge.tile.x) + Math.abs(tile.z - edge.tile.z) > 3 &&
          Object.values(tile.walls).includes("solid"),
      )!;
      expect(after.getAt(untouched)).toEqual(untouched);
    },
  );
});
