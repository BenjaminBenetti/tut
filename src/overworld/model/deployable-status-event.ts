import type { DomainEvent } from "../../core/model/domain-event";
import type { DeployableId } from "./deployable";
import type { DeployableTypeId } from "./deployable-type";
import type { RegionId } from "./region";

// ===========================================
// Deployable offline / online
// ===========================================

/** What presentation needs to point at an installation that changed status. */
export interface DeployableStatusPayload {
  readonly deployableId: DeployableId;
  readonly typeId: DeployableTypeId;
  readonly regionId: RegionId;
}

/** Event type emitted when upkeep cannot be paid and an installation stops acting. */
export const DEPLOYABLE_OFFLINE = "overworld:deployable-offline";

/** An installation went offline because its upkeep was unaffordable (GDD §5.6). */
export type DeployableOfflineEvent = DomainEvent<
  typeof DEPLOYABLE_OFFLINE,
  DeployableStatusPayload
>;

/** Event type emitted when an offline installation's upkeep is paid again. */
export const DEPLOYABLE_ONLINE = "overworld:deployable-online";

/** An offline installation came back online because its upkeep was paid. */
export type DeployableOnlineEvent = DomainEvent<
  typeof DEPLOYABLE_ONLINE,
  DeployableStatusPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./overworld-domain-event" {
  interface OverworldEventMap {
    [DEPLOYABLE_OFFLINE]: DeployableOfflineEvent;
    [DEPLOYABLE_ONLINE]: DeployableOnlineEvent;
  }
}
