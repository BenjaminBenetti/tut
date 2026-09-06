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
  /** How the interior pass cuts each floor into rooms (ADR 0009 §2.4). */
  readonly interior: InteriorPlan;
}

/**
 * The shape of a building's interior as a structure a squad fights
 * through (#829): rooms of a target size opening onto a corridor, or,
 * where the footprint is too narrow for one, rooms opening into each
 * other.
 *
 * ```
 *   +------+---+----------+
 *   | room | c | room     |    corridorWidth = 1, roomSize 3..5
 *   +--D---+ o +----D-----+    D = door onto the corridor
 *   | room | r | room     |
 *   +------+---+----------+
 * ```
 */
export interface InteriorPlan {
  /**
   * Room edge the partitioner aims for, in tiles: no room edge is shorter
   * than `min`, and a room is cut again while an edge exceeds `max`.
   */
  readonly roomSize: IntRange;
  /**
   * Corridor width in tiles along the footprint's long axis, shared by
   * every floor so stairs land in it; 0 means no corridor. Narrowed or
   * dropped when the footprint cannot hold a room on both sides.
   */
  readonly corridorWidth: number;
}
