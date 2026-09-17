import type { GarrisonTuning } from "../model/garrison-tuning";
import { GARRISON_TURRET_TUNING } from "./turret-tuning";

/**
 * Where a region's garrison turrets stand on a mission map (#1155).
 * Six tiles apart so two never cover the same ground; six from a
 * spawner so a hatch is not shot in the egg (a turret's gun reaches
 * eight, so the first bugs out still walk into its fire); four from
 * the deploy zone so the squad's own line is not already a battery.
 */
export const GARRISON_TUNING: GarrisonTuning = {
  turret: GARRISON_TURRET_TUNING,
  spacing: 6,
  spawnerClearance: 6,
  deployClearance: 4,
};
