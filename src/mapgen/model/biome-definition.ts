import type { BiomeId } from "../../content/model/biome-id";
import type { PropKindId } from "./prop";
import type { SurfaceId } from "./surface";

// ===========================================
// Biome definition
// ===========================================

/** A surface with a relative weight for random selection. */
export interface WeightedSurface {
  readonly surface: SurfaceId;
  /** Relative weight; need not sum to 1 across a list. */
  readonly weight: number;
}

/** Shape of the ground noise the terrain pass samples. */
export interface TerrainProfile {
  /** Highest ground level; 0 flattens the map. */
  readonly amplitudeLevels: number;
  /** Noise cycles per tile; smaller is smoother. */
  readonly frequency: number;
  /** Octaves of detail layered on the base noise. */
  readonly octaves: number;
  /** Gain per octave in (0, 1); higher is rougher. */
  readonly roughness: number;
}

/** A prop kind and how densely the prop pass scatters it. */
export interface VegetationEntry {
  readonly prop: PropKindId;
  /** Props per 100 open ground columns. */
  readonly density: number;
}

/** A building template with a relative weight for lot assignment. */
export interface WeightedBuildingKind {
  /** Template id from `mapgen/data/building-templates`. */
  readonly template: string;
  readonly weight: number;
}

/**
 * Everything a biome contributes to generation (ADR 0004 §7.4). Adding a
 * biome is a new entry in `mapgen/data/biomes`, never a pass edit.
 */
export interface BiomeDefinition {
  readonly id: BiomeId;
  /** Ground surfaces the terrain pass picks from. Never empty. */
  readonly groundSurfaces: readonly WeightedSurface[];
  readonly terrain: TerrainProfile;
  /** True when the water pass carves a shoreline along one edge. */
  readonly hasShoreline: boolean;
  /** Props scattered on open ground. May be empty. */
  readonly vegetation: readonly VegetationEntry[];
  /** Building templates allowed here. Never empty. */
  readonly buildingKinds: readonly WeightedBuildingKind[];
  /** Surface of paved roads. */
  readonly roadSurface: SurfaceId;
  /**
   * Surface of unpaved roads (rural settlements). Never the biome's
   * dominant ground surface, or the trail is invisible.
   */
  readonly trailSurface: SurfaceId;
}
