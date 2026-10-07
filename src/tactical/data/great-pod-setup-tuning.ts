import type { GreatPodSetupTuning } from "../model/great-pod-setup-tuning";
import { BROOD_TUNING } from "./brood-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * First Skyfall's great pod (#1238), calibrated on the Act I force in
 * `docs/design/calibration/first-skyfall-great-pod.md`.
 *
 * ```
 *   core      80 hp at d1, armour 1 (the trait): eight planted charges,
 *             or a turn of a mech pair's guns once inside
 *   clock     ripens as turn 8 + 4 = 12 ends at d1 (the crash site's 8,
 *             and four for the hull: the march, a breach, the chambers)
 *   broods    route and side chambers 2 each, the core chamber 3, at d1:
 *             a nest to clear, not a hive cavern's 3 to 13
 *   wake      a chamber wakes when the force steps within its zone (the
 *             whole of an outer chamber, most of the core's), when its
 *             sleepers or the core are shot, or at a blast or a heavy
 *             gun within the shipped noise radius of its zone
 * ```
 */
export const GREAT_POD_SETUP_TUNING: GreatPodSetupTuning = {
  coreHp: 80,
  coreHpPerDifficulty: 10,
  hullTurns: 4,
  broods: {
    ...BROOD_TUNING,
    baseSize: 2,
    sizePerDifficulty: 0,
    minSize: 1,
    maxSize: 6,
    roleScale: { route: 1, side: 1, core: 1.5 },
    wake: { ...BROOD_TUNING.wake, zoneShare: 1, minZoneRadius: 2 },
  },
};
