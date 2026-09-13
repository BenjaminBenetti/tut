import type { RadarTuning } from "../model/radar";

/**
 * A scanner sweeps a 30-tile circle and runs for three player turns
 * before its battery dies (#1130). Placement range and cost are the
 * radar dish's definition in `equipment.ts` (#1132).
 */
export const RADAR_TUNING: RadarTuning = {
  scanRange: 30,
  batteryTurns: 3,
};
