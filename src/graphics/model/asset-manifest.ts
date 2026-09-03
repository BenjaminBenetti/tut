import type { ModelAssetId } from "../../content/data/model-ids";

// ===========================================
// Types
// ===========================================

/** Folder a model lives in under the models directory; also its colour family for placeholders. */
export type ModelCategory = "units" | "bugs" | "props" | "tiles" | "buildings";

/** Every category, in a fixed order. */
export const MODEL_CATEGORIES: readonly ModelCategory[] = [
  "units",
  "bugs",
  "props",
  "tiles",
  "buildings",
];

/** Tiles a model occupies on the ground. Sub-parts that never stand alone use 0×0. */
export interface ModelFootprint {
  readonly w: number;
  readonly d: number;
}

/** Placeholder geometry from the build script, or final art. */
export type ModelQuality = "placeholder" | "final";

/**
 * One registered GLB (style guide §8). Plain data; the key in the manifest
 * carries the id.
 *
 * ```
 *          height ┐
 *                 │   ┌────┐
 *                 │   │    │  socket_* nodes are named empties
 *                 │   │    │  inside the GLB
 *                 ┘   └────┘
 *                     └─w──┘   footprint w × d tiles, pivot at base centre
 * ```
 */
export interface ModelAssetEntry {
  readonly category: ModelCategory;
  /** Path under `public/`, always inside the category's models folder. */
  readonly path: string;
  /** Footprint in tiles. */
  readonly footprint: ModelFootprint;
  /** Height in world units. */
  readonly height: number;
  /** Names of the empty attach nodes the model exposes, e.g. `socket_arm_l`. */
  readonly sockets: readonly string[];
  readonly quality: ModelQuality;
}

/** The whole registry: one entry per declared id, so a missing one fails typecheck. */
export type ModelManifest = Readonly<Record<ModelAssetId, ModelAssetEntry>>;
