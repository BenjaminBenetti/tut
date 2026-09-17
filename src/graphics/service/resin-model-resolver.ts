import { hashSeed } from "../../core/service/seed-hash";
import { DIRECTIONS } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import type { Rotation } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileIndex } from "../../mapgen/service/tile-index";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { RESIN_STYLE } from "../data/resin-style";
import type { MapModelPlacements, ModelPlacement } from "./map-model-resolver";
import { resinGroundHeight, surfaceRise } from "./surface-rise";
import { tileTop } from "../view/tactical-map-view";

/**
 * Dresses the actual marked tiles with authored shell art. Original structures
 * retain their placement, ownership and demolition identity; walls keep their
 * apertures. Pitched roof skin follows the real floor below it for fog and cuts.
 */
export function resolveResinModels(
  map: TacticalMap,
  index: TileIndex,
  base: Omit<MapModelPlacements, "infestation">,
): readonly ModelPlacement[] {
  const level = map.recipe.params.infestationLevel ?? 0;
  if (level === 0) return [];
  const result: ModelPlacement[] = [];
  const size =
    RESIN_STYLE.minimumPatchSize +
    ((1 - RESIN_STYLE.minimumPatchSize) * level) / 10;
  const thickness = resinGroundHeight(level) / RESIN_STYLE.maximumGroundHeight;
  const ground = [
    ...base.tiles,
    ...base.roofs,
    ...base.connectors.filter((p) => p.ramp),
  ];
  for (const support of ground) {
    const tile = index.getAt(support.ramp?.from ?? support.tile);
    if (!tile?.infested) continue;
    const seed = hashSeed(
      `${map.recipe.seed}:resin:${tile.x}:${tile.y}:${tile.z}`,
    );
    const modelId =
      seed % 2 === 0
        ? "infestation.resin.ground-a"
        : "infestation.resin.ground-b";
    const turns = ((seed >>> 3) % 4) as Rotation;
    const conform =
      support.terrain !== undefined ||
      tile.slope !== undefined ||
      support.ramp !== undefined ||
      support.roof !== undefined ||
      tile.surface === "stairs";
    result.push({
      modelId,
      level: support.level,
      position: {
        x: support.position.x,
        y: conform
          ? support.position.y + RESIN_STYLE.groundLift
          : tileTop(tile.y) +
            surfaceRise(tile.surface) +
            RESIN_STYLE.groundLift,
        z: support.position.z,
      },
      turns: conform ? 0 : turns,
      tile: support.tile,
      ...(conform
        ? { resin: { support, turns, size, thickness } }
        : { scaleX: size, scaleZ: size, scaleY: thickness }),
    });
  }
  if (level >= RESIN_STYLE.wallsFromLevel) {
    for (const wall of base.walls) {
      const tile = index.getAt(wall.tile);
      const side = wall.part?.split(":").at(-1);
      const dx = side === "e" ? 1 : side === "w" ? -1 : 0;
      const dz = side === "s" ? 1 : side === "n" ? -1 : 0;
      if (
        !tile?.infested &&
        !index.get(wall.tile.x + dx, wall.tile.y, wall.tile.z + dz)?.infested
      )
        continue;
      const kind = side
        ? tile?.walls[side as "n" | "e" | "s" | "w"]
        : undefined;
      const modelId =
        kind === "door"
          ? "infestation.resin.door"
          : kind === "window"
            ? "infestation.resin.window"
            : "infestation.resin.wall";
      result.push({
        modelId,
        position: wall.position,
        level: wall.level,
        turns: wall.turns,
        tile: wall.tile,
        part: wall.part,
        scaleY: (kind === "half" ? 0.5 : 1.5) / MODEL_MANIFEST[modelId].height,
        scaleZ: 0.25 + 0.075 * level,
      });
    }
  }
  if (level >= RESIN_STYLE.propsFromLevel) {
    // Coat exposed terrain cliffs and building foundations in short shell
    // courses. Buried faces receive no geometry; original terrain stays intact.
    for (const tile of map.tiles) {
      if (
        !tile.infested ||
        (tile.buildingId !== undefined && tile.floorIndex !== 0)
      )
        continue;
      for (const side of DIRECTIONS) {
        const neighbour = stepGridPos(tile, side);
        const support = index
          .column(neighbour.x, neighbour.z)
          .find((t) => t.buildingId === undefined || t.floorIndex === 0);
        const low = support ? tileTop(support.y) : 0;
        const high = tileTop(tile.y);
        if (high - low < 0.1) continue;
        for (let bottom = low; bottom < high - 0.01; bottom += 1.5) {
          result.push({
            modelId: "infestation.resin.wall",
            level: tile.y,
            position: {
              x: tile.x + (side === "w" ? 0 : side === "e" ? 1 : 0.5),
              y: bottom,
              z: tile.z + (side === "n" ? 0 : side === "s" ? 1 : 0.5),
            },
            turns: side === "n" || side === "s" ? 0 : 1,
            tile,
            scaleY:
              Math.min(1.5, high - bottom) /
              MODEL_MANIFEST["infestation.resin.wall"].height,
            scaleZ: 0.2 + level * 0.04,
          });
        }
      }
    }
    for (const prop of base.props) {
      if (!prop.part?.startsWith("prop:") || !index.getAt(prop.tile)?.infested)
        continue;
      result.push({
        modelId: "infestation.resin.collar",
        position: prop.position,
        level: prop.level,
        turns: prop.turns,
        tile: prop.tile,
        part: prop.part,
        occupiedTiles: prop.occupiedTiles,
        scaleX: prop.scaleX ?? 1,
        scaleZ: prop.scaleZ ?? 1,
        scaleY: 0.3 + level * 0.07,
      });
    }
  }
  return result;
}
