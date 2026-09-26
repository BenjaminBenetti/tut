import type { SpitterTuning } from "../model/spitter-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * Shipped weights (#1179), ordered so the snipe reads the way the
 * bestiary describes it: shoot, from cover, from a distance.
 *
 * - **A shot first.** `shotWeight` (10) is above everything a tile
 *   without a shot can collect — at most `coverWeight` (2), since the
 *   approach term only ever subtracts — so a spitter that can reach a
 *   firing tile this turn always takes one.
 * - **Then cover.** Among firing tiles, high cover against the target
 *   is worth 2 and low cover 1. A spit's value is its expected share of
 *   the target's hit points: 4 damage at 55 % against a 16 hit point
 *   squad is about 0.14, so `valueWeight` (3) prices a different target
 *   or angle at a few tenths — enough to choose between two equally
 *   covered tiles, never enough to give up cover, unless the shot
 *   would finish the target off (value 1, worth 3).
 * - **Then quiet.** Being seen by the target is the price of shooting
 *   it, so `exposureWeight` (1) counts only the *other* enemies that
 *   see the tile.
 * - **Closing is slow and covered.** Out of reach it advances by the
 *   tile (`approachWeight` 1), so high cover is worth two tiles of
 *   approach: it moves from cover to cover rather than straight in.
 * - **It does not wander.** `stepWeight` (0.02 per movement point) is
 *   larger than the one hit-chance point a tile of range buys (about
 *   0.008 of value), so a spitter on a good tile stays on it.
 *
 * Adjacency is not a weight: a tile beside an enemy is never chosen
 * while any tile that is not can be reached (`SpitterBehaviour`).
 */
export const SPITTER_TUNING: SpitterTuning = {
  shotWeight: 10,
  valueWeight: 3,
  coverWeight: 2,
  exposureWeight: 1,
  approachWeight: 1,
  stepWeight: 0.02,
};
