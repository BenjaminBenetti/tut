import type { BroodTuning } from "../model/brood-tuning";

/**
 * How a hive cavern's chambers are stocked (#1179, campaign arc §7.5).
 * A route chamber sleeps 9 bugs plus half a bug per point of
 * difficulty; a side chamber three quarters of that, the core chamber
 * half as many again (capped at 18). At Act II's middle difficulty (5)
 * that is 12 per route chamber, 9 per side chamber and 17 in the core:
 * a cavern of four brood chambers (the fewest the generator makes)
 * holds 50, one of seven about 80, measured over 20 seeds at 50–83.
 * Waking one chamber at a time puts the arc's 10–15 bugs in play.
 *
 * A heavy gun (the heavy machine gun's armour penetration of 1, or any
 * mech weapon) or an explosion wakes a brood from six tiles beyond its
 * chamber's edge: close enough that a squad can fight in the next
 * tunnel with carbines, far enough that a mech cannot shell a chamber
 * from outside it without waking what sleeps there.
 */
export const BROOD_TUNING: BroodTuning = {
  baseSize: 9,
  sizePerDifficulty: 0.5,
  minSize: 3,
  maxSize: 18,
  roleScale: { route: 1, side: 0.75, core: 1.5 },
  defaultMix: { swarmer: 2, lurker: 1 },
  wake: { noiseRadius: 6, heavyArmorPen: 1 },
};
