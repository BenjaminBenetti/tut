import { hashSeed } from "../../core/service/seed-hash";
import type { ModelAssetId } from "../../content/data/model-ids";
import type { Direction } from "../../core/model/direction";
import { stepGridPos } from "../../core/service/grid-math";
import type { KnownPropKindId } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { Prop } from "../../mapgen/model/prop";
import type { Tile } from "../../mapgen/model/tile";
import type { SurfaceId } from "../../mapgen/model/surface";
import { DEAD_TREE_MODELS } from "../data/dead-tree-models";
import { ENVIRONMENT_DETAIL_STYLE } from "../data/environment-detail-style";
import { INTERIOR_FURNITURE_STYLE } from "../data/interior-furniture-style";
import { PROP_MODEL_VARIANTS } from "../data/prop-model-variants";
import { propModel } from "../data/map-model-table";
import type { PropModelVariant } from "../model/prop-model-variant";
import type { Rotation } from "../../mapgen/model/prop";
import { propTiles } from "../../mapgen/service/prop-footprint";

/** The GLB's -Z back after the renderer applies a clockwise quarter turn. */
const FURNITURE_BACK: Readonly<Record<Rotation, Direction>> = {
  0: "n",
  1: "e",
  2: "s",
  3: "w",
};

/** Chooses compatible art by seed and position, then aligns it with its recorded rotation. */
export function propModelVariation(
  prop: Prop,
  seed: string,
): PropModelVariant | undefined {
  const modelId = propModel(prop.kind);
  if (!modelId) return undefined;
  // Saved one-tile cars retain the old compact art, never a larger visual hull.
  const variants =
    prop.kind !== "car" || propTiles(prop).length > 1
      ? PROP_MODEL_VARIANTS[prop.kind]
      : undefined;
  const choice =
    variants?.[
      hashSeed(
        `${seed}:${prop.kind}:${prop.tile.x}:${prop.tile.y}:${prop.tile.z}:model`,
      ) % variants.length
    ];
  return {
    modelId: choice?.modelId ?? modelId,
    turns: ((prop.rotation + (choice?.turns ?? 0)) % 4) as Rotation,
  };
}

/** Every tree rooted in actual infestation loses its foliage, including the patch's fringe. */
export function propSurfaceModel(
  modelId: ModelAssetId,
  surface: SurfaceId,
): ModelAssetId {
  return surface === SurfaceIds.INFESTED
    ? (DEAD_TREE_MODELS[modelId] ?? modelId)
    : modelId;
}

/**
 * Seats shallow furniture against its back wall inside the same occupied tile.
 * Only a solid/window rear edge counts: doorways, side walls and exterior
 * furniture keep their existing pivots. No sideways corner fit is applied.
 */
export function propAppearanceOffset(
  prop: Prop,
  tile: Tile,
  turns: Rotation,
): { x: number; z: number } {
  const style = INTERIOR_FURNITURE_STYLE;
  const rearExtent = style.rearExtents[prop.kind as KnownPropKindId];
  if (
    rearExtent === undefined ||
    tile.buildingId === undefined ||
    tile.surface !== SurfaceIds.FLOOR ||
    propTiles(prop).length !== 1
  )
    return { x: 0, z: 0 };
  const back = FURNITURE_BACK[turns];
  const wall = tile.walls[back];
  if (wall !== "solid" && wall !== "window") return { x: 0, z: 0 };
  const distance = Math.max(0, 0.5 - style.wallClearance - rearExtent);
  const neighbour = stepGridPos(tile, back);
  return {
    x: (neighbour.x - tile.x) * distance,
    z: (neighbour.z - tile.z) * distance,
  };
}

/** Natural silhouettes may vary without changing a prop's collision or cover. */
const NATURAL_KINDS: ReadonlySet<string> = new Set([
  "tree-oak",
  "tree-pine",
  "tree-palm",
  "tree-tropical-almond",
  "tree-oil-palm",
  "tree-tuart",
  "banksia",
  "grass-tree",
  "cactus",
  "boulder",
  "limestone-outcrop",
]);

/** Stable per-position variation survives reloads and does not consume simulation RNG. */
export function propAppearanceScale(
  prop: Prop,
  seed: string,
): { scaleX?: number; scaleY?: number; scaleZ?: number } {
  if (!NATURAL_KINDS.has(prop.kind)) return {};
  const key = `${seed}:${prop.kind}:${prop.tile.x}:${prop.tile.y}:${prop.tile.z}`;
  const style = ENVIRONMENT_DETAIL_STYLE;
  const width =
    style.vegetationMinWidth +
    (hashSeed(`${key}:width`) / 0xffffffff) *
      (style.vegetationMaxWidth - style.vegetationMinWidth);
  const height =
    style.vegetationMinHeight +
    (hashSeed(`${key}:height`) / 0xffffffff) *
      (style.vegetationMaxHeight - style.vegetationMinHeight);
  // Solid rock silhouettes must retain their authored sight-blocking height.
  const solid = prop.kind === "boulder" || prop.kind === "limestone-outcrop";
  return { scaleX: width, scaleY: solid ? 1 : height, scaleZ: width };
}
