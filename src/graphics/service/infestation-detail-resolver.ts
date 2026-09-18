import type { ModelAssetId } from "../../content/data/model-ids";
import { DIRECTIONS } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import { hashSeed } from "../../core/service/seed-hash";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { Rotation } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileIndex } from "../../mapgen/service/tile-index";
import { INFESTATION_APPEARANCE } from "../data/infestation-appearance";
import { tileTop } from "../view/tactical-map-view";
import type { ModelPlacement } from "./map-model-resolver";

/** Surface relief follows colony maturity, with a shared yaw across each feeding district. */
export function infestationGround(
  map: TacticalMap,
  tile: Tile,
): { modelId: ModelAssetId; turns: Rotation } {
  const zone = map.infestation?.zones.reduce<
    NonNullable<TacticalMap["infestation"]>["zones"][number] | undefined
  >((nearest, candidate) => {
    const distance = Math.hypot(
      candidate.centre.x - tile.x,
      candidate.centre.z - tile.z,
    );
    return !nearest ||
      distance <
        Math.hypot(nearest.centre.x - tile.x, nearest.centre.z - tile.z)
      ? candidate
      : nearest;
  }, undefined);
  const core =
    zone &&
    Math.hypot(zone.centre.x - tile.x, zone.centre.z - tile.z) <=
      zone.clearingRadius + 1;
  const variants = core
    ? INFESTATION_APPEARANCE.nestGround
    : INFESTATION_APPEARANCE.ground;
  const sample = hashSeed(
    `${map.recipe.seed}:resin-relief:${tile.x}:${tile.z}`,
  );
  const share = core
    ? INFESTATION_APPEARANCE.nestReliefShare
    : INFESTATION_APPEARANCE.groundReliefShare;
  return {
    modelId:
      sample / 0x100000000 < share
        ? variants[sample % variants.length]!
        : INFESTATION_APPEARANCE.dominantGround,
    turns: (hashSeed(`${map.recipe.seed}:resin-flow:${zone?.id ?? "legacy"}`) %
      4) as Rotation,
  };
}

/** Flush roots connect the generated terrain to its edges; substantial organisms are real map props. */
export function resolveInfestationDetails(
  map: TacticalMap,
  index: TileIndex,
): readonly ModelPlacement[] {
  if (!map.infestation) return [];
  const result: ModelPlacement[] = [];
  const style = INFESTATION_APPEARANCE;
  for (const tile of map.tiles) {
    if (
      tile.surface !== SurfaceIds.INFESTED ||
      tile.propId ||
      tile.slope ||
      tile.naturalEdge
    )
      continue;
    if (Object.keys(tile.walls).length > 0) continue;
    const neighbours = DIRECTIONS.map((side) =>
      index.getAt(stepGridPos(tile, side)),
    );
    if (
      neighbours.some(
        (n) => !n || n.propId !== undefined || n.surface === SurfaceIds.WATER,
      )
    )
      continue;
    const edge = neighbours.some((n) => n!.surface !== SurfaceIds.INFESTED);
    const sample = hashSeed(
      `${map.recipe.seed}:colony-detail:${tile.x}:${tile.y}:${tile.z}`,
    );
    if (!edge && sample / 0x100000000 < style.poolShare) {
      const footprint = [
        tile,
        index.get(tile.x + 1, tile.y, tile.z),
        index.get(tile.x, tile.y, tile.z + 1),
        index.get(tile.x + 1, tile.y, tile.z + 1),
      ];
      if (
        footprint.every(
          (cell) =>
            cell?.surface === SurfaceIds.INFESTED &&
            !cell.propId &&
            !cell.slope &&
            !cell.naturalEdge &&
            Object.keys(cell.walls).length === 0,
        )
      ) {
        result.push({
          modelId: "prop.infested-resin-pool",
          position: { x: tile.x + 1, y: tileTop(tile.y), z: tile.z + 1 },
          level: tile.y,
          turns: (sample % 4) as Rotation,
          scaleY: 0.5,
          tile,
          occupiedTiles: footprint as readonly Tile[],
        });
        continue;
      }
    }
    if (sample / 0x100000000 >= (edge ? style.edgeShare : style.detailShare))
      continue;
    const models = edge ? style.edgeDetail : style.groundDetail;
    const scale =
      style.detailMinScale +
      ((1 - style.detailMinScale) * ((sample >>> 8) % 256)) / 255;
    result.push({
      modelId: models[(sample >>> 16) % models.length]!,
      position: { x: tile.x + 0.5, y: tileTop(tile.y), z: tile.z + 0.5 },
      level: tile.y,
      turns: (sample % 4) as Rotation,
      scaleX: scale,
      scaleY: 0.22,
      scaleZ: scale,
      tile,
    });
  }
  return result;
}
