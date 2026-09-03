import { err, ok } from "../../core/model/result";
import type { EconomyState } from "../../economy/model/economy-state";
import type { TransactionService } from "../../economy/model/transaction-service";
import type { Mech, MechId } from "../model/mech";
import type { RosterError } from "../model/roster-error";
import { MECH_REPAIRED } from "../model/roster-event";
import type { RosterState } from "../model/roster-state";
import type { RosterTuning } from "../model/roster-tuning";
import type { RosterResult, RosterSlices } from "./roster-service";

// ===========================================
// Types
// ===========================================

/** What repairing needs injected. */
export interface RepairServiceDeps {
  readonly tuning: RosterTuning;
  readonly transactions: TransactionService;
}

// ===========================================
// Public Functions
// ===========================================

/** Credits to bring a mech back to zero damage: `repairCostPerPoint × damage`. */
export function repairCost(mech: Mech, tuning: RosterTuning): number {
  return tuning.repairCostPerPoint * mech.damage;
}

/**
 * Fully repairs a damaged mech, charging `repairCost` as a `repair`
 * ledger entry against the mech's id (GDD §5.7). Rejects an unknown
 * mech, a mech with no damage, or an unaffordable repair without
 * touching either slice. Repairs are all-or-nothing; a partial repair
 * can be layered on if a screen needs one.
 */
export function repairMech(
  slices: RosterSlices,
  mechId: MechId,
  day: number,
  deps: RepairServiceDeps,
): RosterResult {
  const mech = slices.roster.mechs.find((m) => m.id === mechId);
  if (mech === undefined) {
    return err({ code: "unknown-mech", mechId });
  }
  if (mech.damage <= 0) {
    return err({ code: "mech-undamaged", mechId });
  }
  const cost = repairCost(mech, deps.tuning);
  const paid = deps.transactions.spend(
    slices.economy,
    cost,
    "repair",
    mechId,
    day,
  );
  if (!paid.ok) {
    return err(insufficient(paid.error.required, paid.error.available));
  }
  const repaired: Mech = { ...mech, damage: 0 };
  const roster: RosterState = {
    ...slices.roster,
    mechs: slices.roster.mechs.map((m) => (m.id === mechId ? repaired : m)),
  };
  const economy: EconomyState = paid.value.state;
  return ok({
    roster,
    economy,
    events: [
      ...paid.value.events,
      {
        type: MECH_REPAIRED,
        payload: { mechId, from: mech.damage, to: 0, cost },
      },
    ],
  });
}

// ===========================================
// Private Functions
// ===========================================

/** Folds the economy's error into the roster's. */
function insufficient(required: number, available: number): RosterError {
  return { code: "insufficient-credits", required, available };
}
