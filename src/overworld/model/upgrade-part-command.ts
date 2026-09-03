import type { Command } from "../../core/model/command";
import type { MechId } from "../../roster/model/mech";
import type { PartId } from "../../roster/model/mech-part";

// ===========================================
// Upgrade part
// ===========================================

/** Command type that raises a fitted part's upgrade level for credits (GDD §5.7). */
export const UPGRADE_PART = "roster:upgrade-part";

/** Which mech and which of its fitted parts. */
export interface UpgradePartPayload {
  readonly mechId: MechId;
  readonly partId: PartId;
}

/** Buys the next upgrade level of one part on one mech. */
export type UpgradePartCommand = Command<
  typeof UPGRADE_PART,
  UpgradePartPayload
>;

/** Builds an `UpgradePart` command. */
export function upgradePart(
  mechId: MechId,
  partId: PartId,
): UpgradePartCommand {
  return { type: UPGRADE_PART, payload: { mechId, partId } };
}

// ===========================================
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [UPGRADE_PART]: UpgradePartCommand;
  }
}
