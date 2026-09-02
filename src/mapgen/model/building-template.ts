import type { SettlementScale } from "../../content/model/settlement-scale";
import type { IntRange } from "./settlement-definition";

// ===========================================
// Building template
// ===========================================

/**
 * Data that shapes one kind of building (ADR 0004 §7.3, pass 5). The
 * building pass picks a template per lot by the biome's weights, sizes a
 * footprint inside the lot, raises the floors and opens the walls.
 * Adding a kind is a new entry in `mapgen/data/building-templates` plus a
 * weight in the biomes that use it.
 */
export interface BuildingTemplate {
  readonly id: string;
  /** Footprint extent along the frontage, in columns. */
  readonly footprintWidth: IntRange;
  /** Footprint extent away from the road, in columns. */
  readonly footprintDepth: IntRange;
  /** Storeys, before the settlement's own floor range narrows it. */
  readonly floors: IntRange;
  readonly roof: "flat" | "pitched";
  /** Whether a flat roof gets walkable tiles and a way up. */
  readonly roofWalkable: boolean;
  /** Fraction of exterior wall segments that become windows, in [0, 1]. */
  readonly windowDensity: number;
  /** Settlement scales the kind appears in. Never empty. */
  readonly scales: readonly SettlementScale[];
  /** Smallest room edge the room partitioner may produce. */
  readonly minRoomSize: number;
}
