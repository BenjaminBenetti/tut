import type { RadarTuning } from "../model/radar";

/**
 * Radio squads place a scanner within two tiles for one action (#1130:
 * range 2 so a diagonal, which measures 1.41, is legal). It scans for
 * three player turns and then burns out.
 */
export const RADAR_TUNING: RadarTuning = {
  apCost: 1,
  deployRange: 2,
  scanRange: 30,
  batteryTurns: 3,
};
