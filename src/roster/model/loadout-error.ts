import type { PartSlot } from "./mech-part";

// ===========================================
// Codes
// ===========================================

/** Every way a loadout can fail validation. */
export const LOADOUT_ERROR_CODES = [
  "missing-part",
  "wrong-slot",
  "unknown-part",
  "overweight",
  "over-power-budget",
  "too-many-utilities",
] as const;

/**
 * Why a loadout is not buildable.
 *
 * | code                 | meaning                                              |
 * |----------------------|------------------------------------------------------|
 * | `missing-part`       | a slot's part id is empty                            |
 * | `unknown-part`       | the catalogue has no part with that id               |
 * | `wrong-slot`         | the part exists but is made for a different slot     |
 * | `overweight`         | fitted parts weigh more than the chassis can bear    |
 * | `over-power-budget`  | fitted parts draw more power than is supplied        |
 * | `too-many-utilities` | more utilities than the chassis has slots for        |
 */
export type LoadoutErrorCode = (typeof LOADOUT_ERROR_CODES)[number];

// ===========================================
// Error
// ===========================================

/**
 * One validation failure. Plain data so the mech bay can list it next to
 * the offending slot and a save can carry it. `slot` is set for every
 * code but is optional so a future whole-loadout failure needs no
 * placeholder; `detail` is for humans.
 */
export interface LoadoutError {
  readonly code: LoadoutErrorCode;
  readonly slot?: PartSlot;
  readonly detail: string;
}
