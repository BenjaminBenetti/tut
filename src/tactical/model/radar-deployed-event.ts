import type { DomainEvent } from "../../core/model/domain-event";
import type { Radar } from "./radar";
import type { UnitId } from "./unit";

/** A squad successfully placed its scanner. */
export const RADAR_DEPLOYED = "tactical:radar-deployed";

/** Deployment feedback, with the position and radius that actually applied. */
export type RadarDeployedEvent = DomainEvent<
  typeof RADAR_DEPLOYED,
  { readonly unitId: UnitId; readonly radar: Radar }
>;

declare module "./tactical-event" {
  interface TacticalEventMap {
    [RADAR_DEPLOYED]: RadarDeployedEvent;
  }
}
