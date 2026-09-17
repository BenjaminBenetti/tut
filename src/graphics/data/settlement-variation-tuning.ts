import type { SettlementVariationTuning } from "../model/settlement-variation";

/**
 * Small enough that every city still reads as its style (the authored
 * 15° yaw keeps two faces toward the camera at any extra turn within
 * this), large enough that neighbours differ at a glance.
 */
export const SETTLEMENT_VARIATION_TUNING: SettlementVariationTuning = {
  maxYaw: (10 * Math.PI) / 180,
  minHeightScale: 0.88,
  maxHeightScale: 1.14,
};
