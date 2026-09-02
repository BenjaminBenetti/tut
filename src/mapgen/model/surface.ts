import type { PassMask } from "./pass-mask";

// ===========================================
// Surface
// ===========================================

/**
 * Identifier of a standable surface kind. Surfaces are data-defined so a
 * biome can add one without touching model code (ADR 0004 §4.2). Well-known
 * ids live in `mapgen/data/surfaces`.
 */
export type SurfaceId = string;

/**
 * Describes one surface kind. Graphics maps `id` to a material through its
 * own manifest; mapgen never references asset paths.
 */
export interface SurfaceDefinition {
  readonly id: SurfaceId;
  /** Who may stand on this surface before props, walls or buildings narrow it. */
  readonly defaultPass: PassMask;
  /** True for surfaces inside a building (floors, stairs); used for LOS and lighting hints. */
  readonly isInterior: boolean;
}
