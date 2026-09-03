import type { Command } from "../../core/model/command";
import type { DeployableId } from "./deployable";

// ===========================================
// Decommission deployable
// ===========================================

/** Command type that removes an installation from its region (GDD §5.6). */
export const DECOMMISSION_DEPLOYABLE = "overworld:decommission-deployable";

/** Which installation to remove. */
export interface DecommissionDeployablePayload {
  readonly deployableId: DeployableId;
}

/** Removes an installation; nothing is refunded. */
export type DecommissionDeployableCommand = Command<
  typeof DECOMMISSION_DEPLOYABLE,
  DecommissionDeployablePayload
>;

/** Builds a `DecommissionDeployable` command. */
export function decommissionDeployable(
  deployableId: DeployableId,
): DecommissionDeployableCommand {
  return { type: DECOMMISSION_DEPLOYABLE, payload: { deployableId } };
}

// ===========================================
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [DECOMMISSION_DEPLOYABLE]: DecommissionDeployableCommand;
  }
}
