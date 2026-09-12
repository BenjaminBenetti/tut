import { hashSeed } from "../../core/service/seed-hash";
import type { Prop } from "../../mapgen/model/prop";
import { ENVIRONMENT_DETAIL_STYLE } from "../data/environment-detail-style";
import { PROP_MODEL_VARIANTS } from "../data/prop-model-variants";
import { propModel } from "../data/map-model-table";
import type { PropModelVariant } from "../model/prop-model-variant";
import type { Rotation } from "../../mapgen/model/prop";
import { propTiles } from "../../mapgen/service/prop-footprint";

/** Chooses compatible art by seed and position, then aligns it with its recorded rotation. */
export function propModelVariation(
  prop: Prop,
  seed: string,
): PropModelVariant | undefined {
  const modelId = propModel(prop.kind);
  if (!modelId) return undefined;
  // Saved one-tile cars retain the old compact art, never a larger visual hull.
  const variants =
    propTiles(prop).length > 1 ? PROP_MODEL_VARIANTS[prop.kind] : undefined;
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
