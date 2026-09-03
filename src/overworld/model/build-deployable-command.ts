import type { Command } from "../../core/model/command";
import type { DeployableTypeId } from "./deployable-type";
import type { RegionId } from "./region";

// ===========================================
// Build deployable
// ===========================================

/** Command type that buys an installation for a region (GDD §5.6). */
export const BUILD_DEPLOYABLE = "overworld:build-deployable";

/** Which type to build and where. */
export interface BuildDeployablePayload {
  readonly typeId: DeployableTypeId;
  readonly regionId: RegionId;
}

/** Charges the build cost and adds an online installation to the region. */
export type BuildDeployableCommand = Command<
  typeof BUILD_DEPLOYABLE,
  BuildDeployablePayload
>;

/** Builds a `BuildDeployable` command. */
export function buildDeployable(
  typeId: DeployableTypeId,
  regionId: RegionId,
): BuildDeployableCommand {
  return { type: BUILD_DEPLOYABLE, payload: { typeId, regionId } };
}

// ===========================================
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [BUILD_DEPLOYABLE]: BuildDeployableCommand;
  }
}
