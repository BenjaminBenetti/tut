import type { CoverLevel } from "./cover";
import type { BiomeId } from "../../content/model/biome-id";
import type { TileCoord } from "./tile-coord";

// ===========================================
// Prop
// ===========================================

/**
 * Identifier of a prop kind. Kinds are data-defined in `mapgen/data/props`
 * so a biome can add one without touching model code (ADR 0004 §4.4).
 */
export type PropKindId = string;

/** Quarter turns clockwise, for graphics. */
export type Rotation = 0 | 1 | 2 | 3;

/**
 * A placed object. Every occupied tile is impassable and grants the
 * definition's cover; the anchor remains stable for identity and appearance.
 */
export interface Prop {
  readonly id: string;
  readonly kind: PropKindId;
  readonly tile: TileCoord;
  readonly rotation: Rotation;
  /** Exact footprint including the anchor. Omitted in legacy saves and single-tile props. */
  readonly occupiedTiles?: readonly TileCoord[];
}

/** Where a prop may be selected; vegetation is explicit planting, excluding random yard clutter. */
export type PropPlacement =
  "ground" | "vegetation" | "road" | "interior" | "yard" | "roof";

/**
 * Describes one prop kind. Graphics maps `id` to a mesh through its own
 * manifest; mapgen never references asset paths.
 */
export interface PropDefinition {
  readonly id: PropKindId;
  /** Cover granted to units on adjacent tiles. */
  readonly cover: CoverLevel;
  /** True when the prop fully blocks line of sight through its tile. */
  readonly blocksLos: boolean;
  /** Contexts the prop pass may place this kind in. Never empty. */
  readonly placements: readonly PropPlacement[];
  /** Restricts the kind to these biomes; `undefined` means any biome. */
  readonly biomes?: readonly BiomeId[];
  /** Placement footprint at rotation zero. Existing placed records retain their own footprint. */
  readonly footprint?: { readonly w: number; readonly d: number };
}
