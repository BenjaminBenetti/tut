import { resolveResinFloorDetails } from "./resin-hive-resolver";
import { hashSeed } from "../../core/service/seed-hash";
import type { Rotation } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileIndex } from "../../mapgen/service/tile-index";
import { RESIN_STYLE, RESIN_NEIGHBOURS } from "../data/resin-style";
import type { MapModelPlacements, ModelPlacement } from "./map-model-resolver";
import { resinGroundHeight, resinSurfaceLift } from "./surface-rise";
import { tileTop } from "../view/tactical-map-view";

/**
 * Connects marked surfaces with thin authored strands and sparse wet seeps.
 * Host geometry is selected separately by resolveInfestedModels. Roof strands
 * follow the real floor below them for fog and cuts.
 */
export function resolveResinModels(
  map: TacticalMap,
  index: TileIndex,
  base: Omit<MapModelPlacements, "infestation">,
): readonly ModelPlacement[] {
  const level = map.recipe.params.infestationLevel ?? 0;
  if (level === 0) return [];
  const result: ModelPlacement[] = [];
  const surfaceLinks = new Set<string>();
  for (const connector of map.connectors) {
    if (connector.kind === "ladder") continue;
    const from = index.keyOf(connector.from),
      to = index.keyOf(connector.to);
    surfaceLinks.add(`${from}:${to}`);
    surfaceLinks.add(`${to}:${from}`);
  }
  const seed = hashSeed(`${map.recipe.seed}:resin-network`);
  const turns = ((seed >>> 3) % 4) as Rotation;
  const phaseX = seed % RESIN_STYLE.patternSize;
  const phaseZ = (seed >>> 8) % RESIN_STYLE.patternSize;
  const thickness = resinGroundHeight(level) / RESIN_STYLE.maximumGroundHeight;
  const ground = [
    ...base.tiles,
    ...base.roofs,
    ...base.connectors.filter((p) => p.ramp),
  ];
  for (const support of ground) {
    const tile = index.getAt(support.ramp?.from ?? support.tile);
    if (!tile?.infested) continue;
    const neighbours = RESIN_NEIGHBOURS.reduce((mask, [dx, dz], bit) => {
      const connected = index
        .column(tile.x + dx, tile.z + dz)
        .some(
          (other) =>
            other.infested &&
            (other.y === tile.y ||
              surfaceLinks.has(`${index.keyOf(tile)}:${index.keyOf(other)}`) ||
              (tile.buildingId === undefined &&
                other.buildingId === undefined &&
                Math.abs(other.y - tile.y) <= 1)),
        );
      return connected ? mask | (1 << bit) : mask;
    }, 0);
    const conform =
      support.terrain !== undefined ||
      tile.slope !== undefined ||
      support.ramp !== undefined ||
      support.roof !== undefined ||
      tile.surface === "stairs";
    result.push({
      modelId: "infestation.resin.ground-a",
      level: support.level,
      position: {
        x: support.position.x,
        y: conform
          ? support.position.y + RESIN_STYLE.groundLift
          : tileTop(tile.y) + resinSurfaceLift(tile.surface),
        z: support.position.z,
      },
      turns: 0,
      tile: support.tile,
      resin: {
        support,
        turns: 0,
        size: 1,
        thickness,
        conform,
        pattern: {
          x: (tile.x + phaseX) % RESIN_STYLE.patternSize,
          z: (tile.z + phaseZ) % RESIN_STYLE.patternSize,
          turns,
          colony: {
            x:
              tile.x +
              0.5 -
              (((tile.x + phaseX) % RESIN_STYLE.patternSize) -
                (RESIN_STYLE.patternSize - 1) / 2),
            z:
              tile.z +
              0.5 -
              (((tile.z + phaseZ) % RESIN_STYLE.patternSize) -
                (RESIN_STYLE.patternSize - 1) / 2),
            seed,
          },
          ...(support.ramp
            ? {
                offsetX: support.position.x - tile.x - 0.5,
                offsetZ: support.position.z - tile.z - 0.5,
                width:
                  support.turns % 2
                    ? (support.scaleZ ?? 1)
                    : (support.scaleX ?? 1),
                depth:
                  support.turns % 2
                    ? (support.scaleX ?? 1)
                    : (support.scaleZ ?? 1),
              }
            : {}),
          neighbours,
          growth: Math.pow(level / 10, 1.45),
        },
      },
    });
  }
  result.push(...resolveResinFloorDetails(map, result, seed));
  return result;
}
