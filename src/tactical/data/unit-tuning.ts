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
 * - Sight reaches half again past the weapon (12 for infantry, 14 for a
 *   mech, against ranges of 8 and 10), so a squad spots what it is about
 *   to walk into rather than discovering it by being shot (ADR 0006).
 * - Charges (#409): a rifle squad fires three times before reloading, a
 *   rocket squad once, a mech four times before venting; bugs never run
 *   dry.
 * - Each squad type fights with its own weapon (#1121, #1130); see the
 *   table on `weaponByType`.
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
    // Each squad type fights with its own weapon (#1130), so the types
    // are told apart by how they shoot rather than by a number. Damage
    // is the rating's, scaled, and rounded up:
    //
    //   type      weapon           range acc dmg pen shots/turn mag  marks
    //   rifle     Carbine            8    65   3   0     2       3   —
    //   medic     Carbine            8    65   2   0     2       3   —
    //   radio     SMG                5    70   4   0     1       4   —
    //   engineer  Shotgun            3    75   5   0     2       2   —
    //   sniper    Marksman Rifle    12    80   6   0     1       2   —
    //   rocket    Rocket Launcher   10    65   5   2     1       1   blast 1, demo 2
    //
    // The carbine is the shared shape; a type with no entry fires it.
    // The SMG is the carbine traded down for range and up for hitting
    // power, one burst a turn. The shotgun is a squad that has to be in
    // the bug's face, and gets two goes at it. The marksman rifle
    // reaches as far as the squad can see (`sightRange`, so overwatch
    // is never refused a shot the numbers allow) and takes its one shot
    // seriously. The rocket (#1121) bursts over the tile beside its
    // mark at half strength, punches two points of plate — "for
    // cracking brutes and egg spawners" is what its description has
    // promised since M1 — and brings down anything up to a dumpster or
    // a door; one shot a turn is the whole point of carrying it. The
    // small arms mark nothing on the ground.
    weaponByType: {
      rifle: { name: "Carbine" },
      medic: { name: "Carbine" },
      radio: {
        name: "SMG",
        range: 5,
        accuracy: 70,
        damageScale: 1.75,
        endsTurn: true,
      },
      engineer: { name: "Shotgun", range: 3, accuracy: 75, damageScale: 2.25 },
      sniper: {
        name: "Marksman Rifle",
        range: 12,
        accuracy: 80,
        damageScale: 1.6,
        endsTurn: true,
      },
      rocket: {
        name: "Rocket Launcher",
        range: 10,
        armorPen: 2,
        aoe: { radius: 1, falloff: 0.5 },
        demoForce: 2,
        endsTurn: true,
      },
    },
    fallbackWeaponName: "Carbine",
    sightRange: 12,
    modelIdByType: {
      rifle: "tdf.infantry.rifle",
      rocket: "tdf.infantry.rocket",
      sniper: "tdf.infantry.sniper",
      engineer: "tdf.infantry.engineer",
      medic: "tdf.infantry.medic",
      radio: "tdf.infantry.radio",
    },
    fallbackModelId: "tdf.infantry.rifle",
    chargesByType: {
      rifle: 3,
      rocket: 1,
      sniper: 2,
      engineer: 2,
      medic: 3,
      radio: 4,
    },
    fallbackCharges: 3,
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
    sightRange: 14,
    modelId: "tdf.mech.assembled-a",
    charges: 4,
  },
};
