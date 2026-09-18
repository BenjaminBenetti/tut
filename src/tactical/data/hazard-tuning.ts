import type { HazardTuning } from "../model/hazard-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default hazard tuning (#1121). Placeholders until the flamer has been
 * played with:
 *
 * - Fire does 4 before armor with 2 points of penetration, so a
 *   swarmer (6 hp) standing in it dies in two of its own turns and a
 *   mech (9 armor) loses the minimum each time — fire is for clearing
 *   crawlers, not for cracking plate.
 * - It lasts four phases, which is two full rounds: lit in the player
 *   phase it burns the bugs at the start of theirs, the player at the
 *   start of the next, the bugs once more, and is gone before the
 *   player's second turn after lighting it.
 */
export const HAZARD_TUNING: HazardTuning = {
  effects: {
    smoke: { damage: 0, armorPen: 0, duration: 4 },
    fire: { damage: 4, armorPen: 2, duration: 4 },
  },
};
