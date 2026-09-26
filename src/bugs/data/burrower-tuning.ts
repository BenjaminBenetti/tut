import type { BurrowerTuning } from "../model/burrower-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * Shipped weights for the burrower (#1179). A bite prices at the
 * expected fraction of the target's hit points it removes, which for a
 * burrower against a rifle squad is about a third; the penalties are
 * sized against that:
 *
 * ```
 *   a watcher covering the landing   −0.5   worth more than the bite on a squad:
 *                                           it would rather come up out of the watch
 *   every other enemy seeing it      −0.3   comes up where fewest can answer
 *   ten columns further to go        −0.2   near before far, all else equal
 * ```
 *
 * No term can make it pass up a landing it can reach for one it cannot:
 * reach is decided before the score is read.
 */
export const BURROWER_TUNING: BurrowerTuning = {
  valueWeight: 1,
  exposureWeight: 0.3,
  overwatchWeight: 0.5,
  stepWeight: 0.02,
};
