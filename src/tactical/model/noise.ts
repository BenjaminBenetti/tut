import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// Noise
// ===========================================

/**
 * A loud action, where it was heard from (#1179): the smallest noise
 * concept the rules needed for waking broods. Nothing else in the game
 * listens yet.
 *
 * | what                                   | heard from        |
 * |----------------------------------------|-------------------|
 * | an explosion (a blast that went off)   | its impact tile   |
 * | a heavy gun (see `NoiseTuning`)        | the shooter's tile|
 *
 * Smoke is not loud, and neither is a small arm.
 */
export interface Noise {
  /** Where the noise was made. */
  readonly at: TileCoord;
  /** Who made it: the shooter, or whoever set the blast off. */
  readonly by: UnitId;
}

/** What makes a shot loud. */
export interface NoiseTuning {
  /**
   * Armour penetration from which a gun is heavy, and so loud: the
   * heavy machine gun's 1. A mech's weapons are always loud.
   * Non-negative integer.
   */
  readonly heavyArmorPen: number;
}
