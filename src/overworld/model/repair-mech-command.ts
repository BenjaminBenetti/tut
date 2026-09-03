import type { Command } from "../../core/model/command";
import type { MechId } from "../../roster/model/mech";

// ===========================================
// Repair mech
// ===========================================

/** Command type that repairs a damaged mech for credits (GDD §5.7). */
export const REPAIR_MECH = "roster:repair-mech";

/** Which mech to repair; repairs are always full. */
export interface RepairMechPayload {
  readonly mechId: MechId;
}

/** Pays `repairCostPerPoint × damage` to bring a mech back to zero damage. */
export type RepairMechCommand = Command<typeof REPAIR_MECH, RepairMechPayload>;

/** Builds a `RepairMech` command. */
export function repairMech(mechId: MechId): RepairMechCommand {
  return { type: REPAIR_MECH, payload: { mechId } };
}

// ===========================================
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [REPAIR_MECH]: RepairMechCommand;
  }
}
