import type { BroodTuning } from "../model/brood-tuning";

/**
 * How a hive cavern's chambers are stocked (#1179, campaign arc §7.5;
 * calibrated in `docs/design/calibration/C3a-hives.md`). A route
 * chamber sleeps two bugs per point of difficulty less five, never
 * fewer than three; a side chamber three quarters of that, the core
 * chamber as many as a route chamber:
 *
 * ```
 *   difficulty     3   4   5   6   7   8   9
 *   route, core    3   3   5   7   9  11  13
 *   side           3   3   4   5   7   8  10
 * ```
 *
 * Act II's hives (difficulty 3–7) sleep few enough for its one mech and
 * four squads to fight the core's brood; Act III's (5–9) grow in the
 * route chambers, which a careful force walks round and a careless one
 * wakes.
 *
 * Each brood sleeps round its chamber's middle, in a wake zone of 35%
 * of the chamber's radius (at least three tiles): 3–4 tiles in a route
 * chamber of 8–12, 4–5 in the core's 12–14. The rim outside it is
 * ground a force can walk past a sleeping brood on.
 *
 * A heavy gun (the heavy machine gun's armour penetration of 1, or any
 * mech weapon) or an explosion wakes a brood from six tiles beyond its
 * zone's edge: close enough that a squad can fight in the next tunnel
 * with carbines, far enough that a mech cannot shell a chamber from
 * outside it without waking what sleeps there.
 */
export const BROOD_TUNING: BroodTuning = {
  baseSize: -5,
  sizePerDifficulty: 2,
  minSize: 3,
  maxSize: 18,
  roleScale: { route: 1, side: 0.75, core: 1 },
  defaultMix: { swarmer: 2, lurker: 1 },
  wake: { noiseRadius: 6, heavyArmorPen: 1, zoneShare: 0.35, minZoneRadius: 3 },
};
