import type { PreyTuning } from "../model/prey-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * Shipped prey weights. At 1.5 a civilian group outranks a squad
 * whenever the two bites are worth the same, and loses to one that is
 * worth half again as much or more: a bite at a wounded fighter (value
 * 0.8) beats one at a fresh group (0.5 × 1.5 = 0.75), so the squad is
 * never ignored while it is the better kill.
 */
export const PREY_TUNING: PreyTuning = {
  civilianWeight: 1.5,
};
