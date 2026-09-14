import type { TurretTuning } from "../model/turret";
import { PRIMARY_WEAPON_ID } from "../model/unit-weapon";

/**
 * The engineer's deployable turret (#1138): 30 hit points behind 2
 * armor, a rifle squad's carbine (range 8, 65 % for 3, the numbers in
 * `unit-tuning.ts`) that fires **twice** per overwatch, a rifle squad's
 * sight, and a three-turn battery like the radar dish's. Where it may
 * be put and what it costs are the turret's own definition in
 * `equipment.ts`.
 */
export const TURRET_TUNING: TurretTuning = {
  name: "Turret",
  maxHp: 30,
  armor: 2,
  sightRange: 12,
  weapon: {
    id: PRIMARY_WEAPON_ID,
    name: "Turret gun",
    profile: {
      range: 8,
      accuracy: 65,
      damage: 3,
      armorPen: 0,
      overwatchShots: 2,
    },
  },
  batteryTurns: 3,
  modelId: "tdf.turret",
};
