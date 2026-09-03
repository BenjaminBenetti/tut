import type { UnitTuning } from "../model/unit-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default unit tuning. Placeholders until tactical combat (M2) is
 * playable end to end:
 *
 * - A soldier is 4 hp, so a full squad is 20 hp and a rifle squad
 *   (rating 40) hits for 3 at 65%; a rocket squad (56) hits for 5 with
 *   armor penetration.
 * - The starter mech (armor 30, mobility 7, firepower 40) comes out at
 *   80 hp, 6 move, a 40-damage 70% shot and 9 per-hit armor.
 * - Both sides get the XCOM-style two-action turn (GDD §6.2).
 */
export const UNIT_TUNING: UnitTuning = {
  infantry: {
    hpPerSoldier: 4,
    maxAp: 2,
    move: 5,
    armor: 0,
    // Damage per point of squad combatRating. Squad ratings sit on the
    // auto-resolver's scale (a full rifle squad is 40, #336), so 0.075
    // gives rifle 3, rocket 5, sniper 4, engineer 3, medic 2 after the
    // ceiling, exactly the values tuned before that rescale.
    weapon: { range: 8, accuracy: 65, damage: 0.075, armorPen: 0 },
    modelIdByType: {
      rifle: "tdf.infantry.rifle",
      rocket: "tdf.infantry.rocket",
      sniper: "tdf.infantry.sniper",
      engineer: "tdf.infantry.engineer",
      medic: "tdf.infantry.medic",
    },
    fallbackModelId: "tdf.infantry.rifle",
  },
  mech: {
    baseHp: 50,
    hpPerArmor: 1,
    armorFactor: 0.3,
    maxAp: 2,
    baseMove: 3,
    minMove: 2,
    maxMove: 8,
    weapon: { range: 10, accuracy: 70, damage: 1, armorPen: 2 },
    modelId: "tdf.mech.assembled-a",
  },
};
