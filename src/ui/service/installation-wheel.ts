import type { DeployableId } from "../../overworld/model/deployable";
import type { DeployableTypeCatalogue } from "../../overworld/model/deployable-type-catalogue";
import { levelSpec } from "../../overworld/model/deployable-type";
import {
  describeDeployableEffect,
  summarizeDeployableEffect,
} from "../../overworld/service/deployable-effect-describer";
import type { GameState } from "../../save/model/game-state";
import type { RadialMenuHub, RadialMenuItem } from "../view/radial-menu-view";
import { formatCredits } from "./format";

// ===========================================
// Types
// ===========================================

/** What the installation wheel shows: the level at the centre and the choices around it. */
export interface InstallationWheel {
  readonly hub: RadialMenuHub;
  readonly items: readonly RadialMenuItem[];
}

/** What picking an entry on the wheel means. */
export type InstallationWheelChoice =
  | { readonly kind: "upgrade" }
  | { readonly kind: "decommission" }
  | { readonly kind: "region" };

// ===========================================
// Constants
// ===========================================

/** Item id of the entry that raises the installation one level. */
export const INSTALLATION_WHEEL_UPGRADE_ITEM = "upgrade";

/** Item id of the entry that removes the installation. */
export const INSTALLATION_WHEEL_DECOMMISSION_ITEM = "decommission";

/** Item id of the entry that takes the player to the region panel. */
export const INSTALLATION_WHEEL_REGION_ITEM = "region";

/** Why Upgrade is disabled at the top of the ladder. */
export const MAX_LEVEL_REASON = "Max level";

// ===========================================
// Building
// ===========================================

/**
 * The wheel that opens at an installation on the strategic map
 * (#1155): its level at the hub over `type · online|offline`, with
 * what it does at that level as the hub's note; on the ring, Upgrade
 * with the next level's price (primary while affordable, disabled with
 * the reason otherwise, and disabled as `Max level` at L3),
 * Decommission with the upkeep it would stop, and Region, which leads
 * to the Situation panel. Pure: state in, ring out; the screen maps a
 * choice back through `installationWheelChoice`.
 *
 * ```
 *                 ( Upgrade  L2 · ¢1,500 )
 *   hub: L1 / Defensive battery · online
 *        1 garrison turret on every mission map
 *   ( Region )              ( Decommission  stops ¢50/day )
 * ```
 *
 * @returns Undefined when the installation is not in the campaign.
 */
export function buildInstallationWheel(
  state: GameState,
  deployableId: DeployableId,
  catalogue: DeployableTypeCatalogue,
): InstallationWheel | undefined {
  const deployable = state.overworld.deployables.find(
    (d) => d.id === deployableId,
  );
  const type = deployable
    ? catalogue.getDeployableType(deployable.typeId)
    : undefined;
  if (!deployable || !type) {
    return undefined;
  }
  const described = describeDeployableEffect(type, deployable.level);
  const credits = state.economy.credits;
  const upgrade: RadialMenuItem = described.next
    ? credits >= described.next.cost
      ? {
          id: INSTALLATION_WHEEL_UPGRADE_ITEM,
          label: "Upgrade",
          icon: "advance",
          detail: `L${String(described.next.level)} · ${formatCredits(described.next.cost)}`,
          primary: true,
        }
      : {
          id: INSTALLATION_WHEEL_UPGRADE_ITEM,
          label: "Upgrade",
          icon: "advance",
          detail: `L${String(described.next.level)} · ${formatCredits(described.next.cost)}`,
          disabled: true,
          reason: `Need ${formatCredits(described.next.cost)}, have ${formatCredits(credits)}`,
        }
    : {
        id: INSTALLATION_WHEEL_UPGRADE_ITEM,
        label: "Upgrade",
        icon: "advance",
        disabled: true,
        reason: MAX_LEVEL_REASON,
      };
  const items: RadialMenuItem[] = [
    upgrade,
    {
      id: INSTALLATION_WHEEL_DECOMMISSION_ITEM,
      label: "Decommission",
      icon: "close",
      detail: `stops ${formatCredits(levelSpec(type, deployable.level).upkeepPerDay)}/day`,
    },
    { id: INSTALLATION_WHEEL_REGION_ITEM, label: "Region", icon: "region" },
  ];
  return {
    hub: {
      value: `L${String(deployable.level)}`,
      caption: `${type.name} · ${deployable.online ? "online" : "offline"}`,
      tone: deployable.online ? "ok" : "warn",
      note: summarizeDeployableEffect(type, deployable.level),
    },
    items,
  };
}

/** Maps an item id reported by the ring back to what it stands for; undefined for an unknown id. */
export function installationWheelChoice(
  itemId: string,
): InstallationWheelChoice | undefined {
  switch (itemId) {
    case INSTALLATION_WHEEL_UPGRADE_ITEM:
      return { kind: "upgrade" };
    case INSTALLATION_WHEEL_DECOMMISSION_ITEM:
      return { kind: "decommission" };
    case INSTALLATION_WHEEL_REGION_ITEM:
      return { kind: "region" };
    default:
      return undefined;
  }
}
