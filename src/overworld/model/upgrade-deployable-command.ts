import type { Command } from "../../core/model/command";
import type { DeployableId } from "./deployable";

// ===========================================
// Upgrade deployable
// ===========================================

/** Command type that raises an installation one level (GDD §5.6). */
export const UPGRADE_DEPLOYABLE = "overworld:upgrade-deployable";

/** Which installation to upgrade. */
export interface UpgradeDeployablePayload {
  readonly deployableId: DeployableId;
}

/** Charges the next level's price and steps the installation up one level. */
export type UpgradeDeployableCommand = Command<
  typeof UPGRADE_DEPLOYABLE,
  UpgradeDeployablePayload
>;

/** Builds an `UpgradeDeployable` command. */
export function upgradeDeployable(
  deployableId: DeployableId,
): UpgradeDeployableCommand {
  return { type: UPGRADE_DEPLOYABLE, payload: { deployableId } };
}

// ===========================================
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [UPGRADE_DEPLOYABLE]: UpgradeDeployableCommand;
  }
}
