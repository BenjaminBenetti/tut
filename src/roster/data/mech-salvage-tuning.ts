import type { MechSalvageTuning } from "../model/mech-salvage-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * The shipped mech salvage (#1179): about half a destroyed mech's price
 * comes back when the force held the field. Ben picked salvage over a
 * cheaper rebuild to loosen the Act II and III bank (ECONOMY PHASE 2);
 * a share past 0.6 is his call, not a tuning pass's.
 */
export const MECH_SALVAGE_TUNING: MechSalvageTuning = {
  fraction: 0.5,
};
