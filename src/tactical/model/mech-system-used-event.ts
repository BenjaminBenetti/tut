import type { DomainEvent } from "../../core/model/domain-event";
import type { MechAction } from "./mech-action-command";

export const MECH_SYSTEM_USED = "tactical:mech-system-used";
/** Announces a mech's tactical system use without inventing a weapon attack. */
export type MechSystemUsedEvent = DomainEvent<
  typeof MECH_SYSTEM_USED,
  {
    readonly unitId: string;
    readonly action: MechAction;
    readonly targetId?: string;
  }
>;
declare module "./tactical-event" {
  interface TacticalEventMap {
    [MECH_SYSTEM_USED]: MechSystemUsedEvent;
  }
}
